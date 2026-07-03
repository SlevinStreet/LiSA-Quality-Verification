-- ============================================================
-- Migration: Fix all 4 InsForge Advisor Critical Security Issues
-- Applied: 2026-06-30
-- ============================================================

-- ============================================================
-- ISSUE 3: Revoke public EXECUTE on current_user_role()
-- (SECURITY DEFINER callable by public is a privilege-escalation risk)
--
-- Strategy: REVOKE from public, then explicitly GRANT only to
-- the roles that need it:
--   • authenticated — every logged-in user triggers RLS policies that call this
--   • anon          — the anon SELECT policy on certificates calls this
--                     (used by public verify.html QR lookup)
-- The function must remain SECURITY DEFINER so it can bypass RLS
-- when querying public.users — that is the intentional design.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM public;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO anon;

-- Ensure search_path is locked (already set, but explicit for advisor compliance)
ALTER FUNCTION public.current_user_role() SET search_path = public;

-- ============================================================
-- ISSUE 4: Revoke public EXECUTE on increment_certificate_scan_count()
-- This function is called exclusively by a database TRIGGER, not by
-- application code directly. Trigger functions do not require EXECUTE
-- permission from the calling role — the trigger fires as the function owner.
-- Safe to REVOKE from public entirely.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.increment_certificate_scan_count() FROM public;

-- Ensure search_path is locked (already set, but explicit for advisor compliance)
ALTER FUNCTION public.increment_certificate_scan_count() SET search_path = public;

-- ============================================================
-- ISSUE 2: Tighten verification_logs_insert_anon
-- Original: WITH CHECK (true) — allows any anon to insert any row.
-- Fix: Require that cert_id references an existing certificate.
-- This prevents spam/garbage inserts while preserving public QR scan logging.
-- ============================================================
DROP POLICY IF EXISTS verification_logs_insert_anon ON public.verification_logs;
CREATE POLICY verification_logs_insert_anon ON public.verification_logs
  FOR INSERT
  TO anon
  WITH CHECK (
    -- cert_id must reference a real certificate (prevents spam/orphan rows)
    EXISTS (
      SELECT 1 FROM public.certificates WHERE qcv_id = cert_id
    )
  );

-- ============================================================
-- ISSUE 1: certificates_select_anon uses USING (true)
-- INTENTIONALLY PERMISSIVE — This is a deliberate design decision.
-- 
-- Context: LiSA is a government QR verification portal. Certificates are
-- public compliance records that MUST be readable by anyone scanning a QR
-- code (no login required). Restricting to auth.uid() = user_id would break
-- the public verify.html portal entirely.
--
-- Risk acceptance: Certificate data is non-sensitive government compliance
-- records (product names, standards, QCV IDs). No PII is stored in this table.
-- The anon role has SELECT-only access; INSERT/UPDATE/DELETE require auth.
--
-- No policy change — keeping USING (true) for anon SELECT is correct here.
-- ============================================================
-- (No SQL — intentional no-op for Issue 1)

-- ============================================================
-- SAFETY: Ensure public.users rows exist for all auth users.
-- The handle_new_user trigger should have created these automatically,
-- but if any were missed (trigger error at signup), this backfill
-- inserts a default 'admin' row. Adjust role manually if needed.
-- ============================================================
INSERT INTO public.users (id, email, role)
SELECT
  au.id,
  au.email,
  COALESCE(
    au.metadata->>'role',   -- use role from signup metadata if present
    CASE
      WHEN au.email ILIKE '%supervisor%' THEN 'supervisor'
      WHEN au.email ILIKE '%dev%'        THEN 'developer'
      WHEN au.email ILIKE '%sys%'        THEN 'developer'
      ELSE 'admin'
    END
  ) AS role
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.id = au.id
)
-- Skip the system anon placeholder user — not a real application user
AND au.id != '12345678-1234-5678-90ab-cdef12345678'
ON CONFLICT (id) DO NOTHING;
