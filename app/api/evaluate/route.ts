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
You evaluate extremely short LinkedIn-style corporate status updates
written under a strict ~20 second time limit.

You MUST respond ONLY with a single valid JSON object, with this exact shape:
{
  "score": number,  // 0 to 10
  "comment": string // 1-2 short sentences of feedback
}

The player is typing quickly and will make shortcuts and small mistakes.
Do NOT grade as if this were a polished LinkedIn post.
Reward effort, keyword usage, and recognizable corporate tone.

Scoring rubric (maximum 10 points):

1) Keyword usage (0–4 points total)
   - +1.3 points for each target keyword used at least once in a meaningful way.
   - Cap the keyword-related contribution at 4 points total.

2) Corporate tone (0–3 points total)
   - Look for: professional tone, basic structure, gratitude/optimism, confidence.
   - Minor grammar issues, typos, and lack of perfect structure are acceptable.
   - If it clearly sounds like a LinkedIn-style update under time pressure,
     it should usually get 2–3 points here.

3) Relevance to prompt (0–2 points total)
   - If the text addresses the general theme of the prompt (even loosely),
     award 1.5–2 points.
   - Only give 0–1 if the response is clearly off-topic or nonsense.

4) Length / effort bonus (0–1 point total)
   - If the player wrote at least ~25 characters of meaningful text,
     award the full 1 point.
   - Do not overthink style; use this to reward genuine effort.

Interpret the rubric generously. This is a game and the writing happens fast.
Scores between 6 and 9 should be common when the player tries to follow the prompt
and uses some keywords.

Return ONLY a JSON object with "score" (0–10) and "comment".
`;

  const userInstruction = `
Here is the context of the task:

Original prompt to the player:
${prompt ?? "(no specific prompt provided)"}

Target keywords (if any):
${keywords.length ? keywords.join(", ") : "(none)"}

Player text to evaluate:
"""${text}"""

Follow the rubric above and return ONLY a JSON object with "score" (0-10) and "comment".
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

    // Base score from model
    let rawScore =
      typeof parsed.score === "number" && !Number.isNaN(parsed.score)
        ? parsed.score
        : 0;

    // Clamp to 0–10
    if (rawScore < 0) rawScore = 0;
    if (rawScore > 10) rawScore = 10;

    // --- Soft post-processing to avoid harsh punishment for good attempts ---

    const trimmed = text.trim();
    const lengthChars = trimmed.length;

    // How many keywords are actually used?
    const usedKeywordsCount =
      keywords.length === 0
        ? 0
        : keywords.filter((kw) =>
            trimmed.toLowerCase().includes(kw.toLowerCase())
          ).length;

    const keywordRatio =
      keywords.length > 0 ? usedKeywordsCount / keywords.length : 0;

    let adjustedScore = rawScore;

    // 1) If most keywords are used + decent length, enforce a reasonable minimum.
    if (keywords.length > 0 && keywordRatio >= 0.66 && lengthChars >= 40) {
      // The player clearly tried to follow constraints.
      if (adjustedScore < 6.5) {
        adjustedScore = 6.5;
      }
    }

    // 2) If there is non-trivial effort (length) but model was very harsh,
    //    gently bump up very low scores.
    if (lengthChars >= 25 && adjustedScore < 4) {
      adjustedScore = 4;
    }

    // Final clamp and rounding to 1 decimal
    if (adjustedScore < 0) adjustedScore = 0;
    if (adjustedScore > 10) adjustedScore = 10;

    const score = Math.round(adjustedScore * 10) / 10;

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
