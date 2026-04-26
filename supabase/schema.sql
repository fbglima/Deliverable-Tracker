create extension if not exists pgcrypto;

do $$
begin
  create type public.workspace_role as enum ('admin', 'member');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete cascade,
  default_output_formats jsonb not null default '["H264 MP4", "ProRes MOV"]'::jsonb,
  settings_json jsonb not null default '{}'::jsonb
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  client_name text,
  campaign_name text,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tree_json jsonb not null,
  settings_json jsonb not null default '{}'::jsonb
);

create table if not exists public.matrix_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  notes text,
  source_or_reason text,
  tree_json jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_intakes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  input_type text not null,
  source_filename text,
  input_text text,
  analysis_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.exports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  snapshot_id uuid references public.matrix_snapshots(id) on delete set null,
  export_type text not null,
  export_settings_json jsonb not null default '{}'::jsonb,
  output_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
before update on public.projects
for each row execute function public.touch_updated_at();

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_admin(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'admin'
  );
$$;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.matrix_snapshots enable row level security;
alter table public.ai_intakes enable row level security;
alter table public.exports enable row level security;

drop policy if exists "members can read workspaces" on public.workspaces;
create policy "members can read workspaces"
on public.workspaces for select
using (public.is_workspace_member(id) or created_by = auth.uid());

drop policy if exists "users can create workspaces" on public.workspaces;
create policy "users can create workspaces"
on public.workspaces for insert
with check (created_by = auth.uid());

drop policy if exists "admins can update workspaces" on public.workspaces;
create policy "admins can update workspaces"
on public.workspaces for update
using (public.is_workspace_admin(id))
with check (public.is_workspace_admin(id));

drop policy if exists "admins can delete workspaces" on public.workspaces;
create policy "admins can delete workspaces"
on public.workspaces for delete
using (public.is_workspace_admin(id));

drop policy if exists "members can read memberships" on public.workspace_members;
create policy "members can read memberships"
on public.workspace_members for select
using (public.is_workspace_member(workspace_id) or user_id = auth.uid());

drop policy if exists "admins can invite members" on public.workspace_members;
create policy "admins can invite members"
on public.workspace_members for insert
with check (
  public.is_workspace_admin(workspace_id)
  or (
    user_id = auth.uid()
    and role = 'admin'
    and exists (
      select 1
      from public.workspaces w
      where w.id = workspace_id
        and w.created_by = auth.uid()
    )
  )
);

drop policy if exists "admins can update memberships" on public.workspace_members;
create policy "admins can update memberships"
on public.workspace_members for update
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

drop policy if exists "admins can remove memberships" on public.workspace_members;
create policy "admins can remove memberships"
on public.workspace_members for delete
using (public.is_workspace_admin(workspace_id));

drop policy if exists "members can read projects" on public.projects;
create policy "members can read projects"
on public.projects for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "members can create projects" on public.projects;
create policy "members can create projects"
on public.projects for insert
with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());

drop policy if exists "members can update projects" on public.projects;
create policy "members can update projects"
on public.projects for update
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "admins can delete projects" on public.projects;
create policy "admins can delete projects"
on public.projects for delete
using (public.is_workspace_admin(workspace_id));

drop policy if exists "members can read snapshots" on public.matrix_snapshots;
create policy "members can read snapshots"
on public.matrix_snapshots for select
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

drop policy if exists "members can create snapshots" on public.matrix_snapshots;
create policy "members can create snapshots"
on public.matrix_snapshots for insert
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.projects p
    where p.id = project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

drop policy if exists "members can read ai intakes" on public.ai_intakes;
create policy "members can read ai intakes"
on public.ai_intakes for select
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

drop policy if exists "members can create ai intakes" on public.ai_intakes;
create policy "members can create ai intakes"
on public.ai_intakes for insert
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.projects p
    where p.id = project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

drop policy if exists "members can read exports" on public.exports;
create policy "members can read exports"
on public.exports for select
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and public.is_workspace_member(p.workspace_id)
  )
);

drop policy if exists "members can create exports" on public.exports;
create policy "members can create exports"
on public.exports for insert
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.projects p
    where p.id = project_id
      and public.is_workspace_member(p.workspace_id)
  )
);
