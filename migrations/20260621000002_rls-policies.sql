
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_select_self ON public.users;
CREATE POLICY users_select_self ON public.users FOR SELECT USING (auth.uid() = id OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));
DROP POLICY IF EXISTS users_update_self ON public.users;
CREATE POLICY users_update_self ON public.users FOR UPDATE USING (auth.uid() = id OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));
DROP POLICY IF EXISTS users_insert_authenticated ON public.users;
CREATE POLICY users_insert_authenticated ON public.users FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS certificates_select_authenticated ON public.certificates;
CREATE POLICY certificates_select_authenticated ON public.certificates FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'supervisor', 'developer'))
);
DROP POLICY IF EXISTS certificates_insert_authenticated ON public.certificates;
CREATE POLICY certificates_insert_authenticated ON public.certificates FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'developer'))
);
DROP POLICY IF EXISTS certificates_update_admin_developer ON public.certificates;
CREATE POLICY certificates_update_admin_developer ON public.certificates FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'developer'))
);
DROP POLICY IF EXISTS certificates_delete_admin ON public.certificates;
CREATE POLICY certificates_delete_admin ON public.certificates FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);

ALTER TABLE public.verification_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS verification_logs_select_authenticated ON public.verification_logs;
CREATE POLICY verification_logs_select_authenticated ON public.verification_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'supervisor', 'developer'))
);
DROP POLICY IF EXISTS verification_logs_insert_authenticated ON public.verification_logs;
CREATE POLICY verification_logs_insert_authenticated ON public.verification_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS verification_logs_update_admin_developer ON public.verification_logs;
CREATE POLICY verification_logs_update_admin_developer ON public.verification_logs FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin', 'developer'))
);

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_logs_select_admin ON public.system_logs;
CREATE POLICY system_logs_select_admin ON public.system_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);
DROP POLICY IF EXISTS system_logs_insert_authenticated ON public.system_logs;
CREATE POLICY system_logs_insert_authenticated ON public.system_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE public.roles_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS roles_permissions_select_admin ON public.roles_permissions;
CREATE POLICY roles_permissions_select_admin ON public.roles_permissions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);
DROP POLICY IF EXISTS roles_permissions_update_admin ON public.roles_permissions;
CREATE POLICY roles_permissions_update_admin ON public.roles_permissions FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);
DROP POLICY IF EXISTS roles_permissions_delete_admin ON public.roles_permissions;
CREATE POLICY roles_permissions_delete_admin ON public.roles_permissions FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);
DROP POLICY IF EXISTS roles_permissions_insert_admin ON public.roles_permissions;
CREATE POLICY roles_permissions_insert_admin ON public.roles_permissions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
);
