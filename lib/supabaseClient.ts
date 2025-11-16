// lib/supabaseClient.ts
"use client";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Named export "supabase" – this is what GameClient imports
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
