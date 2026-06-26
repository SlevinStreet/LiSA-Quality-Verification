/**
 * LiSA VOC-QC Database Setup Script
 * Creates all required tables, indexes, and RLS policies via InsForge REST API
 */

const BASE_URL = "https://76vnn7ex.us-east.insforge.app";
const API_KEY = "ik_df6f31172ad76c050f068d4b36a8e903";

const headers = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${API_KEY}`,
  "apikey": API_KEY
};

async function runSQL(sql, label) {
  console.log(`\n▶ Running: ${label}`);
  try {
    const res = await fetch(`${BASE_URL}/api/db/query`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: sql })
    });
    const text = await res.text();
    if (res.ok) {
      console.log(`  ✅ Success`);
      return true;
    } else {
      console.log(`  ⚠ HTTP ${res.status}: ${text.substring(0, 200)}`);
      return false;
    }
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
    return false;
  }
}

// Try the raw SQL endpoint
async function runRawSQL(sql, label) {
  console.log(`\n▶ Running: ${label}`);
  try {
    const res = await fetch(`${BASE_URL}/api/db/raw`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sql })
    });
    const text = await res.text();
    if (res.ok) {
      console.log(`  ✅ Success: ${text.substring(0, 100)}`);
      return true;
    } else {
      console.log(`  ⚠ HTTP ${res.status}: ${text.substring(0, 300)}`);
      return false;
    }
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
    return false;
  }
}

// Check connectivity to the backend first
async function checkConnectivity() {
  console.log("🔍 Checking InsForge connectivity...");
  try {
    const res = await fetch(`${BASE_URL}/api/health`, { headers });
    console.log(`  Status: ${res.status}`);
    return res.status < 500;
  } catch (err) {
    console.log(`  ❌ Cannot reach ${BASE_URL}: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log("=================================================");
  console.log("  LiSA VOC-QC Database Setup");
  console.log(`  Target: ${BASE_URL}`);
  console.log("=================================================");

  const connected = await checkConnectivity();
  if (!connected) {
    console.log("\n❌ Cannot connect to InsForge backend. Check your network and project config.");
    process.exit(1);
  }

  // Try multiple possible endpoints to find which one works
  const endpoints = [
    `/api/db/query`,
    `/api/db/raw`,
    `/rest/v1/rpc/exec_sql`,
  ];

  console.log("\n🔍 Testing available SQL endpoints...");
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${BASE_URL}${endpoint}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: "SELECT 1 AS ok", sql: "SELECT 1 AS ok" })
      });
      console.log(`  ${endpoint}: HTTP ${res.status}`);
    } catch (err) {
      console.log(`  ${endpoint}: ❌ ${err.message}`);
    }
  }

  // Try PostgREST RPC approach (most common InsForge pattern)
  console.log("\n🔍 Testing PostgREST...");
  try {
    const res = await fetch(`${BASE_URL}/rest/v1/`, { headers });
    const text = await res.text();
    console.log(`  /rest/v1/: HTTP ${res.status}`);
    console.log(`  Available tables: ${text.substring(0, 300)}`);
  } catch (err) {
    console.log(`  ❌ ${err.message}`);
  }
}

main().catch(console.error);
