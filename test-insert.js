import client from './insforge-client.js';

async function testInsert() {
  console.log("Logging in...");
  const { data: authData, error: authError } = await client.auth.signInWithPassword({
    email: 'admin@lisa.gov.lr',
    password: 'admin123'
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
