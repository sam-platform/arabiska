-- Streaks require finishing a whole day's set (the initial due+new batch,
-- including any wrong answers requeued to the end of it) — not just
-- answering a single question. new_items_count/reviewed_items_count alone
-- can't tell "answered one card" apart from "finished the set", so track it
-- explicitly.

alter table public.daily_log
  add column if not exists set_completed boolean not null default false;
