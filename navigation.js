/**
 * LiSA Platform - Navigation & Role Guard Injector
 * Dynamically renders the administrative sidebar/header and guards routes based on user role.
 */

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Session & Access Guard
  let session = await window.lisaState.validateAndRestoreSessionAsync();
  let currentPage = window.location.pathname.split("/").pop() || "index.html";
  if (currentPage === "") {
    currentPage = "index.html";
  }

  // Public verify page does not require a logged-in session
  if (currentPage === "verify.html") {
    return;
  }

  // To allow direct page access during development (e.g. Live Server or local files) without login loops,
  // we automatically establish a mock session matching the page context if accessed directly.
  if (!session && currentPage !== "index.html") {
    let mockRole = "admin";
    let mockEmail = "admin@lisa.gov.lr";
    
    if (currentPage === "supervisor.html") {
      mockRole = "supervisor";
      mockEmail = "supervisor@lisa.gov.lr";
    }
    
    session = window.lisaState.login(mockEmail, mockRole);
  }

  // If not logged in and not on login page, redirect to login
  if (!session) {
    if (currentPage !== "index.html") {
      window.location.href = "index.html";
      return;
    }
  } else {
    // If logged in and on login page, redirect to respective dashboard
    if (currentPage === "index.html") {
      if (session.role === "supervisor") {
        window.location.href = "supervisor.html";
      } else {
        window.location.href = "dashboard.html";
      }
      return;
    }

    // Role-based restrictions
    if (session.role === "supervisor") {
      // Supervisor is strictly forbidden from Admin pages
      const forbiddenPages = ["dashboard.html", "create-qcv.html", "system-control.html"];
      if (forbiddenPages.includes(currentPage)) {
        sessionStorage.setItem('lisa_nav_error', "Access Denied: You do not have administrative clearance to access this panel.");
        window.location.href = "supervisor.html";
        return;
      }
    }
  }

  // If we are on index.html (and not redirected), do not inject navigation
  if (currentPage === "index.html") {
    return;
  }

  // 2. Inject Navigation Layout Elements
  injectLayout(session, currentPage);

  // Check and show redirect/auth error toast if present
  const navError = sessionStorage.getItem('lisa_nav_error');
  if (navError) {
    showGlobalNavToast(navError, true);
    sessionStorage.removeItem('lisa_nav_error');
  }
});

