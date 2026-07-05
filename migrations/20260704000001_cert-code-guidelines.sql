-- ============================================================
-- Migration: LiSA Certification Coding Guidelines Alignment
-- Adds:
--   1. cert_sequences table (per-category/year running counter)
--   2. get_next_cert_sequence() atomic RPC function
--   3. product_category column on certificates
--   4. approval_workflow_status column on certificates
-- ============================================================

-- ── 1. Certificate sequence tracker ──────────────────────────
-- Tracks the last-issued sequential number per (category_code, year).
-- Example row: ('SP', 2026, 5)  → next call returns 6 → '000006'
CREATE TABLE IF NOT EXISTS public.cert_sequences (
  category_code text   NOT NULL,
  cert_year     integer NOT NULL,
  last_seq      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (category_code, cert_year)
);

-- Grant runtime role access so the RPC function can read/write it
GRANT SELECT, INSERT, UPDATE ON public.cert_sequences TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cert_sequences TO anon;

-- ── 2. Atomic sequence incrementer (RPC) ─────────────────────
-- Called from the frontend via client.database.rpc('get_next_cert_sequence', {...})
-- Returns the next padded integer (not yet formatted with zeros).
-- Uses advisory locking per (category, year) to prevent races.
CREATE OR REPLACE FUNCTION public.get_next_cert_sequence(
  p_cat  text,
  p_year integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  -- Upsert: if no row exists yet, start at 1; otherwise increment.
  INSERT INTO public.cert_sequences (category_code, cert_year, last_seq)
  VALUES (upper(p_cat), p_year, 1)
  ON CONFLICT (category_code, cert_year)
  DO UPDATE SET last_seq = cert_sequences.last_seq + 1
  RETURNING last_seq INTO v_next;

  RETURN v_next;
END;
$$;

-- Allow unauthenticated and authenticated callers to invoke this function
-- (the form is submitted before session confirmation in some flows)
GRANT EXECUTE ON FUNCTION public.get_next_cert_sequence(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_cert_sequence(text, integer) TO anon;

-- ── 3. Add product_category column to certificates ────────────
ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS product_category text;

-- Soft constraint via check — keeps valid category codes only
-- (NOT enforced via a hard enum so the column stays flexible for future codes)
ALTER TABLE public.certificates
  DROP CONSTRAINT IF EXISTS chk_product_category;

ALTER TABLE public.certificates
  ADD CONSTRAINT chk_product_category CHECK (
    product_category IS NULL OR product_category IN ('SP','BT','IV','CC','SA','SL','BOS')
  );

-- ── 4. Add approval workflow status column ────────────────────
-- Tracks the three-stage authorization workflow:
--   voc_unit_issued  → Head of VOC review pending
--   head_voc_approved → Director General sign-off pending
--   director_approved → Final approval complete
ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS approval_workflow_status text
  DEFAULT 'voc_unit_issued';

ALTER TABLE public.certificates
  DROP CONSTRAINT IF EXISTS chk_approval_workflow_status;

ALTER TABLE public.certificates
  ADD CONSTRAINT chk_approval_workflow_status CHECK (
    approval_workflow_status IN ('voc_unit_issued','head_voc_approved','director_approved')
  );

-- Index for fast filtering by approval stage
CREATE INDEX IF NOT EXISTS certificates_approval_workflow_idx
  ON public.certificates (approval_workflow_status);

CREATE INDEX IF NOT EXISTS certificates_product_category_idx
  ON public.certificates (product_category);
