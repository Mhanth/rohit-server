/* ============================================================
   settings.js — shop profile, billing defaults, backup/restore,
   password, data reset
   ============================================================ */

Pages.settings = {
  title: "Settings",

  render(el) {
    const s = DB.getSettings();

    el.innerHTML = `
      <div class="settings-grid">
        <div class="card card-pad">
          <div class="section-head" style="margin-top:0"><h3>Shop profile</h3><span class="hint">appears on every invoice</span></div>
          <label class="field"><span class="field-label">Shop name</span>
            <input id="st-name" type="text" value="${esc(s.shopName)}"></label>
          <label class="field"><span class="field-label">Tagline</span>
            <input id="st-tag" type="text" value="${esc(s.tagline || "")}"></label>
          <label class="field"><span class="field-label">Address</span>
            <textarea id="st-addr" rows="2">${esc(s.address)}</textarea></label>
          <div class="form-grid">
            <label class="field"><span class="field-label">Phone</span>
              <input id="st-phone" type="text" value="${esc(s.phone)}"></label>
            <label class="field"><span class="field-label">Email</span>
              <input id="st-email" type="text" value="${esc(s.email || "")}"></label>
          </div>
          <label class="field"><span class="field-label">Your GSTIN</span>
            <input id="st-gstin" type="text" value="${esc(s.gstin || "")}" style="text-transform:uppercase"></label>
        </div>

        <div>
          <div class="card card-pad" style="margin-bottom:16px">
            <div class="section-head" style="margin-top:0"><h3>Billing defaults</h3></div>
            <div class="form-grid">
              <label class="field"><span class="field-label">Currency symbol</span>
                <input id="st-currency" type="text" maxlength="3" value="${esc(s.currencySymbol)}"></label>
              <label class="field"><span class="field-label">Invoice prefix</span>
                <input id="st-prefix" type="text" maxlength="6" value="${esc(s.invoicePrefix)}"></label>
              <label class="field"><span class="field-label">Default GST %</span>
                <select id="st-gst">
                  ${[0, 5, 12, 18, 28].map(g => `<option value="${g}" ${s.defaultGst === g ? "selected" : ""}>${g}%</option>`).join("")}
                </select></label>
              <label class="field"><span class="field-label">Low-stock alert at</span>
                <input id="st-lowstock" type="number" min="0" step="1" value="${s.lowStockThreshold}"></label>
            </div>
            <label class="field"><span class="field-label">Invoice footer note (bank / UPI details)</span>
              <input id="st-bank" type="text" value="${esc(s.bankNote || "")}" placeholder="e.g. UPI: shop@upi"></label>
            <label class="field"><span class="field-label">Terms & conditions line</span>
              <textarea id="st-terms" rows="2">${esc(s.terms || "")}</textarea></label>
            <button class="btn btn-primary" id="save-settings-btn">Save settings</button>
          </div>

          <div class="card card-pad" style="margin-bottom:16px">
            <div class="section-head" style="margin-top:0"><h3>Data safety</h3></div>
            <p style="font-size:13px;color:var(--muted);margin-bottom:12px">
              Everything lives in this browser. Take a backup regularly — or move it to another computer.</p>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
              <button class="btn btn-outline" id="backup-btn">⬇ Download backup (.json)</button>
              <button class="btn btn-outline" id="restore-btn">⬆ Restore from backup</button>
              <input type="file" id="restore-file" accept=".json,application/json" style="display:none">
            </div>
          </div>

          <div class="card card-pad">
            <div class="section-head" style="margin-top:0"><h3>Password & reset</h3></div>
            <div class="form-grid">
              <label class="field"><span class="field-label">Current password</span>
                <input id="pw-old" type="password" autocomplete="current-password"></label>
              <label class="field"><span class="field-label">New password</span>
                <input id="pw-new" type="password" autocomplete="new-password"></label>
            </div>
            <button class="btn btn-primary" id="pw-btn">Change password</button>
            <hr style="border:none;border-top:1px solid var(--line);margin:18px 0 14px">
            <button class="btn btn-danger btn-sm" id="reset-btn">Erase everything & restore demo data</button>
          </div>
        </div>
      </div>`;

    $("#save-settings-btn").addEventListener("click", () => {
      DB.updateSettings({
        shopName: $("#st-name").value.trim() || "My Shop",
        tagline: $("#st-tag").value.trim(),
        address: $("#st-addr").value.trim(),
        phone: $("#st-phone").value.trim(),
        email: $("#st-email").value.trim(),
        gstin: $("#st-gstin").value.trim().toUpperCase(),
        currencySymbol: $("#st-currency").value.trim() || "₹",
        invoicePrefix: ($("#st-prefix").value.trim() || "INV").toUpperCase(),
        defaultGst: Number($("#st-gst").value),
        lowStockThreshold: Math.max(0, parseInt($("#st-lowstock").value) || 0),
        bankNote: $("#st-bank").value.trim(),
        terms: $("#st-terms").value.trim()
      });
      applyShopIdentity();
      toast("Settings saved.");
    });

    /* ---------- backup / restore ---------- */
    $("#backup-btn").addEventListener("click", () => {
      downloadFile(`ledgerdesk-backup-${todayISO()}.json`, DB.exportJSON(), "application/json");
      toast("Backup downloaded.");
    });

    const fileInput = $("#restore-file");
    $("#restore-btn").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const f = fileInput.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        confirmAction("Restore this backup?",
          "Everything currently in the system will be replaced by the backup file.",
          () => {
            try {
              DB.importJSON(reader.result);
              applyShopIdentity();
              updateInvoiceBadge();
              toast("Backup restored.");
              rerenderCurrentPage();
            } catch (e) {
              toast(e.message.includes("JSON") ? "That file isn't a valid backup." : e.message, "err");
            }
          }, "Restore backup");
      };
      reader.readAsText(f);
      fileInput.value = "";
    });

    /* ---------- password ---------- */
    $("#pw-btn").addEventListener("click", () => {
      const oldP = $("#pw-old").value, newP = $("#pw-new").value;
      if (!oldP || !newP) return toast("Fill both password fields.", "err");
      if (newP.length < 5) return toast("New password needs at least 5 characters.", "err");
      const session = getSession();
      if (!DB.changePassword(session.username, oldP, newP)) {
        return toast("Current password is wrong.", "err");
      }
      $("#pw-old").value = ""; $("#pw-new").value = "";
      toast("Password changed.");
    });

    /* ---------- factory reset ---------- */
    $("#reset-btn").addEventListener("click", () => {
      confirmAction("Erase all data?",
        "Every invoice, item and customer will be wiped and the demo data restored.",
        () => {
          localStorage.removeItem(CART_KEY);
          DB.resetAll();
          applyShopIdentity();
          updateInvoiceBadge();
          toast("Fresh start — demo data loaded.");
          rerenderCurrentPage();
        }, "Erase & reset");
    });
  }
};
