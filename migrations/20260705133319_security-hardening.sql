ALTER TABLE public.cert_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cert_sequences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cert_sequences_select_admin_dev" ON public.cert_sequences;
CREATE POLICY "cert_sequences_select_admin_dev"
  ON public.cert_sequences
  FOR SELECT
  TO authenticated
  USING (public.current_user_role() = ANY (ARRAY['admin'::text, 'developer'::text]));

DROP POLICY IF EXISTS "certificates_select_anon" ON public.certificates;
CREATE POLICY "certificates_select_anon"
  ON public.certificates
  FOR SELECT
  TO anon
  USING (
    status NOT IN (
      'draft',
      'pending',
      'pending_review',
      'pending_approval'
    )
  );

DROP POLICY IF EXISTS "verification_logs_insert_anon" ON public.verification_logs;
CREATE POLICY "verification_logs_insert_anon"
  ON public.verification_logs
  FOR INSERT
  TO anon
  WITH CHECK (scanned_by IS NULL);

ALTER FUNCTION public.current_user_role() SECURITY INVOKER;

REVOKE EXECUTE ON FUNCTION public.get_next_cert_sequence(text, integer) FROM anon;
