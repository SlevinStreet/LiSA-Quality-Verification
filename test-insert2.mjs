import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://76vnn7ex.us-east.insforge.app';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NDE1NjN9._8uHKHDFujGrwK9stWMBOcETYmK5b9KmWS56LCWbnWI';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
  console.log("Logging in...");
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'admin@lisa.gov.lr',
    password: 'admin123'
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
