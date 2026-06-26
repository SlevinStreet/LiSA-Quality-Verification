
-- Add missing certificate fields for QR asset storage and audit tracking
ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS qr_code_image_url text,
  ADD COLUMN IF NOT EXISTS qr_code_image_key text;

-- Add optional details field for verification log context
ALTER TABLE public.verification_logs
  ADD COLUMN IF NOT EXISTS details text;

-- Create helper indexes for lookups
CREATE INDEX IF NOT EXISTS certificates_qcv_id_idx ON public.certificates(qcv_id);
CREATE INDEX IF NOT EXISTS certificates_verification_id_idx ON public.certificates(verification_id);
CREATE INDEX IF NOT EXISTS verification_logs_verification_id_idx ON public.verification_logs(verification_id);
CREATE INDEX IF NOT EXISTS verification_logs_scanned_by_idx ON public.verification_logs(scanned_by);

-- Ensure file metadata column exists on certificates for uploads
ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS uploaded_file_name text;

-- Create role permissions seed values if missing
INSERT INTO public.roles_permissions (id, role, can_read, can_upload, can_revoke, can_edit, can_access_system)
SELECT gen_random_uuid(), 'admin', true, true, true, true, true
WHERE NOT EXISTS (SELECT 1 FROM public.roles_permissions WHERE role = 'admin');

INSERT INTO public.roles_permissions (id, role, can_read, can_upload, can_revoke, can_edit, can_access_system)
SELECT gen_random_uuid(), 'developer', true, true, true, true, true
WHERE NOT EXISTS (SELECT 1 FROM public.roles_permissions WHERE role = 'developer');

INSERT INTO public.roles_permissions (id, role, can_read, can_upload, can_revoke, can_edit, can_access_system)
SELECT gen_random_uuid(), 'supervisor', true, false, false, false, false
WHERE NOT EXISTS (SELECT 1 FROM public.roles_permissions WHERE role = 'supervisor');
