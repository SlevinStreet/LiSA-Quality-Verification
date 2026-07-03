/**
 * LiSA VOC QC Platform — Development Test Script (ESM / Node.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠  This script is for LOCAL DEVELOPMENT TESTING ONLY.
 *    Credentials are loaded from .env (gitignored) via dotenv.
 *    NEVER hardcode credentials in this file.
 *
 * Setup:
 *   1. Ensure .env exists with all required variables set.
 *   2. Run: node --env-file=.env test-insert2.mjs
 *      Or:  npx dotenv-cli node test-insert2.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createClient } from '@supabase/supabase-js';

// Read all credentials from environment — never hardcoded here
const supabaseUrl = process.env.INSFORGE_BASE_URL;
const supabaseKey = process.env.INSFORGE_ANON_KEY;
const email = process.env.TEST_ADMIN_EMAIL;
const password = process.env.TEST_ADMIN_PASSWORD;

if (!supabaseUrl || !supabaseKey || !email || !password) {
  console.error(
    '[LiSA Test] ERROR: The following .env variables are required:\n' +
    '  INSFORGE_BASE_URL, INSFORGE_ANON_KEY, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD\n' +
    'Copy .env.example → .env and fill in the real values.'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
  console.log("Logging in as:", email);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (authError) {
    console.error("Auth error:", authError);
    return;
  }

  console.log("Logged in user:", authData.user.id);

  const payload = {
    qcv_id: "QCV-TEST-NODE-2",
    verification_id: "VER-TEST-NODE-2",
    manufacturer: "Test",
    product_name: "Test Prod",
    origin: "Test Origin",
    serial_numbers: "123",
    status: "VALID",
    issue_date: "2026-06-22",
    expiry_date: null,
    applicable_standards: "LSA",
    regulations: "LSA",
    scheme: "Scheme",
    scope: "Scope",
    surveillance_interval: "Annually",
    last_surveillance_date: null,
    signatory: "Sig",
    certificate_hash: "HashNode12345",
    qr_code_scan_count: 0,
    revocation_reason: "",
    revocation_date: null,
    uploaded_file_name: "test.pdf",
    uploaded_file_url: null,
    uploaded_file_key: null,
    created_by: authData.user.id
  };

  console.log("Inserting certificate...");
  const { data, error } = await supabase.from("certificates").insert([payload]).select();
  if (error) {
    console.error("Insert error:", error);
  } else {
    console.log("Insert success:", data);
  }
}

testInsert();
