/* ============================================================
   customers.js — customer master + per-customer purchase history
   ============================================================ */

Pages.customers = {
  title: "Customers",

  render(el) {
    renderCustomersTable(el, "");
    setActions(`<button class="btn btn-primary" id="add-customer-btn">
      ${ICONS.plus} Add customer</button>`);
    $("#add-customer-btn").addEventListener("click", () => customerForm());
  }
};

function renderCustomersTable(el, query) {
  const q = query.trim().toLowerCase();
  let list = DB.customers();

  if (q) list = list.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.phone || "").includes(q) ||
    (c.email || "").toLowerCase().includes(q));

  // purchase summary per customer
  const invoices = DB.invoices();

  el.innerHTML = `
    <div class="toolbar">
      <input type="search" id="cust-search" placeholder="Search by name, phone or email…" value="${esc(query)}">
      <span class="spacer"></span>
      <span class="hint">${list.length} customer${list.length === 1 ? "" : "s"}</span>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th>Name</th><th>Phone</th><th>GSTIN</th><th class="num">Bills</th>
            <th class="num">Total business</th><th class="num">Pending</th><th></th>
          </tr></thead>
          <tbody>
            ${list.map(c => {
              const mine = invoices.filter(v => v.customerId === c.id);
              const total = mine.reduce((s, v) => s + v.totals.grand, 0);
              const pending = mine.reduce((s, v) => s + Math.max(0, v.totals.grand - v.amountPaid), 0);
              return `
              <tr>
                <td><b>${esc(c.name)}</b>${c.address ? `<div style="font-size:12px;color:var(--muted)">${esc(c.address)}</div>` : ""}</td>
                <td class="mono">${esc(c.phone || "—")}</td>
                <td class="mono" style="font-size:12px">${esc(c.gstin || "—")}</td>
                <td class="num">${mine.length}</td>
                <td class="num"><b>${fmtMoney(total)}</b></td>
                <td class="num">${pending > 0 ? `<span style="color:var(--stamp-red);font-weight:600">${fmtMoney(pending)}</span>` : "—"}</td>
                <td>
                  <div class="row-actions">
                    <button class="row-btn" data-view="${c.id}" title="Purchase history">🧾</button>
                    <button class="row-btn" data-edit="${c.id}" title="Edit">${ICONS.edit}</button>
                    <button class="row-btn danger" data-del="${c.id}" title="Delete">${ICONS.trash}</button>
                  </div>
                </td>
              </tr>`;
            }).join("") || `
              <tr><td colspan="7" class="empty">
                <div class="big">🧍</div><b>No customers found</b>
                <p>${q ? "Nothing matches that search." : "Save regulars here to auto-fill their details on bills and track pending payments."}</p>
              </td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;

  $("#cust-search", el).addEventListener("input", debounce(e =>
    renderCustomersTable(el, e.target.value), 200));

  $$("[data-edit]", el).forEach(b => b.addEventListener("click", () =>
    customerForm(DB.getCustomer(b.dataset.edit))));

  $$("[data-del]", el).forEach(b => b.addEventListener("click", () => {
    const c = DB.getCustomer(b.dataset.del);
    confirmAction(`Delete “${esc(c.name)}”?`,
      "Their past invoices stay in the books; they just stop appearing in the customer list.",
      () => { DB.deleteCustomer(c.id); toast(`Deleted “${c.name}”`); rerenderCurrentPage(); });
  }));

  $$("[data-view]", el).forEach(b => b.addEventListener("click", () =>
    showCustomerHistory(DB.getCustomer(b.dataset.view))));
}

/* ---------- add / edit form ---------- */
function customerForm(existing, onDone) {
  openModal({
    title: existing ? `Edit “${esc(existing.name)}”` : "Add a new customer",
    body: `
      <div class="form-grid">
        <label class="field span-2"><span class="field-label">Name *</span>
          <input id="cf-name" type="text" value="${esc(existing?.name || "")}" placeholder="Full name or business name"></label>
        <label class="field"><span class="field-label">Phone</span>
          <input id="cf-phone" type="text" value="${esc(existing?.phone || "")}" placeholder="+91 …"></label>
        <label class="field"><span class="field-label">Email</span>
          <input id="cf-email" type="text" value="${esc(existing?.email || "")}" placeholder="optional"></label>
        <label class="field span-2"><span class="field-label">Address</span>
          <textarea id="cf-address" rows="2">${esc(existing?.address || "")}</textarea></label>
        <label class="field span-2"><span class="field-label">GSTIN</span>
          <input id="cf-gstin" type="text" value="${esc(existing?.gstin || "")}" placeholder="For B2B tax invoices (optional)" style="text-transform:uppercase"></label>
      </div>`,
    foot: `
      <button class="btn btn-outline" data-close>Cancel</button>
      <button class="btn btn-primary" data-save>${existing ? "Save changes" : "Add customer"}</button>`,
    onMount(backdrop) {
      $("[data-save]", backdrop).addEventListener("click", () => {
        const name = $("#cf-name", backdrop).value.trim();
        if (!name) return toast("Give the customer a name.", "err");
        DB.saveCustomer({
          id: existing?.id,
          name,
          phone: $("#cf-phone", backdrop).value.trim(),
          email: $("#cf-email", backdrop).value.trim(),
          address: $("#cf-address", backdrop).value.trim(),
          gstin: $("#cf-gstin", backdrop).value.trim().toUpperCase()
        });
        closeModal();
        toast(existing ? "Customer updated." : `“${name}” added.`);
        onDone ? onDone() : rerenderCurrentPage();
      });
    }
  });
}

/* ---------- purchase history modal ---------- */
function showCustomerHistory(c) {
  const invoices = DB.invoices().filter(v => v.customerId === c.id);
  const total = invoices.reduce((s, v) => s + v.totals.grand, 0);

  openModal({
    title: `${esc(c.name)} — purchase history`,
    wide: true,
    body: `
      <p style="font-size:13px;color:var(--muted);margin-bottom:10px">
        ${invoices.length} bill${invoices.length === 1 ? "" : "s"} · lifetime value
        <b class="mono" style="color:var(--ink)">${fmtMoney(total)}</b></p>
      ${invoices.length ? `
        <table class="data">
          <thead><tr><th>Invoice</th><th>Date</th><th>Status</th><th class="num">Amount</th><th></th></tr></thead>
          <tbody>
            ${invoices.map(v => `
              <tr>
                <td class="mono">${esc(v.no)}</td>
                <td>${fmtDate(v.date)}</td>
                <td>${statusBadge(v.status)}</td>
                <td class="num"><b>${fmtMoney(v.totals.grand)}</b></td>
                <td><a href="#/invoice/${v.id}" onclick="closeModal()" style="font-size:13px;font-weight:600">View →</a></td>
              </tr>`).join("")}
          </tbody>
        </table>`
      : `<p class="empty">No bills yet for this customer.</p>`}`
  });
}
