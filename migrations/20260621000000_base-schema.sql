
-- Users table
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'supervisor', 'developer')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Certificates table
CREATE TABLE IF NOT EXISTS public.certificates (
  qcv_id text PRIMARY KEY,
  verification_id text UNIQUE NOT NULL,
  manufacturer text NOT NULL,
  product_name text NOT NULL,
  origin text NOT NULL,
  serial_numbers text NOT NULL,
  status text NOT NULL CHECK (status IN ('VALID', 'REVOKED', 'EXPIRED')),
  issue_date date NOT NULL,
  expiry_date date,
  applicable_standards text NOT NULL,
  regulations text NOT NULL,
  scheme text NOT NULL,
  scope text NOT NULL,
  surveillance_interval text NOT NULL,
  last_surveillance_date date,
  signatory text NOT NULL,
  certificate_hash text UNIQUE NOT NULL,
  qr_code_scan_count integer DEFAULT 0,
  revocation_reason text,
  revocation_date date,
  uploaded_file_name text,
  uploaded_file_url text,
  uploaded_file_key text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Verification Logs
CREATE TABLE IF NOT EXISTS public.verification_logs (
  id text PRIMARY KEY,
  cert_id text REFERENCES public.certificates(qcv_id) ON DELETE CASCADE,
  verification_id text NOT NULL,
  product_name text NOT NULL,
  scanned_at timestamptz DEFAULT now(),
  outcome text NOT NULL,
  location text NOT NULL,
  device text NOT NULL,
  scanned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  details text,
  created_at timestamptz DEFAULT now()
);

-- System Logs
CREATE TABLE IF NOT EXISTS public.system_logs (
  id text PRIMARY KEY,
  timestamp timestamptz DEFAULT now(),
  user_email text NOT NULL,
  action text NOT NULL,
  details text NOT NULL,
  block_hash text UNIQUE NOT NULL
);

-- Roles Permissions Matrix
CREATE TABLE IF NOT EXISTS public.roles_permissions (
  id uuid PRIMARY KEY,
  role text UNIQUE NOT NULL,
  can_read boolean DEFAULT true,
  can_upload boolean DEFAULT false,
  can_revoke boolean DEFAULT false,
  can_edit boolean DEFAULT false,
  can_access_system boolean DEFAULT false
);
