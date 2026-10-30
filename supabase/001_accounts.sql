-- Accounts (phase A). Run once in the Supabase dashboard: SQL Editor, New query, paste, Run.
-- Then turn on the hook: Authentication, Auth Hooks, "Before User Created", choose
-- public.only_illinois_emails.

-- Refuses any new account whose email isn't @illinois.edu. This runs inside Supabase before an
-- account is created, so it can't be bypassed from the website.
create or replace function public.only_illinois_emails(event jsonb)
returns jsonb
language plpgsql
as $$
begin
  if lower(split_part(event -> 'user' ->> 'email', '@', 2)) = 'illinois.edu' then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object(
      'message', 'Only @illinois.edu accounts can sign in.',
      'http_code', 403
    )
  );
end;
$$;

grant execute on function public.only_illinois_emails(jsonb) to supabase_auth_admin;
revoke execute on function public.only_illinois_emails(jsonb) from authenticated, anon, public;

-- Lets a signed-in student delete their own account, and only their own. Supabase removes their
-- sign-in records along with it.
create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- A tiny query the scheduled fetch runs so the free project counts as active and isn't paused
-- after a week without visitors signing in.
create or replace function public.keep_awake()
returns timestamptz
language sql
as $$
  select now();
$$;

grant execute on function public.keep_awake() to anon;
