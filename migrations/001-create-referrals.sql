-- migrations/001-create-referrals.sql
-- Create referrals table to record inviter -> referred relationships
-- Run this in your Supabase SQL editor or via migrations tooling.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  inviter_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  metadata jsonb
);

CREATE INDEX IF NOT EXISTS referrals_inviter_idx ON public.referrals (inviter_id);
CREATE INDEX IF NOT EXISTS referrals_referred_idx ON public.referrals (referred_user_id);
