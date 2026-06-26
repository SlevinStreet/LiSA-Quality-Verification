-- Migration: Allow anonymous scans and public certificate verification
-- This migration grants select permissions to anon users on certificates
-- and insert permissions on verification_logs, and uses a trigger to securely increment scan counts.

-- 1. Create select policy for anon role on certificates
DROP POLICY IF EXISTS certificates_select_anon ON public.certificates;
CREATE POLICY certificates_select_anon ON public.certificates
  FOR SELECT
  TO anon
  USING (true);

-- 2. Create insert policy for anon role on verification_logs
DROP POLICY IF EXISTS verification_logs_insert_anon ON public.verification_logs;
CREATE POLICY verification_logs_insert_anon ON public.verification_logs
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- 3. Create security definer trigger to automatically increment qr_code_scan_count in certificates
CREATE OR REPLACE FUNCTION public.increment_certificate_scan_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.certificates
  SET qr_code_scan_count = COALESCE(qr_code_scan_count, 0) + 1
  WHERE qcv_id = NEW.cert_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_increment_scan_count ON public.verification_logs;
CREATE TRIGGER tr_increment_scan_count
  AFTER INSERT ON public.verification_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_certificate_scan_count();
