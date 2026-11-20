-- Club managers (club registration, part 1). Run once in the Supabase dashboard: SQL Editor, New query, paste, Run.
--
-- A club leader asks to manage their club, an admin checks the club's officer list on OneIllinois and approves,
-- and from then on the leader's events for that club go on the site without review. Admins can do everything a
-- manager can, for every club, and can remove any manager. Removing a manager leaves their events up.

-- Club names match the way the site matches them (src/events.ts clubKey): capitals and extra spaces ignored.
create or replace function public.club_key(club text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(trim(club), '\s+', ' ', 'g'));
$$;

-- One row per request. The email is saved with it because admins can't read the sign-in records, and they
-- need to know who is asking. Deleting an account deletes its requests and manager roles too.
create table if not exists public.club_managers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  email text not null default lower(auth.jwt() ->> 'email'),
  club text not null check (length(trim(club)) between 1 and 120),
  role text not null check (length(trim(role)) between 1 and 60),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'removed')),
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz
);

-- A student can't ask twice for a club they're waiting on or already manage. After a rejection or removal they can ask again.
create unique index if not exists club_managers_one_active_per_club
  on public.club_managers (user_id, public.club_key(club))
  where status in ('pending', 'approved');

alter table public.club_managers enable row level security;

-- Students see their own requests; admins see everyone's.
create policy "Students see their requests and admins see all" on public.club_managers
  for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_site_admin()));

-- Counted in a function that skips the table's rules, for the same reason as my_pending_submission_count.
create or replace function public.my_pending_manager_request_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.club_managers where user_id = auth.uid() and status = 'pending';
$$;

revoke execute on function public.my_pending_manager_request_count() from public, anon;
grant execute on function public.my_pending_manager_request_count() to authenticated;

-- Students ask as themselves, with at most 3 requests waiting at a time.
create policy "Students ask to manage clubs" on public.club_managers
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.my_pending_manager_request_count() < 3);

-- Only the club and role can be set, so nobody can ask and approve themselves in one go.
revoke all on public.club_managers from anon, authenticated;
grant select on public.club_managers to authenticated;
grant insert (club, role) on public.club_managers to authenticated;

-- True if the signed-in student manages `club`, or is an admin (who can act for every club).
create or replace function public.is_club_manager(club text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_site_admin() or exists (
    select 1 from public.club_managers as manager
    where manager.user_id = auth.uid()
      and manager.status = 'approved'
      and public.club_key(manager.club) = public.club_key(is_club_manager.club)
  );
$$;

revoke execute on function public.is_club_manager(text) from public, anon;
grant execute on function public.is_club_manager(text) to authenticated;

-- Admins decide on requests: approve or reject a pending one, or remove an approved manager. Returns false if the
-- request's state has already changed, such as another admin having just decided on it.
create or replace function public.decide_manager_request(request_id uuid, decision text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_site_admin() then
    raise exception 'Only admins can decide on club managers' using errcode = '42501';
  end if;
  if decision not in ('approved', 'rejected', 'removed') then
    raise exception 'Unknown decision' using errcode = '22023';
  end if;
  update public.club_managers
    set status = decision, decided_by = auth.uid(), decided_at = now()
    where id = request_id
      and ((status = 'pending' and decision in ('approved', 'rejected')) or (status = 'approved' and decision = 'removed'));
  return found;
end;
$$;

revoke execute on function public.decide_manager_request(uuid, text) from public, anon;
grant execute on function public.decide_manager_request(uuid, text) to authenticated;

-- Marks events that went on the site without review, so the Review and Submit pages can say so.
alter table public.submitted_events add column if not exists club_post boolean not null default false;

-- Puts a club's event straight on the site, for that club's managers and for admins. The same limits as a
-- student submission apply (upcoming, within about three months), and the table's own checks cover the rest.
create or replace function public.post_club_event(
  title text, club text, starts_at timestamptz, ends_at timestamptz,
  location text, food text, event_type text, url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not public.is_club_manager(club) then
    raise exception 'Only this club''s managers can post for it' using errcode = '42501';
  end if;
  if ends_at <= now() or starts_at >= now() + interval '91 days' then
    raise exception 'The event must be upcoming and within about three months' using errcode = '22023';
  end if;
  insert into public.submitted_events
    (submitted_by, title, club, starts_at, ends_at, location, food, event_type, url, status, reviewed_by, reviewed_at, club_post)
  values
    (auth.uid(), title, club, starts_at, ends_at, location, food, coalesce(event_type, ''), url, 'approved', auth.uid(), now(), true)
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.post_club_event(text, text, timestamptz, timestamptz, text, text, text, text) from public, anon;
grant execute on function public.post_club_event(text, text, timestamptz, timestamptz, text, text, text, text) to authenticated;

-- Lets a club's managers (and admins) take one of that club's events off the site. Returns false if it was
-- already off the site.
create or replace function public.take_down_club_event(event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_club text;
begin
  select club into event_club from public.submitted_events where id = event_id;
  if event_club is null or not public.is_club_manager(event_club) then
    raise exception 'Only this club''s managers can take its events down' using errcode = '42501';
  end if;
  update public.submitted_events
    set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
    where id = event_id and status = 'approved';
  return found;
end;
$$;

revoke execute on function public.take_down_club_event(uuid) from public, anon;
grant execute on function public.take_down_club_event(uuid) to authenticated;

-- Everything waiting for an admin (events and manager requests), for the account menu. Null for anyone else.
create or replace function public.pending_review_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_site_admin() then (
    (select count(*) from public.submitted_events where status = 'pending' and ends_at > now())
    + (select count(*) from public.club_managers where status = 'pending')
  )::integer end;
$$;

revoke execute on function public.pending_review_count() from public, anon;
grant execute on function public.pending_review_count() to authenticated;
