-- Saved events (phase B). Run once in the Supabase dashboard: SQL Editor, New query, paste, Run.

-- One row per event a student starred. `event` is a copy of the event as it was listed, because
-- OneIllinois drops events from its feed once they end, and the site's list only covers two weeks.
-- Deleting an account deletes its saved events too (`on delete cascade`).
create table if not exists public.saved_events (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_id text not null check (length(event_id) between 1 and 200),
  event jsonb not null check (pg_column_size(event) < 8000),
  ends_at timestamptz not null,
  saved_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

-- Row level security: each student can see, add, and remove only their own saved events.
alter table public.saved_events enable row level security;

create policy "Students see their own saved events" on public.saved_events
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Students save events for themselves" on public.saved_events
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Students remove their own saved events" on public.saved_events
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.saved_events from anon;
grant select, insert, delete on public.saved_events to authenticated;

-- Every morning, delete saved events that ended more than a week ago (Kabir's choice: ended events are
-- hidden right away but kept for a week). pg_cron runs the job inside Supabase, so nothing else has to.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'delete-old-saved-events',
  '0 9 * * *',
  $$delete from public.saved_events where ends_at < now() - interval '7 days'$$
);
