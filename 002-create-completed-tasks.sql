-- migrations/002-create-completed-tasks.sql
-- Creates completed_tasks table to track which user completed which task

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.completed_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  task_id text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS completed_tasks_user_idx ON public.completed_tasks (user_id);
CREATE INDEX IF NOT EXISTS completed_tasks_task_idx ON public.completed_tasks (task_id);
