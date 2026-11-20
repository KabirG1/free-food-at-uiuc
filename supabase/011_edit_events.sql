-- Editing submitted events. Run once in the Supabase dashboard: SQL Editor, New query, paste, Run.
-- Needs 009_club_managers.sql first.
--
-- Who can edit what:
--   - Admins: any event, waiting or on the site.
--   - A club's managers: any of that club's events on the site, posted by any manager or approved from a student.
--     The club itself can't be changed, since that would get around the check on who can post for which club.
--   - Students: their own submissions while they're still waiting for review. After approval, changes go through an admin.

-- Managers also need to read their club's events on the site, including ones another manager posted, to list and edit them.
drop policy if exists "Students see their submissions and admins see all" on public.submitted_events;
create policy "Students see their submissions, managers their clubs' events, admins all" on public.submitted_events
  for select to authenticated
  using (
    (select auth.uid()) = submitted_by
    or (select public.is_site_admin())
    or (status = 'approved' and public.is_club_manager(club))
  );

-- Changes an event's details. Returns false if the event no longer exists or can no longer be edited by this
-- person (e.g. it was approved while a student was editing it). The table's own checks cover lengths and times.
create or replace function public.update_submitted_event(
  event_id uuid, title text, club text, starts_at timestamptz, ends_at timestamptz,
  location text, food text, event_type text, url text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
  current_club text;
  current_submitter uuid;
  new_club text := update_submitted_event.club;
begin
  select ev.status, ev.club, ev.submitted_by into current_status, current_club, current_submitter
    from public.submitted_events as ev where ev.id = event_id;
  if current_status is null then
    return false;
  end if;

  if public.is_site_admin() then
    if current_status not in ('pending', 'approved') then
      return false;
    end if;
  elsif current_status = 'approved' and public.is_club_manager(current_club) then
    if public.club_key(new_club) <> public.club_key(current_club) then
      raise exception 'A club''s managers can''t move its events to another club' using errcode = '42501';
    end if;
    new_club := current_club;
  elsif current_status = 'pending' and current_submitter = auth.uid() then
    null;
  else
    return false;
  end if;

  if update_submitted_event.ends_at <= now() or update_submitted_event.starts_at >= now() + interval '91 days' then
    raise exception 'The event must be upcoming and within about three months' using errcode = '22023';
  end if;

  update public.submitted_events as ev
    set title = update_submitted_event.title,
        club = new_club,
        starts_at = update_submitted_event.starts_at,
        ends_at = update_submitted_event.ends_at,
        location = update_submitted_event.location,
        food = update_submitted_event.food,
        event_type = coalesce(update_submitted_event.event_type, ''),
        url = update_submitted_event.url
    where ev.id = event_id and ev.status = current_status;
  return found;
end;
$$;

revoke execute on function public.update_submitted_event(uuid, text, text, timestamptz, timestamptz, text, text, text, text) from public, anon;
grant execute on function public.update_submitted_event(uuid, text, text, timestamptz, timestamptz, text, text, text, text) to authenticated;
