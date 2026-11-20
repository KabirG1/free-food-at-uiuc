-- Club pages (club registration, part 3). Run once in the Supabase dashboard: SQL Editor, New query, paste, Run.
-- Needs 009_club_managers.sql first.
--
-- Every club with at least one manager has a page on the site. Its managers (and admins) can add a description,
-- an Instagram handle, and one more link. Removing a club's last manager hides the page but keeps what was written,
-- so it comes back if the club gets a manager again.

-- One row per club, keyed the way the site matches club names (capitals and extra spaces ignored).
create table if not exists public.club_profiles (
  club_key text primary key,
  description text not null default '' check (length(description) <= 500),
  instagram text not null default '' check (instagram = '' or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  website text not null default '' check (website = '' or (website like 'https://%' and length(website) <= 300)),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- Nobody reads or writes the table directly: everyone reads through club_pages and managers save through
-- save_club_profile, which check what's needed.
alter table public.club_profiles enable row level security;
revoke all on public.club_profiles from anon, authenticated;

-- Every club that has a page: the clubs with at least one manager, by name as their managers have it, with whatever
-- they've written. Public, since visitors who aren't signed in see club pages too. Nothing here is private.
create or replace function public.club_pages()
returns table (club text, description text, instagram text, website text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (public.club_key(manager.club))
    manager.club,
    coalesce(profile.description, ''),
    coalesce(profile.instagram, ''),
    coalesce(profile.website, '')
  from public.club_managers as manager
  left join public.club_profiles as profile on profile.club_key = public.club_key(manager.club)
  where manager.status = 'approved'
  order by public.club_key(manager.club), manager.requested_at;
$$;

revoke execute on function public.club_pages() from public;
grant execute on function public.club_pages() to anon, authenticated;

-- Saves a club's page, for its managers and admins. Empty text clears a field.
create or replace function public.save_club_profile(club text, description text, instagram text, website text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_club_manager(save_club_profile.club) then
    raise exception 'Only this club''s managers can change its page' using errcode = '42501';
  end if;
  insert into public.club_profiles as profile (club_key, description, instagram, website, updated_at, updated_by)
    values (
      public.club_key(save_club_profile.club),
      trim(coalesce(save_club_profile.description, '')),
      trim(coalesce(save_club_profile.instagram, '')),
      trim(coalesce(save_club_profile.website, '')),
      now(),
      auth.uid()
    )
    on conflict on constraint club_profiles_pkey do update
      set description = excluded.description,
          instagram = excluded.instagram,
          website = excluded.website,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by;
end;
$$;

revoke execute on function public.save_club_profile(text, text, text, text) from public, anon;
grant execute on function public.save_club_profile(text, text, text, text) to authenticated;
