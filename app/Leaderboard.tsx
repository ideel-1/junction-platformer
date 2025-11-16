// app/Leaderboard.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ScoreRow = {
  id: string;
  created_at: string;
  nickname: string | null;
  score: number;
};

export default function Leaderboard() {
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("game_scores")
        .select("id, created_at, nickname, score")
        .order("score", { ascending: false })
        .limit(10);

      if (error) {
        console.error(error);
      } else {
        setRows(data ?? []);
      }
      setLoading(false);
    }

    load();
  }, []);

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">Top scores</h2>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No scores yet.</p>
      ) : (
        <ol className="space-y-1 text-sm">
          {rows.map((row, index) => (
            <li
              key={row.id}
              className="flex items-center justify-between rounded px-2 py-1"
            >
              <span className="flex items-center gap-2">
                <span className="w-6 text-right text-xs font-semibold text-gray-500">
                  #{index + 1}
                </span>
                <span className="font-medium">
                  {row.nickname || "Anonymous"}
                </span>
              </span>
              <span className="font-mono">{row.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
