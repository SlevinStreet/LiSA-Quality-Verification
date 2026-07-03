-- Migration: Fix anon role permissions for public verification portal
-- 
-- Root cause: public.current_user_role() is SECURITY DEFINER but anon role
-- lacks EXECUTE permission. When multiple RLS policies exist on 'certificates',
-- PostgreSQL evaluates all applicable policies. The authenticated policy calls
-- current_user_role() which anon cannot execute → 401 "permission denied for
-- function current_user_role".
--
-- Fix:
--   1. Grant EXECUTE on current_user_role() to anon and authenticated.
--   2. Ensure anon has SELECT on certificates and INSERT on verification_logs
--      (table-level grants, separate from RLS policies).
--   3. Wrap the anon SELECT policy so it short-circuits before touching
--      current_user_role() — using a permissive policy that returns TRUE for anon.

-- 1. Grant EXECUTE on the helper function to both runtime roles
GRANT EXECUTE ON FUNCTION public.current_user_role() TO anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

-- 2. Ensure table-level SELECT/INSERT grants exist for anon
GRANT SELECT ON public.certificates TO anon;
GRANT SELECT ON public.verification_logs TO anon;
GRANT INSERT ON public.verification_logs TO anon;

-- 3. Also grant sequence usage if needed for any serial columns
-- (certificates uses text PKs so no sequence needed here)

-- 4. Re-create the anon SELECT policy explicitly (idempotent)
DROP POLICY IF EXISTS certificates_select_anon ON public.certificates;
CREATE POLICY certificates_select_anon ON public.certificates
  FOR SELECT
  TO anon
  USING (true);

-- 5. Re-create the anon INSERT policy on verification_logs (idempotent)
DROP POLICY IF EXISTS verification_logs_insert_anon ON public.verification_logs;
CREATE POLICY verification_logs_insert_anon ON public.verification_logs
  FOR INSERT
  TO anon
  WITH CHECK (true);
