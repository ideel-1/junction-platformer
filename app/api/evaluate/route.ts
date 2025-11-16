import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type EvaluateRequestBody = {
  text: string;
  prompt: string | null;
  keywords?: string[];
};

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY" },
      { status: 500 }
    );
  }

  let body: EvaluateRequestBody;
  try {
    body = (await req.json()) as EvaluateRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { text, prompt, keywords = [] } = body;

  if (!text || !text.trim()) {
    // empty text: deterministic 0 score
    return NextResponse.json(
      {
        score: 0,
        comment: "No meaningful content was provided.",
      },
      { status: 200 }
    );
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const systemInstruction = `
You are an evaluator of corporate, LinkedIn-style writing.

You MUST respond ONLY with a single valid JSON object, with this exact shape:
{
  "score": number,  // 0 to 10
  "comment": string // 1-2 short sentences of feedback
}

Scoring guidelines:
- 0–2: Not corporate at all, sloppy, or irrelevant
- 3–5: Somewhat corporate, basic or generic
- 6–8: Clearly corporate LinkedIn-style tone, structured, uses some jargon
- 9–10: Very strong LinkedIn-corporate tone, confident, structured, uses jargon and "impact" language in a natural way

Consider:
- Tone: corporate, professional, LinkedIn-y
- Structure: intro, outcome, "grateful"/"excited" style is good
- Jargon & buzzwords: "impact", "value", "align", "stakeholders", "journey", etc.
- Clarity and grammar: better writing can get higher scores
- Keywords: if supplied, using them meaningfully in context is a positive signal
`;

  const userInstruction = `
Here is the context of the task:

Original prompt to the player:
${prompt ?? "(no specific prompt provided)"}

Target keywords (if any):
${keywords.length ? keywords.join(", ") : "(none)"}

Player text to evaluate:
"""${text}"""

Return ONLY a JSON object with "score" (0-10) and "comment".
`;

  try {
    const completion = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: userInstruction },
      ],
      temperature: 0.4,
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    let parsed: { score?: number; comment?: string };

    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }

    let rawScore = typeof parsed.score === "number" ? parsed.score : 0;
    if (rawScore < 0) rawScore = 0;
    if (rawScore > 10) rawScore = 10;

    const score = Math.round(rawScore * 10) / 10;

    return NextResponse.json(
      {
        score,
        comment:
          parsed.comment ??
          "Evaluation completed, but no specific feedback was provided.",
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("OpenAI evaluation error:", err);
    // Fallback: neutral mid-score if evaluation fails
    return NextResponse.json(
      {
        score: 5,
        comment:
          "Automatic evaluation failed; a neutral score has been assigned.",
      },
      { status: 200 }
    );
  }
}
