-- "Mastered" lets the user permanently retire an item from showing up as
-- its own flashcard (multiple choice or word order) once they're well past
-- needing to be quizzed on it — distinct from SM-2 scheduling, which just
-- pushes the next review further out but never stops asking. The item's
-- Arabic can still appear as word-order filler or inside another phrase;
-- only its own standalone card is suppressed (see startSession() and the
-- continue-prompt pools in js/app.js).

alter table public.progress
  add column if not exists mastered boolean not null default false;

-- Widen the last_result check to allow 'mastered' without invalidating any
-- existing rows (dynamic lookup since the original migration left the
-- constraint unnamed, so Postgres' auto-generated name isn't guaranteed).
do $$
declare
  conname text;
begin
  select con.conname into conname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'progress'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%last_result%';

  if conname is not null then
    execute format('alter table public.progress drop constraint %I', conname);
  end if;
end $$;

alter table public.progress
  add constraint progress_last_result_check
  check (last_result in ('again', 'hard', 'good', 'easy', 'mastered'));
