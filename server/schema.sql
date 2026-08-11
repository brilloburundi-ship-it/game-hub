-- Game Hub production data model (provider-neutral SQL draft)
-- All IDs should be opaque UUIDs in production.

create table users (
  id text primary key,
  email text unique,
  display_name text,
  created_at timestamp not null default current_timestamp,
  deleted_at timestamp
);

create table workspaces (
  id text primary key,
  owner_user_id text not null references users(id),
  name text not null,
  plan_id text not null default 'free',
  founder_entitlement boolean not null default false,
  created_at timestamp not null default current_timestamp
);

create table workspace_members (
  workspace_id text not null references workspaces(id),
  user_id text not null references users(id),
  role text not null check (role in ('owner','admin','member')),
  created_at timestamp not null default current_timestamp,
  primary key (workspace_id, user_id)
);

create table github_connections (
  id text primary key,
  workspace_id text not null references workspaces(id),
  github_user_id text not null,
  github_login text not null,
  installation_id text,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamp,
  created_at timestamp not null default current_timestamp,
  revoked_at timestamp
);

create table projects (
  id text primary key,
  workspace_id text not null references workspaces(id),
  github_connection_id text references github_connections(id),
  name text not null,
  slug text not null,
  repository_full_name text not null,
  branch text not null default 'main',
  root_path text not null default '',
  visibility text not null default 'private' check (visibility in ('private','public')),
  preview_visibility text not null default 'private' check (preview_visibility in ('private','public')),
  stable_preview_url text,
  public_url text,
  created_at timestamp not null default current_timestamp,
  archived_at timestamp,
  unique (workspace_id, slug)
);

create table deployments (
  id text primary key,
  project_id text not null references projects(id),
  commit_sha text not null,
  environment text not null check (environment in ('preview','production')),
  status text not null,
  url text,
  provider text,
  created_at timestamp not null default current_timestamp,
  completed_at timestamp
);

create table build_events (
  id text primary key,
  project_id text not null references projects(id),
  commit_sha text,
  status text not null,
  message text,
  log_reference text,
  created_at timestamp not null default current_timestamp
);

create table subscriptions (
  id text primary key,
  workspace_id text not null references workspaces(id),
  plan_id text not null,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  status text not null,
  current_period_end timestamp,
  created_at timestamp not null default current_timestamp
);

create table audit_events (
  id text primary key,
  workspace_id text references workspaces(id),
  actor_user_id text references users(id),
  event_type text not null,
  target_type text,
  target_id text,
  metadata_json text,
  created_at timestamp not null default current_timestamp
);

create index idx_projects_workspace on projects(workspace_id);
create index idx_deployments_project on deployments(project_id, created_at);
create index idx_audit_workspace on audit_events(workspace_id, created_at);