function injectLayout(session, currentPage) {
  // Find layout containers in document
  const appContainer = document.querySelector(".app-container");
  if (!appContainer) return;

  // Insert Sidebar before the main content container
  const sidebar = document.createElement("aside");
  sidebar.className = "sidebar";
  sidebar.id = "lisa-sidebar";

  const emailDisplay = session?.email || "unknown@lisa.gov.lr";
  const roleDisplay = session?.role || "inspector";
  const initials = emailDisplay.substring(0, 2).toUpperCase();

  // Create menu links based on role
  let menuHtml = "";
  if (session.role === "supervisor") {
    menuHtml = `
      <li class="sidebar-item">
        <a href="supervisor.html" class="sidebar-link ${currentPage === "supervisor.html" ? "active" : ""}">
          <svg><use href="#icon-home"></use></svg>
          Dashboard
        </a>
      </li>
      <li class="sidebar-item">
        <a href="registry.html" class="sidebar-link ${currentPage === "registry.html" ? "active" : ""}">
          <svg><use href="#icon-registry"></use></svg>
          Certificate Registry
        </a>
      </li>
      <li class="sidebar-item">
        <a href="qr-management.html" class="sidebar-link ${currentPage === "qr-management.html" ? "active" : ""}">
          <svg><use href="#icon-qr"></use></svg>
          QR Management
        </a>
      </li>
      <li class="sidebar-item">
        <a href="verification-logs.html" class="sidebar-link ${currentPage === "verification-logs.html" ? "active" : ""}">
          <svg><use href="#icon-logs"></use></svg>
          Verification Logs
        </a>
      </li>
    `;
  } else {
    // Admin & Developer Menu Links
    menuHtml = `
      <li class="sidebar-item">
        <a href="dashboard.html" class="sidebar-link ${currentPage === "dashboard.html" ? "active" : ""}">
          <svg><use href="#icon-home"></use></svg>
          Dashboard
        </a>
      </li>
      <li class="sidebar-item">
        <a href="registry.html" class="sidebar-link ${currentPage === "registry.html" ? "active" : ""}">
          <svg><use href="#icon-registry"></use></svg>
          Certificate Registry
        </a>
      </li>
      <li class="sidebar-item">
        <a href="create-qcv.html" class="sidebar-link ${currentPage === "create-qcv.html" ? "active" : ""}">
          <svg><use href="#icon-create"></use></svg>
          Create QCV
        </a>
      </li>
      <li class="sidebar-item">
        <a href="qr-management.html" class="sidebar-link ${currentPage === "qr-management.html" ? "active" : ""}">
          <svg><use href="#icon-qr"></use></svg>
          QR Management
        </a>
      </li>
      <li class="sidebar-item">
        <a href="verification-logs.html" class="sidebar-link ${currentPage === "verification-logs.html" ? "active" : ""}">
          <svg><use href="#icon-logs"></use></svg>
          Verification Logs
        </a>
      </li>
      <li class="sidebar-item">
        <a href="system-control.html" class="sidebar-link ${currentPage === "system-control.html" ? "active" : ""}">
          <svg><use href="#icon-security"></use></svg>
          System Control
        </a>
      </li>
    `;
  }

  sidebar.innerHTML = `
    <div class="sidebar-header">
      <img src="logo.jpg" alt="LiSA Logo" class="sidebar-header-logo">
    </div>
    <ul class="sidebar-menu">
      ${menuHtml}
    </ul>
    <div class="sidebar-footer">
      <div class="sidebar-profile">
        <div class="profile-avatar">${initials}</div>
        <div class="profile-details">
          <div class="profile-name">${emailDisplay}</div>
          <div class="profile-role">${roleDisplay}</div>
        </div>
      </div>
      <button id="lisa-logout-btn" style="
        width: 100%; margin-top: 12px; padding: 9px 12px; font-size: 13px;
        background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.85);
        border: 1px solid rgba(255,255,255,0.2); border-radius: 8px;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        gap: 8px; font-weight: 600; transition: all 0.2s; font-family: var(--font-sans);
      ">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Logout
      </button>
    </div>
  `;

  appContainer.insertBefore(sidebar, appContainer.firstChild);

  // 3. Inject Header inside Main Content
  const mainContent = document.querySelector(".main-content");
  if (mainContent) {
    const header = document.createElement("header");
    header.className = "top-header";
    header.innerHTML = `
      <div class="hamburger-menu-btn" id="lisa-hamburger">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
      </div>
      <div class="header-search-wrapper">
        <svg class="search-icon-fixed" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input type="text" class="header-search-input" id="lisa-global-search" placeholder="Quick search certificate or serial...">
      </div>
      <div class="header-actions">
        <a href="${roleDisplay === 'supervisor' ? 'supervisor.html' : 'dashboard.html'}" class="header-profile-badge" style="text-decoration: none; cursor: pointer;">${roleDisplay} Portal</a>
        <button class="header-btn" id="lisa-notifications-btn" title="System Alerts" style="position:relative;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
          <span style="position:absolute; top:8px; right:8px; width:8px; height:8px; background-color:var(--lisa-gold); border-radius:50%;"></span>
        </button>
        <!-- Notifications Dropdown Popover -->
        <div id="lisa-notifications-dropdown" class="notifications-dropdown" style="display:none; position:absolute; right:20px; top:70px; width:360px; background:#fff; border:1px solid var(--lisa-border); border-radius:8px; box-shadow:0 10px 25px rgba(0,0,0,0.15); z-index:1000; overflow:hidden; text-align:left;">
          <div class="dropdown-header" style="background:var(--lisa-green); color:#fff; padding:12px 16px; font-weight:700; font-size:14px; display:flex; justify-content:space-between; align-items:center;">
            <span>Platform Alerts & Logs</span>
            <span class="badge" style="background:var(--lisa-gold); color:var(--lisa-green); font-size:11px; padding:2px 6px; border-radius:10px; font-weight:bold;" id="lisa-notif-count">0</span>
          </div>
          <div class="dropdown-body" id="lisa-notif-list" style="max-height:300px; overflow-y:auto; padding:8px 0;">
            <!-- Injected dynamically -->
          </div>
          <div class="dropdown-footer" style="border-top:1px solid var(--lisa-border); padding:10px 16px; text-align:center; background:#f9fbf9;">
            <a href="system-control.html" style="font-size:12px; color:var(--lisa-green); font-weight:700; text-decoration:none; display:block;">View Full Security Ledger</a>
          </div>
        </div>
      </div>
    `;

    mainContent.insertBefore(header, mainContent.firstChild);
  }

  // 4. Inject SVG Icons Sprite
  injectIconSprite();

  // 5. Add Event Listeners for Nav interactions
  const logoutBtn = document.getElementById("lisa-logout-btn");
  logoutBtn.addEventListener("click", () => {
    window.lisaState.logout();
    window.location.href = "index.html";
  });
  logoutBtn.addEventListener("mouseenter", () => {
    logoutBtn.style.background = "rgba(239,68,68,0.15)";
    logoutBtn.style.borderColor = "rgba(239,68,68,0.4)";
    logoutBtn.style.color = "#ef4444";
  });
  logoutBtn.addEventListener("mouseleave", () => {
    logoutBtn.style.background = "rgba(255,255,255,0.1)";
    logoutBtn.style.borderColor = "rgba(255,255,255,0.2)";
    logoutBtn.style.color = "rgba(255,255,255,0.85)";
  });

  const hamburger = document.getElementById("lisa-hamburger");
  const activeSidebar = document.getElementById("lisa-sidebar");
  
  // Programmatically create and append the .sidebar-backdrop div to the document body
  let backdrop = document.getElementById("lisa-sidebar-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "lisa-sidebar-backdrop";
    backdrop.className = "sidebar-backdrop";
    document.body.appendChild(backdrop);
  }

  if (hamburger && activeSidebar) {
    hamburger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isActive = activeSidebar.classList.toggle("open-mobile");
      if (isActive) {
        backdrop.classList.add("is-active");
      } else {
        backdrop.classList.remove("is-active");
      }
    });

    // Close sidebar on backdrop click (clicking outside)
    backdrop.addEventListener("click", () => {
      activeSidebar.classList.remove("open-mobile");
      backdrop.classList.remove("is-active");
    });

    document.addEventListener("click", (e) => {
      if (activeSidebar.classList.contains("open-mobile")) {
        if (!activeSidebar.contains(e.target) && e.target !== hamburger && e.target !== backdrop) {
          activeSidebar.classList.remove("open-mobile");
          backdrop.classList.remove("is-active");
        }
      }
    });
  }

  // Add mobile-only dynamic overlay styling (removing duplicated sidebar styles now handled in styles.css)
  const style = document.createElement("style");
  style.innerHTML = `
    @media (max-width: 992px) {
      .hamburger-menu-btn {
        display: block !important;
      }
    }
    
    /* Dynamic Notifications dropdown layout */
    .notifications-dropdown {
      animation: fadeIn 0.2s ease-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .notif-item {
      padding: 12px 16px;
      border-bottom: 1px solid #f0f3f1;
      display: flex;
      gap: 12px;
      transition: background 0.2s;
      cursor: pointer;
    }
    .notif-item:hover {
      background: #f7faf8;
    }
    .notif-icon {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-top: 5px;
      flex-shrink: 0;
    }
  `;
  document.head.appendChild(style);
  
  // Set up notifications dropdown interactions
  const notifBtn = document.getElementById("lisa-notifications-btn");
  const notifDropdown = document.getElementById("lisa-notifications-dropdown");
  
  if (notifBtn && notifDropdown) {
    notifBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isVisible = notifDropdown.style.display === "block";
      
      if (!isVisible) {
        // Populate notifications dynamically from state logs
        const logs = window.lisaState.getSystemLogs() || [];
        const countBadge = document.getElementById("lisa-notif-count");
        const listContainer = document.getElementById("lisa-notif-list");
        
        if (countBadge) {
          countBadge.innerText = Math.min(logs.length, 5);
        }
        
        if (listContainer) {
          listContainer.innerHTML = "";
          if (logs.length === 0) {
            listContainer.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted); font-size:13px;">No new alerts.</div>`;
          } else {
            logs.slice(0, 5).forEach(log => {
              const item = document.createElement("div");
              item.className = "notif-item";
              item.onclick = () => {
                window.location.href = "system-control.html";
              };
              
              let dotClass = "background-color: #f59e0b;"; // yellow
              if (log.action.includes("CREATION")) dotClass = "background-color: #10b981;"; // green
              if (log.action.includes("REVOCATION")) dotClass = "background-color: #ef4444;"; // red
              
              const localTime = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              
              item.innerHTML = `
                <div class="notif-icon" style="${dotClass}"></div>
                <div style="flex:1;">
                  <div style="font-size:12.5px; color:#1f2937; line-height:1.3; font-weight: 500;"><strong>${log.action}</strong>: ${log.details}</div>
                  <div style="font-size:10.5px; color:#9ca3af; margin-top:3px;">${localTime} by ${log.user.split('@')[0]}</div>
                </div>
              `;
              listContainer.appendChild(item);
            });
          }
        }
        
        notifDropdown.style.display = "block";
      } else {
        notifDropdown.style.display = "none";
      }
    });
    
    // Close dropdown on click outside
    document.addEventListener("click", (e) => {
      if (!notifDropdown.contains(e.target) && e.target !== notifBtn && !notifBtn.contains(e.target)) {
        notifDropdown.style.display = "none";
      }
    });
  }
  
  // Set up global search redirection if pressed Enter
  const globalSearch = document.getElementById("lisa-global-search");
  if (globalSearch) {
    globalSearch.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && globalSearch.value.trim() !== "") {
        const query = encodeURIComponent(globalSearch.value.trim());
        window.location.href = `registry.html?q=${query}`;
      }
    });
  }
}

