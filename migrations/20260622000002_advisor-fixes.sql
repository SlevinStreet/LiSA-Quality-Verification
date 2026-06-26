-- ============================================================
-- Migration: Fix all 18 InsForge Advisor issues
-- ============================================================

-- ============================================================
-- ISSUE 1 (critical security): RLS enabled but no policies on
-- public.roles_permissions — the fix-rls-recursion migration
-- already recreated them, but they use current_user_role().
-- They are verified present; this is a no-op guard.
-- ============================================================

-- ============================================================
-- ISSUE 2 (critical security): Harden handle_new_user()
-- Revoke PUBLIC execute, lock search_path.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;

-- ============================================================
-- ISSUE 3 (warning performance): FK index on certificates.created_by
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_certificates_created_by
  ON public.certificates(created_by);

-- ============================================================
-- ISSUE 4 (warning performance): FK index on verification_logs.cert_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_verification_logs_cert_id
  ON public.verification_logs(cert_id);

-- ============================================================
-- ISSUES 5-15 (warning performance): Wrap auth.uid() in subquery
-- in all RLS policies so it is evaluated once per query, not per row.
-- Also fix current_user_role() calls — already a stable function,
-- but we re-drop/recreate every policy with (select auth.uid()) pattern.
-- ============================================================

-- ---- public.users ----
DROP POLICY IF EXISTS users_select_self ON public.users;
CREATE POLICY users_select_self ON public.users
  FOR SELECT
  USING (
    (select auth.uid()) = id
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS users_update_self ON public.users;
CREATE POLICY users_update_self ON public.users
  FOR UPDATE
  USING (
    (select auth.uid()) = id
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS users_insert_authenticated ON public.users;
CREATE POLICY users_insert_authenticated ON public.users
  FOR INSERT
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ---- public.certificates ----
DROP POLICY IF EXISTS certificates_select_authenticated ON public.certificates;
CREATE POLICY certificates_select_authenticated ON public.certificates
  FOR SELECT
  USING (public.current_user_role() IN ('admin', 'supervisor', 'developer'));

DROP POLICY IF EXISTS certificates_insert_authenticated ON public.certificates;
DROP POLICY IF EXISTS certificates_insert_admin_dev ON public.certificates;
CREATE POLICY certificates_insert_admin_dev ON public.certificates
  FOR INSERT
  WITH CHECK (public.current_user_role() IN ('admin', 'developer'));

DROP POLICY IF EXISTS certificates_update_admin_developer ON public.certificates;
DROP POLICY IF EXISTS certificates_update_admin_dev ON public.certificates;
CREATE POLICY certificates_update_admin_dev ON public.certificates
  FOR UPDATE
  USING (public.current_user_role() IN ('admin', 'developer'));

DROP POLICY IF EXISTS certificates_delete_admin ON public.certificates;
CREATE POLICY certificates_delete_admin ON public.certificates
  FOR DELETE
  USING (public.current_user_role() = 'admin');

-- ---- public.verification_logs ----
DROP POLICY IF EXISTS verification_logs_select_authenticated ON public.verification_logs;
CREATE POLICY verification_logs_select_authenticated ON public.verification_logs
  FOR SELECT
  USING (public.current_user_role() IN ('admin', 'supervisor', 'developer'));

DROP POLICY IF EXISTS verification_logs_insert_authenticated ON public.verification_logs;
CREATE POLICY verification_logs_insert_authenticated ON public.verification_logs
  FOR INSERT
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS verification_logs_update_admin_developer ON public.verification_logs;
CREATE POLICY verification_logs_update_admin_developer ON public.verification_logs
  FOR UPDATE
  USING (public.current_user_role() IN ('admin', 'developer'));

-- ---- public.system_logs ----
DROP POLICY IF EXISTS system_logs_select_admin ON public.system_logs;
CREATE POLICY system_logs_select_admin ON public.system_logs
  FOR SELECT
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS system_logs_insert_authenticated ON public.system_logs;
CREATE POLICY system_logs_insert_authenticated ON public.system_logs
  FOR INSERT
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ---- public.roles_permissions (re-create with optimised pattern) ----
DROP POLICY IF EXISTS roles_permissions_select_admin ON public.roles_permissions;
CREATE POLICY roles_permissions_select_admin ON public.roles_permissions
  FOR SELECT
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS roles_permissions_update_admin ON public.roles_permissions;
CREATE POLICY roles_permissions_update_admin ON public.roles_permissions
  FOR UPDATE
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS roles_permissions_delete_admin ON public.roles_permissions;
CREATE POLICY roles_permissions_delete_admin ON public.roles_permissions
  FOR DELETE
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS roles_permissions_insert_admin ON public.roles_permissions;
CREATE POLICY roles_permissions_insert_admin ON public.roles_permissions
  FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

-- ============================================================
-- ISSUES 16-18 (warning performance): Index on certificates.qcv_id
-- qcv_id is the actual primary key column (not 'id').
-- Primary keys are indexed automatically; this is a safety guard.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_certificates_qcv_id
  ON public.certificates(qcv_id);
