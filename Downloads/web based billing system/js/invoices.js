/* ============================================================
   invoices.js — bill register, invoice view, A4 print
   ============================================================ */

Pages.invoices = {
  title: "Invoices",

  render(el) {
    renderInvoicesTable(el, { q: "", status: "all", from: "", to: "" });
    setActions(`<button class="btn btn-outline" id="export-inv-btn">⬇ Export CSV</button>
      <button class="btn btn-primary" id="new-bill-btn">${ICONS.plus} New Bill</button>`);
    $("#new-bill-btn").addEventListener("click", () => { location.hash = "#/billing"; });
    $("#export-inv-btn").addEventListener("click", () => {
      const rows = [["Invoice", "Date", "Customer", "Phone", "Mode", "Status", "Taxable", "CGST", "SGST", "Grand Total", "Paid", "Balance"]];
      DB.invoices().forEach(v => rows.push([
        v.no, new Date(v.date).toLocaleString("en-IN"), v.customer?.name || "Walk-in",
        v.customer?.phone || "", v.paymentMode, v.status,
        v.totals.taxable, v.totals.cgst, v.totals.sgst, v.totals.grand,
        v.amountPaid, (v.totals.grand - v.amountPaid).toFixed(2)
      ]));
      exportCSV(`invoices-${todayISO()}.csv`, rows);
      toast("Invoices exported.");
    });
  }
};

/* ---------- register table ---------- */
function renderInvoicesTable(el, f) {
  let list = DB.invoices();

  if (f.q) {
    const q = f.q.toLowerCase();
    list = list.filter(v =>
      v.no.toLowerCase().includes(q) ||
      (v.customer?.name || "").toLowerCase().includes(q) ||
      (v.customer?.phone || "").includes(q));
  }
  if (f.status !== "all") list = list.filter(v => v.status === f.status);
  if (f.from) list = list.filter(v => v.date.slice(0, 10) >= f.from);
  if (f.to) list = list.filter(v => v.date.slice(0, 10) <= f.to);

  const sum = list.reduce((s, v) => s + v.totals.grand, 0);

  el.innerHTML = `
    <div class="toolbar">
      <input type="search" id="inv-q" placeholder="Search invoice no / customer…" value="${esc(f.q)}">
      <select id="inv-status">
        ${["all", "Paid", "Partial", "Unpaid"].map(s =>
          `<option value="${s}" ${f.status === s ? "selected" : ""}>${s === "all" ? "All statuses" : s}</option>`).join("")}
      </select>
      <input type="date" id="inv-from" value="${f.from}" title="From date">
      <span style="color:var(--muted)">→</span>
      <input type="date" id="inv-to" value="${f.to}" title="To date">
      <span class="spacer"></span>
      <span class="hint">${list.length} bills · <b class="mono">${fmtMoney(sum)}</b></span>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th>Invoice</th><th>Date & time</th><th>Customer</th><th>Mode</th>
            <th>Status</th><th class="num">Total</th><th class="num">Balance</th><th></th>
          </tr></thead>
          <tbody>
            ${list.map(v => {
              const bal = Math.max(0, v.totals.grand - v.amountPaid);
              return `
              <tr style="cursor:pointer" data-open="${v.id}">
                <td class="mono"><b>${esc(v.no)}</b></td>
                <td>${fmtDateTime(v.date)}</td>
                <td>${esc(v.customer?.name || "Walk-in")}</td>
                <td>${esc(v.paymentMode)}</td>
                <td>${statusBadge(v.status)}${bal > 0 && v.status !== "Paid" ? `<button class="btn btn-ghost btn-sm" data-settle="${v.id}" style="margin-left:6px;padding:2px 8px;font-size:12px">Settle</button>` : ""}</td>
                <td class="num"><b>${fmtMoney(v.totals.grand)}</b></td>
                <td class="num">${bal > 0 ? fmtMoney(bal) : "—"}</td>
                <td onclick="event.stopPropagation()">
                  <div class="row-actions">
                    <button class="row-btn" data-print="${v.id}" title="Print">${ICONS.print}</button>
                    <button class="row-btn danger" data-del="${v.id}" title="Delete">${ICONS.trash}</button>
                  </div>
                </td>
              </tr>`;
            }).join("") || `
              <tr><td colspan="8" class="empty">
                <div class="big">🗂</div><b>No invoices here</b>
                <p>Adjust the filters, or raise a fresh bill from the counter.</p></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;

  // filter bindings
  $("#inv-q", el).addEventListener("input", debounce(e => {
    f.q = e.target.value; rerenderPreservingFilters(el, f);
  }, 200));
  $("#inv-status", el).addEventListener("change", e => { f.status = e.target.value; rerenderPreservingFilters(el, f); });
  $("#inv-from", el).addEventListener("change", e => { f.from = e.target.value; rerenderPreservingFilters(el, f); });
  $("#inv-to", el).addEventListener("change", e => { f.to = e.target.value; rerenderPreservingFilters(el, f); });

  $$("tr[data-open]", el).forEach(tr => tr.addEventListener("click", () =>
    { location.hash = "#/invoice/" + tr.dataset.open; }));

  $$("[data-print]", el).forEach(b => b.addEventListener("click", e => {
    e.stopPropagation(); printInvoice(b.dataset.print);
  }));
  $$("[data-del]", el).forEach(b => b.addEventListener("click", e => {
    e.stopPropagation();
    const inv = DB.getInvoice(b.dataset.del);
    confirmAction(`Delete ${esc(inv.no)}?`,
      "The bill is removed and its items go back into stock. This cannot be undone.",
      () => { DB.deleteInvoice(inv.id); updateInvoiceBadge(); toast(`${inv.no} deleted; stock restored.`); rerenderCurrentPage(); });
  }));
  $$("[data-settle]", el).forEach(b => b.addEventListener("click", e => {
    e.stopPropagation(); settleBill(b.dataset.settle);
  }));
}

