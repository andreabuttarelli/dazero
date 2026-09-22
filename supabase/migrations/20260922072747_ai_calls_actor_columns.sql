-- ai-log.ts writes actor_kind/actor_id/agent_key/project_id on every insert (canvas actors:
-- a run can be caused by an agent, not only a signed-in user). The self-host schema has no
-- projects table yet, so project_id stays a bare uuid — the same non-enforced pattern already
-- used for agent_runs.user_id.

alter table public.ai_calls
  add column if not exists actor_kind text not null default 'user',
  add column if not exists actor_id uuid,
  add column if not exists agent_key text,
  add column if not exists project_id uuid;
