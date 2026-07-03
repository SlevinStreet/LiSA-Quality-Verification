/**
 * LiSA VOC QC Platform — Development Test Script (Node.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠  This script is for LOCAL DEVELOPMENT TESTING ONLY.
 *    Credentials are loaded from .env (gitignored) via dotenv.
 *    NEVER hardcode credentials in this file.
 *
 * Setup:
 *   1. Ensure .env exists with TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD set.
 *   2. Run: node --require dotenv/config test-insert.js
 *      Or:  npx dotenv-cli node test-insert.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Load .env into process.env (install dotenv: npm install dotenv)
import 'dotenv/config';
import client from './insforge-client.js';

const email = process.env.TEST_ADMIN_EMAIL;
const password = process.env.TEST_ADMIN_PASSWORD;

if (!email || !password) {
  console.error(
    '[LiSA Test] ERROR: TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD must be set in .env\n' +
    'Copy .env.example → .env and fill in the real values.'
  );
  process.exit(1);
}

async function testInsert() {
  console.log("Logging in as:", email);
  const { data: authData, error: authError } = await client.auth.signInWithPassword({
    email,
    password
  });

  if (authError) {
    console.error("Auth error:", authError);
    return;
  }

  console.log("Logged in:", authData.user.id);

  console.log("Inserting certificate...");
  const payload = {
    qcv_id: "QCV-TEST-NODE",
    verification_id: "VER-TEST-NODE",
    manufacturer: "Test",
    product_name: "Test Prod",
    origin: "Test Origin",
    serial_numbers: "123",
    status: "VALID",
    issue_date: "2026-06-22",
    applicable_standards: "LSA",
    regulations: "LSA",
    scheme: "Scheme",
    scope: "Scope",
    surveillance_interval: "Annually",
    signatory: "Sig",
    certificate_hash: "HashNode123",
    qr_code_scan_count: 0,
    created_by: authData.user.id
  };

  const { data, error } = await client.database.from("certificates").insert([payload]).select();
  if (error) {
    console.error("Insert error:", error);
  } else {
    console.log("Insert success:", data);
  }
}

testInsert();