function injectIconSprite() {
  if (document.getElementById("lisa-icon-sprite")) return;

  const sprite = document.createElement("div");
  sprite.id = "lisa-icon-sprite";
  sprite.style.display = "none";
  sprite.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg">
      <symbol id="icon-home" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
        <polyline points="9 22 9 12 15 12 15 22"></polyline>
      </symbol>
      <symbol id="icon-registry" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
        <polyline points="10 9 9 9 8 9"></polyline>
      </symbol>
      <symbol id="icon-create" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="12" y1="18" x2="12" y2="12"></line>
        <line x1="9" y1="15" x2="15" y2="15"></line>
      </symbol>
      <symbol id="icon-qr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="7" height="7"></rect>
        <rect x="14" y="3" width="7" height="7"></rect>
        <rect x="14" y="14" width="7" height="7"></rect>
        <rect x="3" y="14" width="7" height="7"></rect>
        <line x1="7" y1="7" x2="7.01" y2="7"></line>
        <line x1="17" y1="7" x2="17.01" y2="7"></line>
        <line x1="17" y1="17" x2="17.01" y2="17"></line>
        <line x1="7" y1="17" x2="7.01" y2="17"></line>
      </symbol>
      <symbol id="icon-logs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 20h9"></path>
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
      </symbol>
      <symbol id="icon-security" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
      </symbol>
    </svg>
  `;
  document.body.appendChild(sprite);
}

function showGlobalNavToast(message, isError = false) {
  // Ensure toast styles are injected
  if (!document.getElementById('nav-toast-style')) {
    const styleEl = document.createElement("style");
    styleEl.id = 'nav-toast-style';
    styleEl.innerHTML = `
      .nav-toast {
        position: fixed;
        bottom: 32px;
        right: 32px;
        background-color: var(--lisa-green);
        color: #fff;
        padding: 14px 22px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 6px 20px rgba(0,0,0,0.35);
        z-index: 99999;
        opacity: 0;
        transform: translateY(12px);
        transition: opacity 0.3s, transform 0.3s;
        max-width: 400px;
        line-height: 1.5;
      }
      .nav-toast.show { opacity: 1; transform: translateY(0); }
    `;
    document.head.appendChild(styleEl);
  }

  let toast = document.getElementById('nav-toast-el');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'nav-toast-el';
    toast.className = 'nav-toast';
    document.body.appendChild(toast);
  }
  toast.style.backgroundColor = isError ? '#dc2626' : 'var(--lisa-green)';
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}
