-- Submitted events (phase D). Run once in the Supabase dashboard: SQL Editor, New query, paste, Run.
--
-- Then add each admin, in the SQL Editor (kept out of this file because the repository is public):
--   insert into public.admins (email) values ('netid@illinois.edu');
-- To remove one:
--   delete from public.admins where email = 'netid@illinois.edu';

-- Who may approve events. Students and admins sign in the same way; being on this list is the only
-- difference. No policies are defined, so the website can't read or change this table at all.
create table if not exists public.admins (
  email text primary key check (email = lower(email))
);

alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where email = lower(auth.jwt() ->> 'email'));
$$;

revoke execute on function public.is_site_admin() from public, anon;
grant execute on function public.is_site_admin() to authenticated;

-- One row per submitted event. Deleting an account keeps its events on the site, without the link to it.
create table if not exists public.submitted_events (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid default auth.uid() references auth.users (id) on delete set null,
  title text not null check (length(title) between 1 and 150),
  club text not null check (length(club) between 1 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null check (length(location) between 1 and 150),
  food text not null check (length(food) between 1 and 100),
  event_type text not null default '' check (length(event_type) <= 60),
  url text check (url is null or (url like 'https://%' and length(url) <= 500)),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  check (ends_at > starts_at and ends_at <= starts_at + interval '1 day')
);

alter table public.submitted_events enable row level security;

-- Students see their own submissions; admins see everyone's.
create policy "Students see their submissions and admins see all" on public.submitted_events
  for select to authenticated
  using ((select auth.uid()) = submitted_by or (select public.is_site_admin()));

-- A rule on this table can't query the table itself (Postgres sees that as infinite recursion), so the
-- count for the rule below runs in a function that skips the table's rules.
create or replace function public.my_pending_submission_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.submitted_events where submitted_by = auth.uid() and status = 'pending';
$$;

revoke execute on function public.my_pending_submission_count() from public, anon;
grant execute on function public.my_pending_submission_count() to authenticated;

-- Students submit as themselves, for an event that hasn't ended and is within about three months,
-- with at most 10 waiting for review at a time so one account can't flood the review page.
create policy "Students submit upcoming events" on public.submitted_events
  for insert to authenticated
  with check (
    (select auth.uid()) = submitted_by
    and ends_at > now()
    and starts_at < now() + interval '91 days'
    and public.my_pending_submission_count() < 10
  );

-- Only these columns can be set when submitting, so nobody can submit an event as already approved.
-- Nobody gets direct update rights: a decision can only be made through review_submission below.
revoke all on public.submitted_events from anon, authenticated;
grant select on public.submitted_events to authenticated;
grant insert (title, club, starts_at, ends_at, location, food, event_type, url) on public.submitted_events to authenticated;

-- Approves or rejects a pending event, or takes an approved one back off the site. Returns false if
-- the event's state has changed, such as another admin having just decided on it.
create or replace function public.review_submission(submission_id uuid, decision text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_site_admin() then
    raise exception 'Only admins can review submissions' using errcode = '42501';
  end if;
  if decision not in ('approved', 'rejected') then
    raise exception 'Unknown decision' using errcode = '22023';
  end if;
  update public.submitted_events
    set status = decision, reviewed_by = auth.uid(), reviewed_at = now()
    where id = submission_id
      and (status = 'pending' or (status = 'approved' and decision = 'rejected'));
  return found;
end;
$$;

revoke execute on function public.review_submission(uuid, text) from public, anon;
grant execute on function public.review_submission(uuid, text) to authenticated;

-- How many events are waiting, for the admin's menu. Null for anyone who isn't an admin.
create or replace function public.pending_submission_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_site_admin() then (
    select count(*)::integer from public.submitted_events where status = 'pending' and ends_at > now()
  ) end;
$$;

revoke execute on function public.pending_submission_count() from public, anon;
grant execute on function public.pending_submission_count() to authenticated;

-- What the scheduled fetch reads: approved events only, without who submitted or reviewed them.
-- Includes events that ended in the last day so "Earlier today" can still list them.
create or replace function public.approved_submissions()
returns table (
  id uuid, title text, club text, starts_at timestamptz, ends_at timestamptz,
  location text, food text, event_type text, url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select id, title, club, starts_at, ends_at, location, food, event_type, url
  from public.submitted_events
  where status = 'approved' and ends_at > now() - interval '1 day';
$$;

revoke execute on function public.approved_submissions() from public;
grant execute on function public.approved_submissions() to anon, authenticated;

-- Every morning, delete submissions a week after their event ended, approved or not.
select cron.schedule(
  'delete-old-submitted-events',
  '5 9 * * *',
  $$delete from public.submitted_events where ends_at < now() - interval '7 days'$$
);
