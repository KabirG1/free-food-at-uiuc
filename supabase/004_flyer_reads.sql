-- Flyer reading limit (phase D). Run once in the Supabase dashboard: SQL Editor, New query, paste, Run.

-- How many flyers each student has had read today. Flyers themselves are never stored. The free Gemini
-- key has a shared limit, so this stops one account from using it all up. No policies are defined, so
-- the website can't read or change this table directly.
create table if not exists public.flyer_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  read_on date not null,
  reads integer not null default 1,
  primary key (user_id, read_on)
);

alter table public.flyer_reads enable row level security;
revoke all on public.flyer_reads from anon, authenticated;

-- Counts one read for the signed-in student. Returns false once they've reached today's limit of 10.
create or replace function public.claim_flyer_read()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  insert into public.flyer_reads as counted (user_id, read_on)
    values (auth.uid(), (now() at time zone 'America/Chicago')::date)
    on conflict (user_id, read_on) do update
      set reads = counted.reads + 1
      where counted.reads < 10;
  return found;
end;
$$;

revoke execute on function public.claim_flyer_read() from public, anon;
grant execute on function public.claim_flyer_read() to authenticated;

-- Every morning, clear counts from earlier days. They're only needed for the current day.
select cron.schedule(
  'delete-old-flyer-reads',
  '10 9 * * *',
  $$delete from public.flyer_reads where read_on < (now() at time zone 'America/Chicago')::date - 1$$
);