function rerenderPreservingFilters(el, f) {
  renderInvoicesTable(el, f);
}

/* record a payment against a partially-paid bill */
function settleBill(invId) {
  const inv = DB.getInvoice(invId);
  const balance = +(inv.totals.grand - inv.amountPaid).toFixed(2);
  openModal({
    title: `Record payment — ${esc(inv.no)}`,
    body: `
      <div class="form-grid">
        <label class="field"><span class="field-label">Amount received</span>
          <input type="number" id="settle-amt" min="0" step="0.01" max="${balance}" value="${balance}"></label>
        <div class="field"><span class="field-label">Outstanding now</span>
          <div class="stat-value" style="font-size:19px;color:var(--stamp-red)">${fmtMoney(balance)}</div></div>
      </div>`,
    foot: `
      <button class="btn btn-outline" data-close>Cancel</button>
      <button class="btn btn-primary" data-go>Record payment</button>`,
    onMount(backdrop) {
      $("[data-go]", backdrop).addEventListener("click", () => {
        const amt = parseFloat($("#settle-amt", backdrop).value) || 0;
        if (amt <= 0) return toast("Enter an amount above zero.", "err");
        DB.recordPayment(invId, amt);
        closeModal();
        toast(`${fmtMoney(amt)} recorded against ${inv.no}.`);
        updateInvoiceBadge();
        rerenderCurrentPage();
      });
    }
  });
}

/* ============================================================
   INVOICE VIEW PAGE (#/invoice/:id)
   ============================================================ */
Pages.invoiceView = {
  title: "Invoice",

  render(el, id) {
    const inv = DB.getInvoice(id);
    if (!inv) { location.hash = "#/invoices"; return; }

    setActions(`
      <button class="btn btn-outline" id="back-btn">← All invoices</button>
      <button class="btn btn-outline" id="dup-btn">Duplicate as new bill</button>
      <button class="btn btn-primary" id="print-btn">${ICONS.print} Print / Save PDF</button>`);

    $("#back-btn").addEventListener("click", () => { location.hash = "#/invoices"; });
    $("#print-btn").addEventListener("click", () => printInvoice(inv.id));
    $("#dup-btn").addEventListener("click", () => duplicateAsNewBill(inv));

    const s = DB.getSettings();

    el.innerHTML = `
      <div class="invoice-view-page">
        <div class="toolbar">
          <span class="badge ${inv.status === "Paid" ? "ok" : inv.status === "Partial" ? "warn" : "danger"}" style="font-size:14px">${esc(inv.status)}</span>
          <span class="hint">raised ${fmtDateTime(inv.date)} · paid ${fmtMoney(inv.amountPaid)} of ${fmtMoney(inv.totals.grand)}</span>
          <span class="spacer"></span>
          ${inv.status !== "Paid" ? `<button class="btn btn-accent btn-sm" id="view-settle-btn">Record payment</button>` : ""}
        </div>
        <div id="sheet-holder"></div>
      </div>`;

    $("#sheet-holder").innerHTML = buildInvoiceSheet(inv, s);
    $("#view-settle-btn")?.addEventListener("click", () => settleBill(inv.id));
  }
};

