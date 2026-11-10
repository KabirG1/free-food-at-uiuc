-- Followed clubs' events in Google Calendar, and a record of what the site put in each student's calendar.
-- Run once in the Supabase dashboard: SQL Editor, New query, paste, Run. Needs 006 and 007 first.

-- The "Also add events from clubs I follow" switch on the Account page. Off until the student turns it on.
alter table public.google_calendars
  add column if not exists include_followed boolean not null default false;

create policy "Students change their own calendar settings" on public.google_calendars
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant update (include_followed) on public.google_calendars to authenticated;

-- One row per event the site put in a student's "Free Food @ UIUC" calendar: the copy it sent, and whether
-- it's marked "May be cancelled". Comparing these with what should be there (saved events, plus followed
-- clubs' events with the switch on) shows what to add, update, or remove. Rows go a week after the event
-- ends, and with the account (`on delete cascade`).
create table if not exists public.calendar_events (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_id text not null check (length(event_id) between 1 and 200),
  event jsonb not null check (pg_column_size(event) < 8000),
  ends_at timestamptz not null,
  marked_cancelled boolean not null default false,
  primary key (user_id, event_id)
);

-- Row level security: each student can see and change only their own rows.
alter table public.calendar_events enable row level security;

create policy "Students see their own calendar events" on public.calendar_events
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Students record their own calendar events" on public.calendar_events
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Students update their own calendar events" on public.calendar_events
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Students remove their own calendar events" on public.calendar_events
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.calendar_events from anon;
grant select, insert, update, delete on public.calendar_events to authenticated;

select cron.schedule(
  'delete-old-calendar-events',
  '0 9 * * *',
  $$delete from public.calendar_events where ends_at < now() - interval '7 days'$$
);

-- calendar_events replaces the flag 007 added to saved events, so undo that part of 007.
drop policy if exists "Students update their own saved events" on public.saved_events;
revoke update on public.saved_events from authenticated;
alter table public.saved_events drop column if exists calendar_marked_cancelled;
