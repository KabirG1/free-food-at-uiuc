-- Co-managers (club registration, part 2). Run once in the Supabase dashboard: SQL Editor, New query, paste, Run.
-- Needs 009_club_managers.sql first.
--
-- A club's managers can invite other officers by Illinois email. The invited person sees the invitation on the
-- Manage a club page once they sign in, and becomes a manager when they accept. Any manager of a club can remove
-- any other (including themselves), and admins can still remove anyone.

-- An invitation is a row with the invited email and no account yet; accepting fills in the account.
alter table public.club_managers alter column user_id drop not null;

-- Who sent an invitation, shown to admins and the club's managers. Kept if the inviter's account is deleted.
alter table public.club_managers add column if not exists added_by uuid references auth.users (id) on delete set null;
alter table public.club_managers add column if not exists added_by_email text;

-- New states: invited (waiting for the person to accept), declined, and cancelled (withdrawn by a manager).
alter table public.club_managers drop constraint if exists club_managers_status_check;
alter table public.club_managers add constraint club_managers_status_check
  check (status in ('pending', 'approved', 'rejected', 'removed', 'invited', 'declined', 'cancelled'));

-- Invited managers have no role until they say; an empty role is shown as "Manager".
alter table public.club_managers drop constraint if exists club_managers_role_check;
alter table public.club_managers add constraint club_managers_role_check check (length(trim(role)) <= 60);

-- One active row per person per club, counting invitations, which have no account yet and so are matched by email.
create unique index if not exists club_managers_one_active_per_email
  on public.club_managers (email, public.club_key(club))
  where status in ('pending', 'approved', 'invited');

-- Besides their own rows (and admins seeing everything), students see who else manages or is invited to the clubs
-- they manage, and invitations sent to their own email.
drop policy if exists "Students see their requests and admins see all" on public.club_managers;
create policy "Students see their clubs' managers and their invitations" on public.club_managers
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or (select public.is_site_admin())
    or (status in ('approved', 'invited') and public.is_club_manager(club))
    or (status = 'invited' and email = lower((select auth.jwt()) ->> 'email'))
  );

-- A club's managers (and admins) invite someone by Illinois email, up to 10 managers and invitations per club.
-- Returns the invitation's id.
create or replace function public.invite_club_manager(club text, email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invited_email text := lower(trim(email));
  club_name text;
  new_id uuid;
begin
  if not public.is_club_manager(club) then
    raise exception 'Only this club''s managers can add managers' using errcode = '42501';
  end if;
  if invited_email !~ '^[^@\s]+@illinois\.edu$' then
    raise exception 'Enter an @illinois.edu email' using errcode = '22023';
  end if;
  -- The club's name as its managers have it, so everyone on the team shares one spelling.
  select manager.club into club_name from public.club_managers as manager
    where manager.status = 'approved' and public.club_key(manager.club) = public.club_key(invite_club_manager.club)
    order by manager.requested_at limit 1;
  club_name := coalesce(club_name, trim(invite_club_manager.club));
  if (select count(*) from public.club_managers as manager
      where public.club_key(manager.club) = public.club_key(club_name) and manager.status in ('approved', 'invited')) >= 10 then
    raise exception 'This club has 10 managers and invitations, the limit' using errcode = '54000';
  end if;
  insert into public.club_managers (user_id, email, club, role, status, added_by, added_by_email)
    values (null, invited_email, club_name, '', 'invited', auth.uid(), lower(auth.jwt() ->> 'email'))
    returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.invite_club_manager(text, text) from public, anon;
grant execute on function public.invite_club_manager(text, text) to authenticated;

-- The invited person accepts or declines. Returns false if the invitation is no longer open (e.g. it was cancelled).
create or replace function public.respond_to_invitation(invitation_id uuid, accept boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.club_managers
    set status = case when accept then 'approved' else 'declined' end,
        user_id = auth.uid(), decided_by = auth.uid(), decided_at = now()
    where id = invitation_id and status = 'invited' and email = lower(auth.jwt() ->> 'email');
  return found;
end;
$$;

revoke execute on function public.respond_to_invitation(uuid, boolean) from public, anon;
grant execute on function public.respond_to_invitation(uuid, boolean) to authenticated;

-- Any manager of a club (or an admin) removes a manager or cancels an invitation, including leaving themselves.
-- Their events stay up. Returns false if the row had already changed.
create or replace function public.remove_club_manager(manager_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  manager_club text;
begin
  select club into manager_club from public.club_managers where id = manager_id;
  if manager_club is null or not public.is_club_manager(manager_club) then
    raise exception 'Only this club''s managers can remove its managers' using errcode = '42501';
  end if;
  update public.club_managers
    set status = case when status = 'invited' then 'cancelled' else 'removed' end,
        decided_by = auth.uid(), decided_at = now()
    where id = manager_id and status in ('approved', 'invited');
  return found;
end;
$$;

revoke execute on function public.remove_club_manager(uuid) from public, anon;
grant execute on function public.remove_club_manager(uuid) to authenticated;
