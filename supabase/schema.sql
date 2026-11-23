create table if not exists public.fitness_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('parent', 'child')),
  parent_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint fitness_accounts_role_parent_check
    check ((role = 'parent' and parent_id is null) or (role = 'child' and parent_id is not null))
);

create table if not exists public.child_invites (
  invite_code uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  claimed_at timestamptz,
  claimed_by uuid references auth.users (id) on delete set null
);

alter table public.fitness_accounts enable row level security;
alter table public.child_invites enable row level security;

grant select on table public.fitness_accounts to authenticated;

drop policy if exists "Users can view their account and linked children" on public.fitness_accounts;
create policy "Users can view their account and linked children"
  on public.fitness_accounts for select
  to authenticated
  using (user_id = (select auth.uid()) or parent_id = (select auth.uid()));

create table if not exists public.fitness_challenges (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.fitness_challenges enable row level security;
grant select, insert, update, delete on table public.fitness_challenges to authenticated;

update public.fitness_challenges
set state = state - 'pin'
where state ? 'pin';

drop policy if exists "Users can read their own challenge" on public.fitness_challenges;
drop policy if exists "Parents and linked children can read challenge" on public.fitness_challenges;
create policy "Parents and linked children can read challenge"
  on public.fitness_challenges for select
  to authenticated
  using (
    exists (
      select 1 from public.fitness_accounts account
      where account.user_id = (select auth.uid())
        and account.role = 'parent'
        and account.user_id = fitness_challenges.user_id
    )
    or exists (
      select 1 from public.fitness_accounts account
      where account.user_id = (select auth.uid())
        and account.role = 'child'
        and account.parent_id = fitness_challenges.user_id
    )
  );

drop policy if exists "Users can create their own challenge" on public.fitness_challenges;
drop policy if exists "Parents can create their challenge" on public.fitness_challenges;
create policy "Parents can create their challenge"
  on public.fitness_challenges for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.fitness_accounts account
      where account.user_id = (select auth.uid()) and account.role = 'parent'
    )
  );

drop policy if exists "Users can update their own challenge" on public.fitness_challenges;
drop policy if exists "Parents can update their challenge" on public.fitness_challenges;
create policy "Parents can update their challenge"
  on public.fitness_challenges for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.fitness_accounts account
      where account.user_id = (select auth.uid()) and account.role = 'parent'
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.fitness_accounts account
      where account.user_id = (select auth.uid()) and account.role = 'parent'
    )
  );

drop policy if exists "Users can delete their own challenge" on public.fitness_challenges;
drop policy if exists "Parents can delete their challenge" on public.fitness_challenges;
create policy "Parents can delete their challenge"
  on public.fitness_challenges for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.fitness_accounts account
      where account.user_id = (select auth.uid()) and account.role = 'parent'
    )
  );

create or replace function public.create_parent_account()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select role into existing_role
  from public.fitness_accounts
  where user_id = auth.uid();

  if existing_role is null then
    insert into public.fitness_accounts (user_id, role)
    values (auth.uid(), 'parent')
    on conflict (user_id) do nothing;
    existing_role := 'parent';
  end if;

  return existing_role;
end;
$$;

create or replace function public.create_child_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  code uuid;
begin
  if not exists (
    select 1 from public.fitness_accounts
    where user_id = auth.uid() and role = 'parent'
  ) then
    raise exception 'Parent account required';
  end if;

  insert into public.child_invites (parent_id)
  values (auth.uid())
  returning invite_code into code;

  return code::text;
end;
$$;

