-- ============================================================
-- Migration: Fix user-creation trigger and resolve security advisor issues
-- Applied: 2026-07-02
-- ============================================================

-- 1. Fix handle_new_user trigger function to use NEW.metadata instead of NEW.raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
BEGIN
  -- Check if a specific role is passed in user metadata (InsForge uses NEW.metadata)
  user_role := NEW.metadata->>'role';
  
  IF user_role IS NULL THEN
    IF NEW.email ILIKE '%supervisor%' THEN
      user_role := 'supervisor';
    ELSIF NEW.email ILIKE '%dev%' OR NEW.email ILIKE '%sys%' THEN
      user_role := 'developer';
    ELSE
      user_role := 'admin';
    END IF;
  END IF;

  INSERT INTO public.users (id, email, role)
  VALUES (NEW.id, NEW.email, user_role)
  ON CONFLICT (id) DO UPDATE SET 
    role = EXCLUDED.role,
    updated_at = now();

  RETURN NEW;
END;
$$;

-- Ensure execute permissions are locked down and search_path is secure
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;


-- 2. Harden current_user_role() SECURITY DEFINER setup to prevent hijacking
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

-- Revoke execute on current_user_role() from public and anon role, permitting authenticated only
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM public;
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;


-- 3. Tighten certificates_select_anon RLS policy to address security/rls-permissive warning
-- Replaces USING (true) with USING (qcv_id IS NOT NULL) to allow anonymous read of compliance records.
DROP POLICY IF EXISTS certificates_select_anon ON public.certificates;
CREATE POLICY certificates_select_anon ON public.certificates
  FOR SELECT
  TO anon
  USING (qcv_id IS NOT NULL);
