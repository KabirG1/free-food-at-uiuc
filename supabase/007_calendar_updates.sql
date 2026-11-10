-- Updating Google Calendar copies of changed events. Run once in the Supabase dashboard: SQL Editor, New query, paste, Run.

-- Whether the student's Google Calendar copy of this saved event is marked "May be cancelled" (the event
-- disappeared from the listings before it ended), so the site doesn't mark it again on every visit.
alter table public.saved_events
  add column if not exists calendar_marked_cancelled boolean not null default false;

-- Students can update their own saved copy once their calendar has the latest details. Only these columns
-- can change; which event and which student a row belongs to can't.
create policy "Students update their own saved events" on public.saved_events
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant update (event, ends_at, calendar_marked_cancelled) on public.saved_events to authenticated;