create or replace function public.link_child_account(p_invite_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_role text;
  invite_parent uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select role into existing_role
  from public.fitness_accounts
  where user_id = auth.uid();

  if existing_role is not null then
    return existing_role;
  end if;

  select parent_id into invite_parent
  from public.child_invites
  where invite_code::text = p_invite_code
    and claimed_at is null
    and expires_at > now()
  for update;

  if invite_parent is null then
    raise exception 'Invite code is invalid, expired, or already used';
  end if;

  if not exists (
    select 1 from public.fitness_accounts
    where user_id = invite_parent and role = 'parent'
  ) then
    raise exception 'The inviting parent account is unavailable';
  end if;

  insert into public.fitness_accounts (user_id, role, parent_id)
  values (auth.uid(), 'child', invite_parent);

  update public.child_invites
  set claimed_at = now(), claimed_by = auth.uid()
  where invite_code::text = p_invite_code;

  return 'child';
end;
$$;

drop function if exists public.submit_workout(integer, text);
create or replace function public.submit_workout(
  p_week_number integer,
  p_workout_id text,
  p_completed_day text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge_owner uuid;
  week_index integer;
  week_is_paused boolean;
  week_start_date date;
  workout_index integer;
  workout_status text;
  workout_path text[];
begin
  select parent_id into challenge_owner
  from public.fitness_accounts
  where user_id = auth.uid() and role = 'child';

  if challenge_owner is null then
    raise exception 'Linked child account required';
  end if;
  if p_completed_day is null or p_completed_day not in (
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
  ) then
    raise exception 'A valid completed weekday is required';
  end if;

  select (week_item.ordinality - 1)::integer,
         coalesce((week_item.value ->> 'paused')::boolean, false),
         coalesce(
           (week_item.value ->> 'startDate')::date,
           (challenge.state ->> 'startDate')::date +
             (((week_item.value ->> 'number')::integer - 1) * 7)
         )
  into week_index, week_is_paused, week_start_date
  from public.fitness_challenges challenge,
       jsonb_array_elements(challenge.state -> 'weeks') with ordinality as week_item(value, ordinality)
  where challenge.user_id = challenge_owner
    and (week_item.value ->> 'number')::integer = p_week_number;

  if week_index is null then
    raise exception 'Challenge week not found';
  end if;
  if week_is_paused then
    raise exception 'This challenge week is paused';
  end if;
  if week_start_date > current_date then
    raise exception 'This challenge week has not started yet';
  end if;

  select (workout_item.ordinality - 1)::integer,
         workout_item.value ->> 'status'
  into workout_index, workout_status
  from public.fitness_challenges challenge,
       jsonb_array_elements(
         challenge.state -> 'weeks' -> week_index -> 'workouts'
       ) with ordinality as workout_item(value, ordinality)
  where challenge.user_id = challenge_owner
    and workout_item.value ->> 'id' = p_workout_id;

  if workout_index is null then
    raise exception 'Workout not found';
  end if;

  if workout_status in ('approved', 'pending') then
    return;
  end if;

  workout_path := array['weeks', week_index::text, 'workouts', workout_index::text];
  update public.fitness_challenges
  set state = jsonb_set(
        state,
        workout_path,
        (state #> workout_path) || jsonb_build_object(
          'status', 'pending',
          'submittedAt', to_jsonb(now()::text),
          'completedDay', p_completed_day
        ),
        false
      ),
      updated_at = now()
  where user_id = challenge_owner;
end;
$$;

create or replace function public.edit_child_workout(
  p_week_number integer,
  p_workout_id text,
  p_title text,
  p_description text,
  p_duration integer,
  p_instructions jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge_owner uuid;
  week_index integer;
  week_is_paused boolean;
  week_start_date date;
  workout_index integer;
  workout_status text;
  workout_path text[];
begin
  select parent_id into challenge_owner
  from public.fitness_accounts
  where user_id = auth.uid() and role = 'child';

  if challenge_owner is null then
    raise exception 'Linked child account required';
  end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 120 or
     p_description is null or length(btrim(p_description)) not between 1 and 1200 or
     p_duration is null or p_duration not between 1 and 240 then
    raise exception 'Session details are invalid';
  end if;
  if p_instructions is null or jsonb_typeof(p_instructions) is distinct from 'array' then
    raise exception 'Session notes must be a JSON array';
  end if;
  if jsonb_array_length(p_instructions) not between 1 and 8 then
    raise exception 'Session notes must contain between 1 and 8 steps';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_instructions) as step(value)
    where jsonb_typeof(step.value) <> 'string'
       or length(btrim(step.value #>> '{}')) not between 1 and 240
  ) then
    raise exception 'Session notes contain an invalid step';
  end if;

  select (week_item.ordinality - 1)::integer,
         coalesce((week_item.value ->> 'paused')::boolean, false),
         coalesce(
           (week_item.value ->> 'startDate')::date,
           (challenge.state ->> 'startDate')::date +
             (((week_item.value ->> 'number')::integer - 1) * 7)
         )
  into week_index, week_is_paused, week_start_date
  from public.fitness_challenges challenge,
       jsonb_array_elements(challenge.state -> 'weeks') with ordinality as week_item(value, ordinality)
  where challenge.user_id = challenge_owner
    and (week_item.value ->> 'number')::integer = p_week_number;

  if week_index is null then
    raise exception 'Challenge week not found';
  end if;
  if week_is_paused then
    raise exception 'This challenge week is paused';
  end if;
  if week_start_date > current_date then
    raise exception 'This challenge week has not started yet';
  end if;

  select (workout_item.ordinality - 1)::integer,
         workout_item.value ->> 'status'
  into workout_index, workout_status
  from public.fitness_challenges challenge,
       jsonb_array_elements(
         challenge.state -> 'weeks' -> week_index -> 'workouts'
       ) with ordinality as workout_item(value, ordinality)
  where challenge.user_id = challenge_owner
    and workout_item.value ->> 'id' = p_workout_id;

  if workout_index is null then
    raise exception 'Workout not found';
  end if;
  if workout_status is distinct from 'not-started' then
    raise exception 'Only unsubmitted workouts can be edited';
  end if;

  workout_path := array['weeks', week_index::text, 'workouts', workout_index::text];
  update public.fitness_challenges
  set state = jsonb_set(
        state,
        workout_path,
        (state #> workout_path) || jsonb_build_object(
          'title', btrim(p_title),
          'description', btrim(p_description),
          'duration', p_duration,
          'instructions', p_instructions
        ),
        false
      ),
      updated_at = now()
  where user_id = challenge_owner;
end;
$$;

revoke all on function public.create_parent_account() from public, anon;
revoke all on function public.create_child_invite() from public, anon;
revoke all on function public.link_child_account(text) from public, anon;
revoke all on function public.submit_workout(integer, text, text) from public, anon;
revoke all on function public.edit_child_workout(integer, text, text, text, integer, jsonb) from public, anon;

grant execute on function public.create_parent_account() to authenticated;
grant execute on function public.create_child_invite() to authenticated;
grant execute on function public.link_child_account(text) to authenticated;
grant execute on function public.submit_workout(integer, text, text) to authenticated;
grant execute on function public.edit_child_workout(integer, text, text, text, integer, jsonb) to authenticated;
