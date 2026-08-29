-- migrations/003-neon-schema.sql
-- Cash Hub NG Neon PostgreSQL schema.
-- The three core tables are already created in the target Neon database.
-- This migration creates the auxiliary tables used by server.js.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  inviter_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  metadata jsonb
);

CREATE INDEX IF NOT EXISTS referrals_inviter_idx
  ON public.referrals (inviter_id);

CREATE INDEX IF NOT EXISTS referrals_referred_idx
  ON public.referrals (referred_user_id);

CREATE TABLE IF NOT EXISTS public.completed_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  task_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, task_id)
);

CREATE INDEX IF NOT EXISTS completed_tasks_user_idx
  ON public.completed_tasks (user_id);

CREATE INDEX IF NOT EXISTS completed_tasks_task_idx
  ON public.completed_tasks (task_id);
