// app/keywords.ts

export type Keyword = {
    id: string;
    word: string;
    colorClass: string; // e.g. "text-violet-600"
  };
  
  export const KEYWORD_POOL: Keyword[] = [
    { id: "value", word: "value", colorClass: "text-emerald-700" },
    { id: "embark", word: "embark", colorClass: "text-violet-700" },
    { id: "prosperous", word: "prosperous", colorClass: "text-amber-700" },
    { id: "impact", word: "impact", colorClass: "text-sky-700" },
    { id: "alignment", word: "alignment", colorClass: "text-indigo-700" },
    { id: "stakeholders", word: "stakeholders", colorClass: "text-rose-700" },
    { id: "journey", word: "journey", colorClass: "text-teal-700" },
    { id: "gratitude", word: "gratitude", colorClass: "text-amber-700" },
    { id: "resilient", word: "resilient", colorClass: "text-lime-700" },
    { id: "enable", word: "enable", colorClass: "text-sky-700" },
  ];
  