-- Arabiska: per-user SRS review state + daily activity log.
-- Vocab/grammar content itself is NOT stored here — it ships as static JSON
-- with the app (data/vocab.json). These tables hold only the user's progress
-- against that content, keyed by the content item's string id (e.g. "b1-001").

create table public.progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  repetitions integer not null default 0,
  ease_factor numeric not null default 2.5,
  interval_days numeric not null default 0,
  due_at timestamptz not null default now(),
  last_result text check (last_result in ('again', 'hard', 'good', 'easy')),
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create index progress_due_idx on public.progress (user_id, due_at);

alter table public.progress enable row level security;

create policy "users manage their own progress"
  on public.progress
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- One row per user per calendar day: drives streaks and the
-- "see at least one new word most days" pacing rule.
create table public.daily_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  new_items_count integer not null default 0,
  reviewed_items_count integer not null default 0,
  primary key (user_id, day)
);

alter table public.daily_log enable row level security;

create policy "users manage their own daily log"
  on public.daily_log
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
