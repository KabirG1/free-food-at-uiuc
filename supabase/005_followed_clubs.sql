-- Followed clubs (phase C). Run once in the Supabase dashboard: SQL Editor, New query, paste, Run.

-- One row per club a student follows, stored by name as the listing shows it, since OneIllinois and
-- student submissions share no club ID. The page treats names that differ only in capitals or spacing
-- as the same club. Deleting an account deletes its followed clubs too (`on delete cascade`).
create table if not exists public.followed_clubs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  club text not null check (length(club) between 1 and 200),
  followed_at timestamptz not null default now(),
  primary key (user_id, club)
);

-- Row level security: each student can see, add, and remove only their own followed clubs.
alter table public.followed_clubs enable row level security;

create policy "Students see the clubs they follow" on public.followed_clubs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Students follow clubs for themselves" on public.followed_clubs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Students unfollow their own clubs" on public.followed_clubs
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.followed_clubs from anon;
grant select, insert, delete on public.followed_clubs to authenticated;
