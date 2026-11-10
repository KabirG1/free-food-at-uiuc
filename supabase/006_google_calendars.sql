-- Google Calendar sync (phase F). Run once in the Supabase dashboard: SQL Editor, New query, paste, Run.

-- One row per student who connected Google Calendar: the ID of the "Free Food @ UIUC" calendar the site
-- created in their Google account. No Google access tokens are stored; the page gets short-lived access
-- from Google each time it needs it. Deleting an account deletes this row too (`on delete cascade`).
create table if not exists public.google_calendars (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  calendar_id text not null check (length(calendar_id) between 1 and 300),
  connected_at timestamptz not null default now()
);

-- Row level security: each student can see, add, and remove only their own row.
alter table public.google_calendars enable row level security;

create policy "Students see their own calendar connection" on public.google_calendars
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Students connect their own calendar" on public.google_calendars
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Students disconnect their own calendar" on public.google_calendars
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.google_calendars from anon;
grant select, insert, delete on public.google_calendars to authenticated;
