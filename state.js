/**
 * LiSA Platform - Core State Coordinator
 * Handles persistence, dynamic CRUD operations, logging, sessions, and permissions.
 * Data is fetched from and stored to the InsForge backend only.
 * Sessions are stored in sessionStorage (cleared when tab closes).
 * No data is persisted to localStorage.
 */

const LIS_PRESETS = {
  permissions: {
    admin: { read: true, upload: true, revoke: true, edit: true, system: true },
    supervisor: { read: true, upload: false, revoke: false, edit: false, system: false },
    developer: { read: true, upload: true, revoke: true, edit: true, system: true }
  }
};

// One-time purge: clear ALL legacy lisa* keys from localStorage so nothing persists there
(function purgeLocalStorage() {
  try {
    if (!window.localStorage) return;
    const keysToRemove = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith("lisa")) keysToRemove.push(key);
    }
    keysToRemove.forEach(k => window.localStorage.removeItem(k));
  } catch (e) {}
})();

// Session storage wrapper (sessionStorage → window.name fallback for file:// protocol)
// ONLY used for the user session token — never for application data.
const storage = (() => {
  const checkStorage = (s) => {
    if (!s) return false;
    try {
      const testKey = "__lisa_storage_test__";
      s.setItem(testKey, "1");
      s.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  };

  const getSessionStorage = () => {
    try { return window.sessionStorage; } catch (e) { return null; }
  };

  const session = getSessionStorage();
  if (checkStorage(session)) {
    return session;
  }

  // Fallback: window.name (persists within the same tab only)
  console.warn("LiSA: sessionStorage unavailable. Using window.name session fallback.");
  return {
    _read() {
      try { return JSON.parse(window.name || "{}"); } catch (e) { return {}; }
    },
    _write(data) {
      try { window.name = JSON.stringify(data); } catch (e) {}
    },
    getItem(key) { const d = this._read(); return d.hasOwnProperty(key) ? d[key] : null; },
    setItem(key, value) { const d = this._read(); d[key] = String(value); this._write(d); },
    removeItem(key) { const d = this._read(); delete d[key]; this._write(d); },
    clear() { this._write({}); }
  };
})();

class QCVState {
  constructor() {
    // In-memory collections — sourced from backend, never from localStorage
    this._certificates = [];
    this._verificationLogs = [];
    this._systemLogs = [];
    this._permissions = { ...LIS_PRESETS.permissions };
    this._sessionRestored = false; // prevent repeated getCurrentUser calls
  }

  // --- Session Management ---
  getCurrentSession() {
    const sessionStr = storage.getItem("lisaSession");
    if (sessionStr) {
      try { return JSON.parse(sessionStr); } catch (e) {}
    }
    // Multi-tab fallback: read the session cookie written on login.
    // sessionStorage is tab-scoped; the cookie is shared across tabs
    // in the same browser session (no max-age → expires on browser close).
    try {
      const match = document.cookie.match(/(?:^|;\s*)lisa_tab_token=([^;]*)/);
      if (match) {
        const token = decodeURIComponent(match[1]);
        // Minimal session so _restoreAuthSession can inject the JWT;
        // role/email are unknown here — pages that need them should
        // redirect to login when getCurrentSession() returns null from storage.
        return { token, role: null, email: null, _fromCookie: true };
      }
    } catch (e) {}
    return null;
  }

  async validateAndRestoreSessionAsync() {
    const session = this.getCurrentSession();
    // If we have a session but it's only a cookie token, we need to fetch user info and role
    if (session && session._fromCookie) {
      try {
        const client = await this.getInsforgeClient();
        if (!client?.auth?.getCurrentUser) {
          throw new Error("InsForge auth client getCurrentUser is unavailable");
        }
        
        // Fast timeout wrapper
        const withTimeout = (promise, ms) => {
          return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms))
          ]);
        };

        // Fetch current user from auth server (max 3 seconds)
        const { data, error } = await withTimeout(client.auth.getCurrentUser(), 3000);
        if (error || !data?.user) {
          throw error || new Error("Failed to retrieve user from token");
        }
        
        const user = data.user;
        const email = user.email;
        let role = this.getRoleFromEmail(email);
        
        // Query users table for role (max 2 seconds)
        try {
          if (client?.database?.from) {
            const { data: userData, error: userError } = await withTimeout(
              client.database
                .from("users")
                .select("role")
                .eq("id", user.id)
                .limit(1),
              2000
            );
            if (!userError && userData && userData.length > 0 && userData[0].role) {
              role = userData[0].role;
            }
          }
        } catch (e) {
          console.warn("Could not fetch role from DB during verification:", e);
        }
        
        const fullSession = {
          email,
          role,
          loginTime: new Date().toISOString(),
          token: session.token,
          user: user
        };
        
        storage.setItem("lisaSession", JSON.stringify(fullSession));
        return fullSession;
      } catch (err) {
        console.warn("Cookie session validation failed:", err);
        // Clear invalid session cookie
        this.logout();
        return null;
      }
    }
    return session;
  }

  login(email, role) {
    const session = {
      email: email,
      role: role,
      loginTime: new Date().toISOString(),
      token: "LSA-SESSION-" + Math.random().toString(36).substr(2, 9).toUpperCase()
    };
    storage.setItem("lisaSession", JSON.stringify(session));
    this.addSystemLog(email, "USER_LOGIN", `Authenticated as ${role.toUpperCase()} role.`);
    return session;
  }

  getRoleFromEmail(email) {
    const normalized = email.toLowerCase();
    if (normalized.includes("supervisor")) return "supervisor";
    if (normalized.includes("dev") || normalized.includes("sys")) return "developer";
    return "admin";
  }

  async loginWithPassword(email, password) {
    // insforge-client.js is loaded eagerly as <script type="module"> on all
    // authenticated pages. Guard kept only as a safety net for unusual load orders.
    if (!window.insforgeClient) {
      throw new Error("InsForge client not loaded. Ensure insforge-client.js is included as a module script.");
    }

    if (!window.insforgeClient?.auth?.signInWithPassword) {
      // Fallback for environments where SDK auth is unavailable
      const role = this.getRoleFromEmail(email);
      const session = {
        email,
        role,
        loginTime: new Date().toISOString(),
        token: "LSA-SESSION-" + Math.random().toString(36).substr(2, 9).toUpperCase()
      };
      storage.setItem("lisaSession", JSON.stringify(session));
      this.addSystemLog(email, "USER_LOGIN", `Authenticated as ${role.toUpperCase()} role.`);
      return session;
    }

    const { data, error } = await window.insforgeClient.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }

    // Inject the access token so the subsequent DB query runs as the authenticated user
    if (data?.accessToken && window.insforgeClient?.setAccessToken) {
      window.insforgeClient.setAccessToken(data.accessToken);
    }

    // Fetch the actual role from public.users — this is the source of truth.
    // getRoleFromEmail() is only a fallback in case the DB query fails.
    let role = this.getRoleFromEmail(email);
    try {
      if (window.insforgeClient?.database?.from) {
        const { data: userData, error: userError } = await window.insforgeClient.database
          .from("users")
          .select("role")
          .eq("id", data?.user?.id)
          .limit(1);
        if (!userError && userData && userData.length > 0 && userData[0].role) {
          role = userData[0].role;
        }
      }
    } catch (e) {
      console.warn("Could not fetch role from DB, falling back to email-derived role:", e);
    }

    const session = {
      email,
      role,
      loginTime: new Date().toISOString(),
      token: data?.accessToken ?? null,
      refreshToken: data?.refreshToken ?? null,
      user: data?.user ?? null
    };

    storage.setItem("lisaSession", JSON.stringify(session));

    // Write a tab-shared cookie so other tabs can restore the JWT without re-login.
    // No max-age → cookie expires when the browser session ends (same boundary as sessionStorage).
    // SameSite=Strict prevents CSRF. Not HttpOnly because JS must read it for the fallback.
    if (session.token) {
      try {
        const secure = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `lisa_tab_token=${encodeURIComponent(session.token)}; path=/; SameSite=Strict${secure}`;
      } catch (e) {}
    }

    this.addSystemLog(email, "USER_LOGIN", `Authenticated as ${role.toUpperCase()} role.`);
    return session;
  }


  async loginWithOAuth(provider = "google") {
    if (!window.insforgeClient?.auth?.signInWithOAuth) {
      throw new Error("OAuth support is unavailable.");
    }
    return window.insforgeClient.auth.signInWithOAuth(provider, {
      redirectTo: window.location.href
    });
  }

  logout() {
    const session = this.getCurrentSession();
    const email = (session && !session._fromCookie) ? session.email : "unknown";
    if (window.insforgeClient?.auth?.signOut) {
      window.insforgeClient.auth.signOut().catch(() => {});
    }
    storage.removeItem("lisaSession");
    // Expire the multi-tab cookie so other open tabs lose their JWT
    try {
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `lisa_tab_token=; path=/; max-age=0; SameSite=Strict${secure}`;
    } catch (e) {}
    this.addSystemLog(email, "USER_LOGOUT", "User logged out of active session.");
    // Clear in-memory state on logout
    this._certificates = [];
    this._verificationLogs = [];
    this._systemLogs = [];
    this._permissions = { ...LIS_PRESETS.permissions };
  }

  /**
   * Register a new inspector account in the InsForge auth backend.
   * Uses a temporary anonymous client so the admin's session is not affected.
   * The handle_new_user trigger will automatically create a public.users row with the assigned role.
   */
  async signUpInspectorAsync(email, password, role) {
    try {
      const client = await this.getInsforgeClient();
      if (!client?.auth?.signUp) {
        throw new Error("InsForge auth client is unavailable.");
      }
      const { data, error } = await client.auth.signUp({
        email,
        password,
        data: { role }
      });
      if (error) throw error;
      return { success: true, user: data?.user ?? null };
    } catch (error) {
      console.warn("Inspector registration failed:", error);
      throw error;
    }
  }

  async getInsforgeClient() {
    // Wait up to 5 seconds for dynamic module script initialization
    let maxWait = 5000;
    const start = Date.now();
    while (!window.insforgeClient && Date.now() - start < maxWait) {
      await new Promise(r => setTimeout(r, 50));
    }
    if (!window.insforgeClient) {
      throw new Error("InsForge client is unavailable. Ensure insforge-client.js is loaded before state.js.");
    }
    // Always re-inject the JWT on every call — setAccessToken is idempotent
    // and this guarantees the correct token is present even if a new client
    // instance was created (e.g., page reload, hot module replacement).
    await this._restoreAuthSession(window.insforgeClient);
    return window.insforgeClient;
  }

  async _restoreAuthSession(client) {
    // Token injection is always performed — it is idempotent and cheap.
    // The _sessionRestored guard only prevents redundant getCurrentUser network calls.
    const session = this.getCurrentSession();
    if (session?.token && client?.setAccessToken) {
      // Inject the stored JWT into the SDK's HTTP client so every subsequent
      // DB / storage call carries the Authorization: Bearer header.
      client.setAccessToken(session.token);
      // Provide the refresh token so the SDK can auto-refresh expired JWTs.
      if (session.refreshToken && client?.http?.setRefreshToken) {
        client.http.setRefreshToken(session.refreshToken);
      }
    }
    if (this._sessionRestored) return; // guard against redundant getCurrentUser network calls only
    this._sessionRestored = true;
  }

  async createCertificateAsync(certData) {
    try {
      const client = await this.getInsforgeClient();
      if (!client?.database?.from) {
        throw new Error("InsForge database client is unavailable.");
      }

      const certId = certData.id || this.generateCertId(
        certData.productCategory || "SP",
        certData.issueDate || new Date().toISOString().split("T")[0],
        Math.floor(100000 + Math.random() * 900000)
      );
      const verId = certId;
      let mockHash = "";
      for (let i = 0; i < 64; i++) {
        mockHash += Math.floor(Math.random() * 16).toString(16);
      }

      const session = this.getCurrentSession();
      const payload = {
        qcv_id: certId,
        verification_id: verId,
        manufacturer: certData.manufacturer || "Unknown Manufacturer",
        product_name: certData.productName || "Unknown Product",
        origin: certData.origin || "Liberia",
        serial_numbers: certData.serial_numbers || "N/A",
        status: certData.status || "VALID",
        issue_date: certData.issueDate || new Date().toISOString().split("T")[0],
        expiry_date: certData.expiryDate || null,
        applicable_standards: certData.applicableStandards || "LSA Standards",
        regulations: certData.regulations || "Liberia Standards Authority Mandate",
        scheme: certData.scheme || "Continuous Surveillance Audit Scheme",
        scope: certData.scope || "Quality compliance clearance for trade standard.",
        surveillance_interval: certData.surveillanceInterval || "Annually",
        last_surveillance_date: certData.lastSurveillanceDate || null,
        signatory: certData.signatory || "Dr. Emmanuel K. Cooper, Director General, LSA",
        certificate_hash: mockHash,
        qr_code_scan_count: 0,
        revocation_reason: "",
        revocation_date: null,
        uploaded_file_name: certData.uploadedFileName || null,
        uploaded_file_url: null,
        uploaded_file_key: null,
        created_by: session?.user?.id || null,
        product_category: certData.productCategory || null,
        approval_workflow_status: certData.approvalWorkflowStatus || 'voc_unit_issued'
      };d || null
      };

      if (!client?.database?.from) {
        throw new Error("InsForge database client is unavailable.");
      }
      const { data, error } = await client.database.from("certificates").insert([payload]).select();
      if (error) {
        throw error;
      }
      const row = data?.[0];
      if (!row) {
        throw new Error("Remote certificate creation returned no record.");
      }

      const cert = {
        id: row.qcv_id,
        verificationId: row.verification_id,
        manufacturer: row.manufacturer,
        productName: row.product_name,
        origin: row.origin,
        serialNumbers: row.serial_numbers,
        status: row.status,
        issueDate: row.issue_date ? String(row.issue_date).split("T")[0] : "",
        expiryDate: row.expiry_date ? String(row.expiry_date).split("T")[0] : "",
        applicableStandards: row.applicable_standards,
        regulations: row.regulations,
        scheme: row.scheme,
        scope: row.scope,
        surveillanceInterval: row.surveillance_interval,
        lastSurveillanceDate: row.last_surveillance_date ? String(row.last_surveillance_date).split("T")[0] : "",
        signatory: row.signatory,
        hash: row.certificate_hash,
        qrScans: row.qr_code_scan_count,
        revocationReason: row.revocation_reason,
        revocationDate: row.revocation_date,
        uploadedFileName: row.uploaded_file_name,
        uploadedFileUrl: row.uploaded_file_url,
        uploadedFileKey: row.uploaded_file_key,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };

      this.addSystemLog(session?.email || "system@lisa.gov.lr", "CERTIFICATE_CREATION", `Registered backend certificate ${cert.id} for ${cert.manufacturer}.`);
      return cert;
    } catch (error) {
      console.error("InsForge Insert Error:", error);
      return null;
    }
  }

  async getCertificatesAsync() {
    try {
      const client = await this.getInsforgeClient();
      if (!client?.database?.from) {
        throw new Error("InsForge database client is unavailable.");
      }

      const { data, error } = await client.database.from("certificates").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      if (!data) return this._certificates;

      this._certificates = data.map(row => ({
        id: row.qcv_id,
        verificationId: row.verification_id,
        manufacturer: row.manufacturer,
        productName: row.product_name,
        origin: row.origin,
        serialNumbers: row.serial_numbers,
        status: row.status,
        issueDate: row.issue_date ? String(row.issue_date).split("T")[0] : "",
        expiryDate: row.expiry_date ? String(row.expiry_date).split("T")[0] : "",
        applicableStandards: row.applicable_standards,
        regulations: row.regulations,
        scheme: row.scheme,
        scope: row.scope,
        surveillanceInterval: row.surveillance_interval,
        lastSurveillanceDate: row.last_surveillance_date ? String(row.last_surveillance_date).split("T")[0] : "",
        signatory: row.signatory,
        hash: row.certificate_hash,
        qrScans: row.qr_code_scan_count,
        revocationReason: row.revocation_reason,
        revocationDate: row.revocation_date ? String(row.revocation_date).split("T")[0] : "",
        uploadedFileName: row.uploaded_file_name,
        uploadedFileUrl: row.uploaded_file_url,
        uploadedFileKey: row.uploaded_file_key,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
      return this._certificates;
    } catch (error) {
      console.warn("Remote certificate fetch failed:", error);
      return this._certificates;
    }
  }

  async updateCertificateAsync(id, updatedData) {
    try {
      const client = await this.getInsforgeClient();
      if (!client?.database?.from) {
        throw new Error("InsForge database client is unavailable.");
      }
      const payload = {
        manufacturer: updatedData.manufacturer,
        product_name: updatedData.productName,
        origin: updatedData.origin,
        serial_numbers: updatedData.serialNumbers,
        status: updatedData.status,
        expiry_date: updatedData.expiryDate || null,
        applicable_standards: updatedData.applicableStandards,
        revocation_reason: updatedData.revocationReason || "",
        revocation_date: updatedData.revocationDate || null
      };

      const { error } = await client.database.from("certificates").update(payload).eq("qcv_id", id);
      if (error) {
        throw error;
      }
      return true;
    } catch (error) {
      console.warn("Remote certificate update failed:", error);
      return false;
    }
  }

  async deleteCertificateAsync(id) {
    try {
      const client = await this.getInsforgeClient();
      if (!client?.database?.from) {
        throw new Error("InsForge database client is unavailable.");
      }
      const { error } = await client.database.from("certificates").delete().eq("qcv_id", id);
      if (error) {
        throw error;
      }
      return true;
    } catch (error) {
      console.warn("Remote certificate delete failed:", error);
      return false;
    }
  }

  async revokeCertificateAsync(id, reason) {
    try {
      const client = await this.getInsforgeClient();
      if (!client?.database?.from) {
        throw new Error("InsForge database client is unavailable.");
      }
      const payload = {
        status: "REVOKED",
        revocation_reason: reason,
        revocation_date: new Date().toISOString().split("T")[0]
      };
      const { error } = await client.database.from("certificates").update(payload).eq("qcv_id", id);
      if (error) {
        throw error;
      }
      return true;
    } catch (error) {
      console.warn("Remote certificate revocation failed:", error);
      return false;
    }
  }

  // --- Certificates CRUD ---
  getCertificates() {
    return this._certificates;
  }

  getCertificateById(id) {
    if (!id) return undefined;
    const normalised = String(id).toLowerCase().trim();
    return this._certificates.find(c =>
      String(c.id || '').toLowerCase() === normalised ||
      String(c.verificationId || '').toLowerCase() === normalised
    );
  }

  createCertificate(certData) {
    // Local-only fallback: generates a cert in memory if backend is unavailable
    const certId = certData.id || this.generateCertId(
      certData.productCategory || "SP",
      certData.issueDate || new Date().toISOString().split("T")[0],
      Math.floor(100000 + Math.random() * 900000)
    );
    const verId = certId;
    let mockHash = "";
    for (let i = 0; i < 64; i++) mockHash += Math.floor(Math.random() * 16).toString(16);

    const newCert = {
      id: certId,
      verificationId: verId,
      manufacturer: certData.manufacturer || "Unknown Manufacturer",
      productName: certData.productName || "Unknown Product",
      origin: certData.origin || "Liberia",
      serialNumbers: certData.serialNumbers || "N/A",
      status: certData.status || "VALID",
      issueDate: certData.issueDate || new Date().toISOString().split("T")[0],
      expiryDate: certData.expiryDate || "",
      applicableStandards: certData.applicableStandards || "LSA Standards",
      regulations: certData.regulations || "Liberia Standards Authority Mandate",
      scheme: certData.scheme || "Continuous Surveillance Audit Scheme",
      scope: certData.scope || "Quality compliance clearance for trade standard.",
      surveillanceInterval: certData.surveillanceInterval || "Annually",
      lastSurveillanceDate: certData.lastSurveillanceDate || "",
      signatory: certData.signatory || "Dr. Emmanuel K. Cooper, Director General, LSA",
      hash: mockHash,
      qrScans: 0,
      revocationReason: "",
      revocationDate: "",
      uploadedFileName: certData.uploadedFileName || "",
      productCategory: certData.productCategory || null,
      approvalWorkflowStatus: certData.approvalWorkflowStatus || 'voc_unit_issued'
    };

    this._certificates.unshift(newCert);

    const session = this.getCurrentSession();
    const user = session ? session.email : "system@lisa.gov.lr";
    this.addSystemLog(user, "CERTIFICATE_CREATION", `Registered certificate ${certId} for ${newCert.manufacturer}.`);

    return newCert;
  }

  updateCertificate(id, updatedData) {
    const idx = this._certificates.findIndex(c => c.id === id);
    if (idx === -1) return false;

    this._certificates[idx] = { ...this._certificates[idx], ...updatedData };

    const session = this.getCurrentSession();
    const user = session ? session.email : "system@lisa.gov.lr";
    this.addSystemLog(user, "CERTIFICATE_MODIFICATION", `Modified attributes for certificate ${id}.`);

    this.updateCertificateAsync(id, updatedData).catch(() => {});
    return true;
  }

  revokeCertificate(id, reason) {
    const idx = this._certificates.findIndex(c => c.id === id);
    if (idx === -1) return false;

    this._certificates[idx].status = "REVOKED";
    this._certificates[idx].revocationReason = reason;
    this._certificates[idx].revocationDate = new Date().toISOString().split("T")[0];

    const session = this.getCurrentSession();
    const user = session ? session.email : "system@lisa.gov.lr";
    this.addSystemLog(user, "CERTIFICATE_REVOCATION", `Revoked certificate ${id}. Reason: ${reason}`);

    this.revokeCertificateAsync(id, reason).catch(() => {});
    return true;
  }

  deleteCertificate(id) {
    const cert = this._certificates.find(c => c.id === id);
    if (!cert) return false;

    this._certificates = this._certificates.filter(c => c.id !== id);

    const session = this.getCurrentSession();
    const user = session ? session.email : "system@lisa.gov.lr";
    this.addSystemLog(user, "CERTIFICATE_DELETION", `Deleted certificate ${id} permanently from ledger.`);

    this.deleteCertificateAsync(id).catch(() => {});
    return true;
  }

  async uploadQRCodeAsync(certId, file) {
    try {
      const client = await this.getInsforgeClient();
      if (!client?.storage?.from) throw new Error("Storage client unavailable");

      // Fixed deterministic path: custom-qrs/{recordId}.png — upsert overwrites on re-upload
      const filePath = `custom-qrs/${certId}.png`;

      const { data, error } = await client.storage
        .from('qr_codes')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (error) throw error;

      const { data: publicUrlData } = client.storage
        .from('qr_codes')
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;

      // Update certificate in local memory
      const certIdx = this._certificates.findIndex(c => c.id === certId);
      if (certIdx !== -1) {
        this._certificates[certIdx].uploadedFileUrl = publicUrl;
        this._certificates[certIdx].uploadedFileKey = filePath;
      }

      // PATCH the database record with both the public URL and the storage key
      await client.database.from("certificates").update({
        uploaded_file_url: publicUrl,
        uploaded_file_key: filePath
      }).eq("qcv_id", certId);

      const session = this.getCurrentSession();
      const user = session ? session.email : "system@lisa.gov.lr";
      this.addSystemLog(user, "QR_UPLOAD", `Custom QR uploaded for ${certId}`);

      return publicUrl;
    } catch (err) {
      console.error("QR Upload failed:", err);
      return null;
    }
  }

  // --- Scans & Verification Logs ---
  getVerificationLogs() {
    return this._verificationLogs;
  }

  async getVerificationLogsAsync() {
    try {
      const client = await this.getInsforgeClient();
      if (!client?.database?.from) throw new Error("InsForge database client is unavailable.");
      const { data, error } = await client.database.from("verification_logs").select("*").order("scanned_at", { ascending: false });
      if (error) throw error;
      if (!data) return this._verificationLogs;
      this._verificationLogs = data.map(row => ({
        id: row.id,
        certId: row.cert_id,
        verificationId: row.verification_id,
        productName: row.product_name,
        timestamp: row.scanned_at,
        outcome: row.outcome,
        location: row.location,
        device: row.device,
        details: row.details
      }));
      return this._verificationLogs;
    } catch (error) {
      console.warn("Remote verification logs fetch failed:", error);
      return this._verificationLogs;
    }
  }

  addVerificationScan(certId) {
    const cert = this.getCertificateById(certId);
    if (!cert) return null;

    // Increment scan count on in-memory certificate
    const cIdx = this._certificates.findIndex(c => c.id === cert.id);
    if (cIdx !== -1) {
      this._certificates[cIdx].qrScans = (this._certificates[cIdx].qrScans || 0) + 1;
    }

    const locations = [
      "RIA Customs Cargo Gate A",
      "Freeport of Monrovia - Terminal 1",
      "Ganta Border Control checkpoint",
      "Buchanan Port Weighing Station",
      "Ministry of Commerce Audit Inspectorate",
      "Bo Waterside Border Gate"
    ];
    const devices = [
      "Customs Handheld Inspector Unit B",
      "Audit Inspector Terminal (Android)",
      "Public Mobile Browser (Safari / iOS)",
      "Standard QR Scanner Station A"
    ];

    const newScanLog = {
      id: "SCAN-" + Math.floor(1000 + Math.random() * 9000),
      certId: cert.id,
      verificationId: cert.verificationId,
      productName: cert.productName,
      timestamp: new Date().toISOString(),
      outcome: cert.status,
      location: locations[Math.floor(Math.random() * locations.length)],
      device: devices[Math.floor(Math.random() * devices.length)]
    };

    this._verificationLogs.unshift(newScanLog);
    return newScanLog;
  }

  async addVerificationScanAsync(certId) {
    try {
      const cert = this.getCertificateById(certId);
      if (!cert) return null;

      const client = await this.getInsforgeClient();
      if (!client?.database?.from) {
        throw new Error("InsForge database client is unavailable.");
      }

      const locations = [
        "RIA Customs Cargo Gate A",
        "Freeport of Monrovia - Terminal 1",
        "Ganta Border Control checkpoint",
        "Buchanan Port Weighing Station",
        "Ministry of Commerce Audit Inspectorate",
        "Bo Waterside Border Gate"
      ];
      const devices = [
        "Customs Handheld Inspector Unit B",
        "Audit Inspector Terminal (Android)",
        "Public Mobile Browser (Safari / iOS)",
        "Standard QR Scanner Station A"
      ];

      const scanId = "SCAN-" + Math.floor(1000 + Math.random() * 9000);
      const session = this.getCurrentSession();
      


      const payload = {
        id: scanId,
        cert_id: cert.id,
        verification_id: cert.verificationId,
        product_name: cert.productName,
        outcome: cert.status,
        location: locations[Math.floor(Math.random() * locations.length)],
        device: devices[Math.floor(Math.random() * devices.length)],
        scanned_by: session?.user?.id || null,
        details: `Scanned at inspector port.`
      };

      const { error } = await client.database.from("verification_logs").insert([payload]);
      if (error) throw error;

      return this.addVerificationScan(certId);
    } catch (error) {
      console.warn("Remote verification scan creation failed:", error);
      return this.addVerificationScan(certId);
    }
  }

  // --- Cryptographic System Logging ---
  getSystemLogs() {
    return this._systemLogs;
  }

  async getSystemLogsAsync() {
    try {
      const client = await this.getInsforgeClient();
      if (!client?.database?.from) throw new Error("InsForge database client is unavailable.");
      const { data, error } = await client.database.from("system_logs").select("*").order("timestamp", { ascending: false });
      if (error) throw error;
      if (!data) return this._systemLogs;
      this._systemLogs = data.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        user: row.user_email,
        action: row.action,
        details: row.details,
        blockHash: row.block_hash
      }));
      return this._systemLogs;
    } catch (error) {
      console.warn("Remote system logs fetch failed:", error);
      return this._systemLogs;
    }
  }

  addSystemLog(user, action, details) {
    const prevLog = this._systemLogs[0];
    const prevHash = prevLog ? prevLog.blockHash : "GENESIS_BLOCK_ZERO_HASH";

    // Simulate blockchain SHA-256 linking for government high fidelity
    let newHash = "";
    for (let i = 0; i < 64; i++) newHash += Math.floor(Math.random() * 16).toString(16);

    const newLog = {
      id: "LOG-" + String(this._systemLogs.length + 1).padStart(4, "0"),
      timestamp: new Date().toISOString(),
      user: user,
      action: action,
      details: details,
      blockHash: newHash
    };

    this._systemLogs.unshift(newLog);
  }

  async addSystemLogAsync(user, action, details) {
    // Always update in-memory log first for immediate UI feedback
    this.addSystemLog(user, action, details);
    try {
      const client = await this.getInsforgeClient();
      if (!client?.database?.from) return false;
      const inMemLog = this._systemLogs[0];
      const payload = {
        id: inMemLog.id,
        user_email: user,
        action: action,
        details: details,
        block_hash: inMemLog.blockHash
      };
      const { error } = await client.database.from("system_logs").insert([payload]);
      if (error) throw error;
      return true;
    } catch (error) {
      console.warn("Remote system log creation failed:", error);
      return false;
    }
  }

  // --- Permission Matrix Control ---
  getPermissions() {
    return this._permissions;
  }

  async getPermissionsAsync() {
    try {
      const client = await this.getInsforgeClient();
      if (!client?.database?.from) throw new Error("InsForge database client is unavailable.");
      const { data, error } = await client.database.from("roles_permissions").select("*");
      if (error) throw error;
      if (!data || data.length === 0) return this._permissions;
      const perms = {};
      data.forEach(row => {
        perms[row.role] = {
          read: row.can_read,
          upload: row.can_upload,
          revoke: row.can_revoke,
          edit: row.can_edit,
          system: row.can_access_system
        };
      });
      this._permissions = perms;
      return perms;
    } catch (error) {
      console.warn("Remote permissions fetch failed:", error);
      return this._permissions;
    }
  }

  savePermissions(newPermissions) {
    this._permissions = newPermissions;
    const session = this.getCurrentSession();
    const user = session ? session.email : "system@lisa.gov.lr";
    this.addSystemLog(user, "PERMISSION_MATRIX_UPDATE", "System security privileges changed in access matrix.");
  }

  async savePermissionsAsync(newPermissions) {
    // Update in-memory immediately
    this.savePermissions(newPermissions);
    try {
      const client = await this.getInsforgeClient();
      if (!client?.database?.from) return false;
      for (const [role, val] of Object.entries(newPermissions)) {
        const payload = {
          can_read: val.read,
          can_upload: val.upload,
          can_revoke: val.revoke,
          can_edit: val.edit,
          can_access_system: val.system
        };
        const { error } = await client.database.from("roles_permissions").update(payload).eq("role", role);
        if (error) throw error;
      }
      return true;
    } catch (error) {
      console.warn("Remote permissions save failed:", error);
      return false;
    }
  }

  generateCertId(categoryCode, issueDateStr, sequenceNumber) {
    if (!categoryCode || !issueDateStr) return "";
    const parts = issueDateStr.split('-');
    if (parts.length !== 3) return "";
    const mm = parts[1];
    const yy = parts[0].substring(2);
    const seq = String(sequenceNumber).padStart(6, '0');
    return `LiSA-QC-${categoryCode.toUpperCase()}-${mm}-${yy}-${seq}`;
  }

  validateCertId(certId) {
    const pattern = /^LiSA-QC-(SP|BT|IV|CC|SA|SL|BOS)-(0[1-9]|1[0-2])-(\d{2})-(\d{3,6})$/i;
    return pattern.test(certId);
  }
}

// Global Export
window.lisaState = new QCVState();