/* ---------- the invoice sheet itself (shared with print) ---------- */
function buildInvoiceSheet(inv, s, forPrint = false) {
  const t = inv.totals;
  return `
    <div class="invoice-sheet">
      <div class="invoice-top">
        <div class="invoice-seller">
          <h1>${esc(s.shopName)}</h1>
          <p>${esc(s.tagline || "")}<br>
             ${esc(s.address)}<br>
             ${esc(s.phone)}${s.email ? " · " + esc(s.email) : ""}<br>
             <b>GSTIN:</b> ${esc(s.gstin || "—")}</p>
        </div>
        <div class="invoice-doc-title">
          <h2>TAX INVOICE</h2>
          <div class="invoice-meta-num">
            <div><b>${esc(inv.no)}</b></div>
            <div>Date: ${fmtDate(inv.date)}</div>
            <div>Time: ${new Date(inv.date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
            <div>Payment: ${esc(inv.paymentMode)}</div>
          </div>
        </div>
      </div>

      <hr style="border:none;border-top:1.5px solid var(--ink);margin:16px 0 12px">

      <div class="invoice-buyer">
        <h4>Billed to</h4>
        <p style="color:var(--ink);font-weight:600;font-size:13.5px;margin-bottom:1px">${esc(inv.customer?.name || "Walk-in Customer")}</p>
        <p>
          ${inv.customer?.address ? esc(inv.customer.address) + "<br>" : ""}
          ${inv.customer?.phone ? "Ph: " + esc(inv.customer.phone) : ""}
          ${inv.customer?.gstin ? `<br>GSTIN: <b>${esc(inv.customer.gstin)}</b>` : ""}
        </p>
      </div>

      <table class="invoice-table">
        <thead>
          <tr>
            <th style="width:34px">#</th>
            <th>Item description</th>
            <th>HSN/SAC</th>
            <th class="num">Qty</th>
            <th class="num">Rate</th>
            <th class="num">Disc %</th>
            <th class="num">GST %</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${inv.items.map((it, i) => {
            const gross = it.price * it.qty;
            const amt = gross - gross * ((it.disc || 0) / 100) * (1 + (it.gst || 0) / 100);
            return `
            <tr>
              <td class="num" style="text-align:left;color:var(--muted)">${i + 1}.</td>
              <td class="item-name">${esc(it.name)}</td>
              <td class="mono" style="font-size:11.5px">${esc(it.hsn || "—")}</td>
              <td class="num">${it.qty}${it.unit ? " " + esc(it.unit) : ""}</td>
              <td class="num">${fmtMoney(it.price)}</td>
              <td class="num">${it.disc ? it.disc + "%" : "—"}</td>
              <td class="num">${it.gst}%</td>
              <td class="num"><b>${fmtMoney(amt)}</b></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>

      <div class="invoice-totals">
        <table>
          <tr><td class="num-left">Gross amount</td><td class="num">${fmtMoney(t.gross)}</td></tr>
          ${t.billDiscount > 0 ? `<tr><td class="num-left">Discount</td><td class="num">− ${fmtMoney(t.billDiscount)}</td></tr>` : ""}
          <tr><td class="num-left">Taxable value</td><td class="num">${fmtMoney(t.taxable)}</td></tr>
          <tr><td class="num-left">CGST</td><td class="num">${fmtMoney(t.cgst)}</td></tr>
          <tr><td class="num-left">SGST</td><td class="num">${fmtMoney(t.sgst)}</td></tr>
          <tr class="grand"><td class="num-left">GRAND TOTAL</td><td class="num">${fmtMoney(t.grand)}</td></tr>
          <tr><td class="num-left">Amount paid (${esc(inv.paymentMode)})</td><td class="num">${fmtMoney(inv.amountPaid)}</td></tr>
          ${t.grand - inv.amountPaid > 0.009
            ? `<tr><td class="num-left" style="color:#A93E27;font-weight:700">Balance due</td><td class="num" style="color:#A93E27;font-weight:700">${fmtMoney(t.grand - inv.amountPaid)}</td></tr>`
            : (inv.changeDue > 0 ? `<tr><td class="num-left">Change returned</td><td class="num">${fmtMoney(inv.changeDue)}</td></tr>` : "")}
        </table>
      </div>

      <p class="amount-in-words">Rupees in words: ${numberToWordsRupees(t.grand)}</p>

      ${s.bankNote ? `<p class="bank-note">${esc(s.bankNote)}</p>` : ""}

      <div class="signature-area">
        <div>E. &amp; O.E.<br>${esc(s.terms || "")}</div>
        <div class="for-shop">for <b>${esc(s.shopName)}</b><br><br><b>Authorised signatory</b></div>
      </div>

      ${inv.status === "Paid" && !forPrint ? `<div class="paid-stamp">PAID</div>` : ""}
    </div>`;
}

/* ---------- print pipeline ---------- */
function printInvoice(invId) {
  const inv = DB.getInvoice(invId);
  if (!inv) return;
  const s = DB.getSettings();
  $("#print-area").innerHTML = buildInvoiceSheet(inv, s);
  window.print();
}

/* ---------- duplicate → prefill counter ---------- */
function duplicateAsNewBill(inv) {
  cart = {
    items: inv.items.map(it => ({ ...it })),
    customerId: inv.customerId,
    discountType: "none",
    discountVal: 0
  };
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  location.hash = "#/billing";
  toast(`${inv.no} copied to the counter.`);
}

/* keep sidebar badge in sync */
function updateInvoiceBadge() {
  const n = DB.invoices().length;
  const b = $("#nav-invoice-count");
  if (b) b.textContent = n || "";
}
