/* ============================================================
   app.js — session gate, hash router, shell wiring
   ============================================================ */

const SESSION_KEY = "ledgerdesk_session";

function getSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); }
  catch { return null; }
}
function setSession(s) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function clearSession() { sessionStorage.removeItem(SESSION_KEY); }

/* ---------- routing table ---------- */
function resolveRoute(hash) {
  const parts = (hash || "").replace(/^#\//, "").split("/");
  const name = parts[0] || "dashboard";
  const param = parts[1] || null;
  if (name === "invoice" && param && Pages.invoiceView) return { page: Pages.invoiceView, key: "invoice", param };
  if (Pages[name]) return { page: Pages[name], key: name };
  return { page: Pages.dashboard, key: "dashboard" };
}

let currentKey = null;

function navigate() {
  const { page, key, param } = resolveRoute(location.hash);
  currentKey = key;

  $$(".nav-item").forEach(a => a.classList.toggle("active", a.dataset.route === key));
  $("#page-title").textContent = page.title || "";
  $("#page-actions").innerHTML = "";
  $("#page").innerHTML = "";

  try {
    page.render($("#page"), param);
  } catch (err) {
    console.error(err);
    $("#page").innerHTML = `<div class="card card-pad"><p style="color:#A93E27">Something broke rendering this page — check the console.</p></div>`;
  }

  $(".sidebar")?.classList.remove("open");
  updateInvoiceBadge();
}

function rerenderCurrentPage() {
  navigate();
}

/* ---------- identity on the shell ---------- */
function applyShopIdentity() {
  const s = DB.getSettings();
  const session = getSession();
  $("#sidebar-shop-name").textContent = s.shopName;
  document.title = `${s.shopName} · LedgerDesk`;
  if (session) {
    $("#user-name").textContent = session.name || session.username;
    $("#user-avatar").textContent = (session.name || session.username || "A").charAt(0).toUpperCase();
  }
}

function updateInvoiceBadge() {
  const b = $("#nav-invoice-count");
  if (!b) return;
  const n = DB.invoices().length;
  b.textContent = n ? String(n) : "";
  b.style.display = n ? "" : "none";
}

/* ---------- login / logout ---------- */
function showApp() {
  $("#login-screen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  applyShopIdentity();
  updateInvoiceBadge();
  navigate();
}

function showLogin() {
  $("#app").classList.add("hidden");
  $("#login-screen").classList.remove("hidden");
  $("#login-error").classList.add("hidden");
  $("#login-user").value = "";
  $("#login-pass").value = "";
  $("#login-user").focus();
}

function bindAuth() {
  $("#login-form").addEventListener("submit", e => {
    e.preventDefault();
    const user = DB.verifyLogin(
      $("#login-user").value.trim(),
      $("#login-pass").value
    );
    if (!user) {
      $("#login-error").classList.remove("hidden");
      $("#login-pass").value = "";
      return;
    }
    setSession(user);
    toast(`Welcome back, ${user.name}.`);
    showApp();
  });

  $("#logout-btn").addEventListener("click", () => {
    confirmAction("Log out?", "The counter stays as-is; you'll sign back in to reach it.", () => {
      clearSession();
      showLogin();
    }, "Log out");
  });
}

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", () => {
  bindAuth();

  $("#menu-toggle").addEventListener("click", () =>
    $(".sidebar").classList.toggle("open"));
  // close drawer when tapping the dark overlay area on small screens
  document.addEventListener("click", e => {
    const sb = $(".sidebar");
    if (sb?.classList.contains("open") &&
        !sb.contains(e.target) && !$("#menu-toggle").contains(e.target)) {
      sb.classList.remove("open");
    }
  });

  window.addEventListener("hashchange", navigate);

  if (getSession()) showApp();
  else showLogin();
});
