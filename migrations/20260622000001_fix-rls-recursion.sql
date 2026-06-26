-- Fix: infinite recursion in RLS policies for relation "users"
-- 
-- Root cause: users_select_self and users_update_self policies query public.users
-- from within a users RLS policy, causing infinite recursion (PostgreSQL error 42P17).
--
-- Fix: Create a SECURITY DEFINER helper + drop/recreate all recursive policies.

-- Step 1: Create recursion-safe role-check helper (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

-- Step 2: Drop and recreate the recursive users policies
DROP POLICY IF EXISTS users_select_self ON public.users;
DROP POLICY IF EXISTS users_update_self ON public.users;

CREATE POLICY users_select_self ON public.users
  FOR SELECT
  USING (
    auth.uid() = id
    OR public.current_user_role() = 'admin'
  );

CREATE POLICY users_update_self ON public.users
  FOR UPDATE
  USING (
    auth.uid() = id
    OR public.current_user_role() = 'admin'
  );

-- Step 3: Drop and recreate all recursive certificates policies
DROP POLICY IF EXISTS certificates_select_authenticated ON public.certificates;
DROP POLICY IF EXISTS certificates_insert_authenticated ON public.certificates;
DROP POLICY IF EXISTS certificates_update_admin_developer ON public.certificates;
DROP POLICY IF EXISTS certificates_delete_admin ON public.certificates;

CREATE POLICY certificates_select_authenticated ON public.certificates
  FOR SELECT
  USING (public.current_user_role() IN ('admin', 'supervisor', 'developer'));

CREATE POLICY certificates_insert_authenticated ON public.certificates
  FOR INSERT
  WITH CHECK (public.current_user_role() IN ('admin', 'developer'));

CREATE POLICY certificates_update_admin_developer ON public.certificates
  FOR UPDATE
  USING (public.current_user_role() IN ('admin', 'developer'));

CREATE POLICY certificates_delete_admin ON public.certificates
  FOR DELETE
  USING (public.current_user_role() = 'admin');

-- Step 4: Drop and recreate recursive verification_logs policies
DROP POLICY IF EXISTS verification_logs_select_authenticated ON public.verification_logs;
DROP POLICY IF EXISTS verification_logs_update_admin_developer ON public.verification_logs;

CREATE POLICY verification_logs_select_authenticated ON public.verification_logs
  FOR SELECT
  USING (public.current_user_role() IN ('admin', 'supervisor', 'developer'));

CREATE POLICY verification_logs_update_admin_developer ON public.verification_logs
  FOR UPDATE
  USING (public.current_user_role() IN ('admin', 'developer'));

-- Step 5: Drop and recreate recursive system_logs policies
DROP POLICY IF EXISTS system_logs_select_admin ON public.system_logs;

CREATE POLICY system_logs_select_admin ON public.system_logs
  FOR SELECT
  USING (public.current_user_role() = 'admin');

-- Step 6: Drop and recreate recursive roles_permissions policies
DROP POLICY IF EXISTS roles_permissions_select_admin ON public.roles_permissions;
DROP POLICY IF EXISTS roles_permissions_update_admin ON public.roles_permissions;
DROP POLICY IF EXISTS roles_permissions_delete_admin ON public.roles_permissions;
DROP POLICY IF EXISTS roles_permissions_insert_admin ON public.roles_permissions;

CREATE POLICY roles_permissions_select_admin ON public.roles_permissions
  FOR SELECT
  USING (public.current_user_role() = 'admin');

CREATE POLICY roles_permissions_update_admin ON public.roles_permissions
  FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY roles_permissions_delete_admin ON public.roles_permissions
  FOR DELETE
  USING (public.current_user_role() = 'admin');

CREATE POLICY roles_permissions_insert_admin ON public.roles_permissions
  FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');
