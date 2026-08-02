-- Supabase Dashboard > SQL Editor에서 한 번만 실행하세요.
-- 시연이 기록과 분리된 주윤이 전용 저장 공간입니다.
create table if not exists public.jooyoon_mission_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.jooyoon_mission_states enable row level security;

drop policy if exists "Users can read own jooyoon state" on public.jooyoon_mission_states;
create policy "Users can read own jooyoon state"
on public.jooyoon_mission_states for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own jooyoon state" on public.jooyoon_mission_states;
create policy "Users can insert own jooyoon state"
on public.jooyoon_mission_states for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own jooyoon state" on public.jooyoon_mission_states;
create policy "Users can update own jooyoon state"
on public.jooyoon_mission_states for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

do $$
begin
  alter publication supabase_realtime add table public.jooyoon_mission_states;
exception
  when duplicate_object then null;
end $$;
