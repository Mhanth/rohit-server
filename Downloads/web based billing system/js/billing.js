/* ============================================================
   billing.js — the counter: search catalogue, build cart,
   apply discounts, take payment, save the bill
   ============================================================ */

const CART_KEY = "ledgerdesk_cart_v1";

let cart = { items: [], customerId: null, discountType: "none", discountVal: 0 };

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (raw) cart = { ...cart, ...JSON.parse(raw) };
  } catch { /* fresh start */ }
}
function persistCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

Pages.billing = {
  title: "New Bill",

  render(el) {
    loadCart();
    el.innerHTML = `
      <div class="billing-layout">

        <!-- ============ catalogue ============ -->
        <section>
          <div class="catalog-head">
            <input type="search" id="pos-search" placeholder="Search items by name… (Enter adds the first match)">
            <select id="pos-cat"><option value="">All categories</option></select>
          </div>
          <div id="pos-grid" class="catalog-grid"></div>
        </section>

        <!-- ============ cart ============ -->
        <section class="card cart-panel">
          <div class="cart-head">
            <h3>Current bill</h3>
            <span class="hint mono" id="cart-count"></span>
          </div>
          <div class="cart-customer">
            <span class="field-label">Customer</span>
            <select id="pos-customer"></select>
          </div>
          <div class="cart-items" id="cart-items"></div>
          <div class="cart-summary">
            <div class="discount-row">
              <span class="ctrl-label">Bill discount</span>
              <select id="disc-type">
                <option value="none">None</option>
                <option value="pct">%</option>
                <option value="amt">${esc(DB.getSettings().currencySymbol)}</option>
              </select>
              <input type="number" id="disc-val" min="0" placeholder="0" disabled>
            </div>
            <div id="summary-rows"></div>

            <button class="btn btn-accent btn-block" id="charge-btn" style="margin-top:12px">
              Charge <b class="mono" id="charge-amt"></b> →
            </button>
            ${cart.items.length ? `<button class="btn btn-ghost btn-block btn-sm" id="clear-cart-btn" style="margin-top:8px">Clear bill</button>` : ""}
          </div>
        </section>
      </div>`;

    // category filter
    const catSel = $("#pos-cat", el);
    DB.categories().forEach(c => {
      const o = document.createElement("option");
      o.value = c; o.textContent = c;
      catSel.appendChild(o);
    });

    renderCustomerPicker();
    bindCatalog(el);
    renderCart();

    $("#pos-cat", el).addEventListener("change", () => renderGrid($("#pos-search", el).value));
    $("#pos-search", el).addEventListener("input", debounce(e => renderGrid(e.target.value), 150));
    $("#pos-search", el).addEventListener("keydown", e => {
      if (e.key === "Enter") {
        const first = $(".tile:not(.out)", $("#pos-grid"));
        first?.click();
      }
    });
    $("#disc-type", el).addEventListener("change", e => {
      cart.discountType = e.target.value;
      $("#disc-val", el).disabled = e.target.value === "none";
      persistCart(); renderCart();
    });
    $("#disc-val", el).addEventListener("input", debounce(e => {
      cart.discountVal = Math.max(0, parseFloat(e.target.value) || 0);
      persistCart(); renderCart();
    }, 300));
    $("#pos-customer", el).addEventListener("change", e => {
      cart.customerId = e.target.value === "walkin" ? null : e.target.value;
      persistCart();
    });
    $("#charge-btn", el).addEventListener("click", openTender);
    $("#clear-cart-btn", el)?.addEventListener("click", () => {
      confirmAction("Clear this bill?", "All scanned items will be removed from the counter.", () => {
        cart = { items: [], customerId: cart.customerId, discountType: "none", discountVal: 0 };
        persistCart(); renderCart(); toast("Bill cleared.");
      }, "Clear bill");
    });
  }
};

/* ---------- customer picker ---------- */
function renderCustomerPicker() {
  const sel = $("#pos-customer");
  if (!sel) return;
  const customers = DB.customers().sort((a, b) => a.name.localeCompare(b.name));
  sel.innerHTML = `
    <option value="walkin">Walk-in customer</option>
    ${customers.map(c => `<option value="${c.id}" ${cart.customerId === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
    <option value="__new">＋ Add new customer…</option>`;
  sel.addEventListener("change", e => {
    if (e.target.value === "__new") {
      customerForm(null, (newC) => {
        cart.customerId = newC.id;
        persistCart();
        renderCustomerPicker();
      });
    } else {
      cart.customerId = e.target.value === "walkin" ? null : e.target.value;
      persistCart();
    }
  });
}

/* ---------- catalogue ---------- */
function bindCatalog() {
  renderGrid("");
}

function renderGrid(query) {
  const grid = $("#pos-grid");
  if (!grid) return;
  const s = DB.getSettings();
  const q = (query || "").trim().toLowerCase();
  const catFilter = $("#pos-cat")?.value || "";
  let list = DB.products();

  if (catFilter) list = list.filter(p => p.category === catFilter);
  if (q) list = list.filter(p =>
    p.name.toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q));
  list.sort((a, b) => a.name.localeCompare(b.name));

  grid.innerHTML = list.map(p => {
    const inCart = cart.items.find(i => i.productId === p.id);
    const tracked = p.trackStock !== false;
    const stockLeft = tracked ? Number(p.stock) : Infinity;
    const out = tracked && stockLeft <= 0;

    return `
      <button class="tile ${out ? "out" : ""} ${inCart ? "added" : ""}" data-id="${p.id}" ${out ? "disabled" : ""}>
        <span class="tile-cat">${esc(p.category || "General")} · ${p.gst}%</span>
        <span class="tile-name">${esc(p.name)}</span>
        <span class="tile-foot">
          <span class="tile-price">${fmtMoney(p.price * (1 + p.gst / 100))}</span>
          <span class="tile-stock ${tracked && stockLeft <= s.lowStockThreshold ? "low" : ""}">
            ${tracked ? `${fmtNum(stockLeft)} ${esc(p.unit || "")}` : "service"}
          </span>
        </span>
      </button>`;
  }).join("") || `
    <div class="empty" style="grid-column:1/-1">
      <div class="big">🔍</div><b>No items match</b>
      <p>Try another name or clear the category filter.</p></div>`;

  $$(".tile[data-id]", grid).forEach(t => t.addEventListener("click", () =>
    addToCart(t.dataset.id)));
}

function addToCart(productId) {
  const p = DB.getProduct(productId);
  if (!p) return;

  const existing = cart.items.find(i => i.productId === productId);
  const tracked = p.trackStock !== false;
  const currentQty = existing ? existing.qty : 0;

  if (tracked && currentQty + 1 > Number(p.stock)) {
    return toast(`Only ${fmtNum(p.stock)} ${p.unit || "unit(s)"} of “${p.name}” in stock.`, "err");
  }

  if (existing) existing.qty += 1;
  else cart.items.push({
    productId: p.id, name: p.name, hsn: p.hsn,
    qty: 1, price: p.price, gst: p.gst, disc: 0
  });

  persistCart();
  renderCart();
  refreshTileState();
}

function setQty(productId, qty) {
  const item = cart.items.find(i => i.productId === productId);
  const p = DB.getProduct(productId);
  if (!item) return;
  qty = Math.max(1, Math.round(Number(qty) || 1));
  if (p && p.trackStock !== false && qty > Number(p.stock)) {
    qty = Math.floor(Number(p.stock));
    toast(`Capped at available stock (${qty}).`, "err");
  }
  item.qty = qty;
  persistCart(); renderCart(); refreshTileState();
}

function setLineDisc(productId, disc) {
  const item = cart.items.find(i => i.productId === productId);
  if (!item) return;
  item.disc = Math.min(100, Math.max(0, parseFloat(disc) || 0));
  persistCart(); renderCart();
}

function removeFromCart(productId) {
  cart.items = cart.items.filter(i => i.productId !== productId);
  persistCart(); renderCart(); refreshTileState();
}

/* keep tiles' highlight/out-state in sync without rebuilding the grid */
function refreshTileState() {
  const q = $("#pos-search")?.value || "";
  renderGrid(q);
}

/* ---------- cart rendering ---------- */
function renderCart() {
  const itemsEl = $("#cart-items");
  if (!itemsEl) return;

  $("#cart-count").textContent = cart.items.length ? `${cart.items.length} line${cart.items.length > 1 ? "s" : ""}` : "";

  itemsEl.innerHTML = cart.items.map(it => `
    <div class="cart-item">
      <div class="cart-item-name">${esc(it.name)}</div>
      <div class="cart-item-line-total">${fmtMoney(lineGross(it))}</div>
      <div class="cart-item-sub">@${fmtMoney(it.price)} × ${it.qty} · GST ${it.gst}%${it.disc ? ` · −${it.disc}%` : ""}</div>
      <div class="cart-item-controls">
        <span class="qty-stepper">
          <button data-dec="${it.productId}">−</button>
          <input class="qty-input" type="number" min="1" value="${it.qty}" data-qty="${it.productId}">
          <button data-inc="${it.productId}">+</button>
        </span>
        <label class="ctrl-label">disc%
          <input class="line-disc" type="number" min="0" max="100" value="${it.disc || ""}" data-disc="${it.productId}" placeholder="0">
        </label>
        <button class="row-btn danger remove-line" data-rm="${it.productId}" title="Remove">${ICONS.trash}</button>
      </div>
    </div>`).join("") || `
    <div class="empty" style="padding:34px 10px">
      <div class="big">🧾</div><b>Counter is empty</b>
      <p>Tap an item from the catalogue to start this bill.</p></div>`;

  // bindings
  $$("[data-inc]", itemsEl).forEach(b => b.addEventListener("click", () =>
    setQty(b.dataset.inc, (cart.items.find(i => i.productId === b.dataset.inc)?.qty || 0) + 1)));
  $$("[data-dec]", itemsEl).forEach(b => b.addEventListener("click", () => {
    const it = cart.items.find(i => i.productId === b.dataset.dec);
    if (it && it.qty <= 1) removeFromCart(b.dataset.dec);
    else setQty(b.dataset.dec, it.qty - 1);
  }));
  $$("[data-qty]", itemsEl).forEach(i => i.addEventListener("change", () =>
    setQty(i.dataset.qty, i.value)));
  $$("[data-disc]", itemsEl).forEach(i => i.addEventListener("input", debounce(() =>
    setLineDisc(i.dataset.disc, i.value), 250)));
  $$("[data-rm]", itemsEl).forEach(b => b.addEventListener("click", () =>
    removeFromCart(b.dataset.rm)));

  // totals
  const totals = DB.calcTotals(cart.items, { type: cart.discountType, value: cart.discountVal });
  $("#summary-rows").innerHTML = `
    <div class="summary-row"><span>Gross amount</span><b>${fmtMoney(totals.gross)}</b></div>
    ${totals.billDiscount > 0 ? `<div class="summary-row"><span>Discount</span><b style="color:var(--ok)">− ${fmtMoney(totals.billDiscount)}</b></div>` : ""}
    <div class="summary-row"><span>Taxable value</span><b>${fmtMoney(totals.taxable)}</b></div>
    <div class="summary-row"><span>CGST</span><b>${fmtMoney(totals.cgst)}</b></div>
    <div class="summary-row"><span>SGST</span><b>${fmtMoney(totals.sgst)}</b></div>
    <div class="summary-row total"><span>Total payable</span><b>${fmtMoney(totals.grand)}</b></div>`;

  $("#charge-amt").textContent = fmtMoney(totals.grand);

  // sync discount controls
  $("#disc-type").value = cart.discountType;
  const dv = $("#disc-val");
  dv.disabled = cart.discountType === "none";
  if (document.activeElement !== dv) dv.value = cart.discountVal || "";
}

function lineGross(it) {
  const gross = it.price * it.qty;
  return gross - gross * ((Number(it.disc) || 0) / 100) * (1 + it.gst / 100);
}

/* ---------- tender / payment ---------- */
let tenderMode = "Cash";

function openTender() {
  if (!cart.items.length) return toast("Add at least one item to charge.", "err");

  const totals = DB.calcTotals(cart.items, { type: cart.discountType, value: cart.discountVal });
  tenderMode = "Cash";
  const custName = cart.customerId ? DB.getCustomer(cart.customerId)?.name : "Walk-in Customer";

  openModal({
    title: "Take payment",
    body: `
      <p style="font-size:13.5px;margin-bottom:12px">
        Billed to <b>${esc(custName)}</b> · payable
        <b class="mono" style="font-size:16px">${fmtMoney(totals.grand)}</b></p>
      <span class="field-label">Payment mode</span>
      <div class="chips" id="pay-chips" style="margin-bottom:14px">
        ${["Cash", "UPI", "Card", "Credit (due)"].map(m => `
          <button class="chip ${m === "Cash" ? "on" : ""}" data-mode="${m}">${m}</button>`).join("")}
      </div>
      <div class="tender-row">
        <label class="field"><span class="field-label">Amount received</span>
          <input type="number" id="paid-input" min="0" step="0.01" value="${totals.grand.toFixed(2)}"></label>
        <div class="field"><span class="field-label">Change to return</span>
          <div class="stat-value" id="change-view" style="font-size:19px">${DB.getSettings().currencySymbol}0.00</div></div>
      </div>
      <label class="field" style="display:flex;gap:8px;align-items:center;font-size:13.5px">
        <input type="checkbox" id="print-after" checked style="width:auto"> Print invoice after saving</label>`,
    foot: `
      <button class="btn btn-outline" data-close>Back</button>
      <button class="btn btn-accent" data-complete>Complete bill ✓</button>`,
    onMount(backdrop) {
      const paidInput = $("#paid-input", backdrop);
      const changeView = $("#change-view", backdrop);

      function refreshChange() {
        const paid = parseFloat(paidInput.value) || 0;
        const diff = paid - totals.grand;
        const short = diff < -0.009 && tenderMode !== "Credit (due)";
        changeView.style.color = short ? "#A93E27" : "var(--ok)";
        changeView.textContent = diff >= 0 ? fmtMoney(diff) : `${fmtMoney(-diff)} still due`;
      }
      paidInput.addEventListener("input", refreshChange);
      refreshChange();

      $$("#pay-chips .chip", backdrop).forEach(ch => ch.addEventListener("click", () => {
        tenderMode = ch.dataset.mode;
        $$("#pay-chips .chip", backdrop).forEach(x => x.classList.toggle("on", x === ch));
        if (tenderMode === "Credit (due)") paidInput.value = "0";
        else if (!parseFloat(paidInput.value)) paidInput.value = totals.grand.toFixed(2);
        refreshChange();
      }));

      $("[data-complete]", backdrop).addEventListener("click", () => {
        completeBill(backdrop, totals);
      });
    }
  });
}

function completeBill(backdrop, totals) {
  const customer = cart.customerId ? DB.getCustomer(cart.customerId) : null;
  const paidMode = tenderMode;
  let paidAmt = parseFloat($("#paid-input", backdrop).value) || 0;
  if (paidMode === "Credit (due)") paidAmt = 0;

  const inv = DB.createInvoice({
    items: JSON.parse(JSON.stringify(cart.items)),
    customerId: cart.customerId,
    customer: customer
      ? { name: customer.name, phone: customer.phone, address: customer.address, gstin: customer.gstin }
      : { name: "Walk-in Customer", phone: "", address: "", gstin: "" },
    billDiscount: { type: cart.discountType, value: cart.discountVal },
    paymentMode: paidMode.replace(" (due)", ""),
    amountPaid: paidMode === "Credit (due)" ? 0 : paidAmt
  });

  const shouldPrint = $("#print-after", backdrop)?.checked;
  closeModal();

  // reset counter
  cart = { items: [], customerId: cart.customerId, discountType: "none", discountVal: 0 };
  localStorage.removeItem(CART_KEY);
  renderCart();
  refreshTileState();
  updateInvoiceBadge();

  showSuccess(inv, shouldPrint);
}

/* ---------- success screen ---------- */
function showSuccess(inv, printIt) {
  openModal({
    title: "Bill saved",
    body: `
      <div style="text-align:center;padding:6px 0 2px">
        <div style="font-family:var(--font-display);font-size:44px;line-height:1">✓</div>
        <p style="font-size:15px;margin-top:6px">
          <b class="mono">${esc(inv.no)}</b> recorded for
          <b>${fmtMoney(inv.totals.grand)}</b></p>
        <p style="font-size:13px;color:var(--muted)">
          ${inv.status === "Paid"
            ? (inv.changeDue > 0 ? `Return change of <b>${fmtMoney(inv.changeDue)}</b>` : "Paid in full")
            : `<span class="badge warn">${inv.status}</span> — ${fmtMoney(inv.totals.grand - inv.amountPaid)} still due`}
        </p>
      </div>`,
    foot: `
      <button class="btn btn-outline" data-newbill>New bill</button>
      <button class="btn btn-outline" data-viewinv>Open invoice</button>
      ${printIt ? "" : `<button class="btn btn-primary" data-printnow>${ICONS.print} Print</button>`}`,
    onMount(backdrop) {
      $("[data-newbill]", backdrop).addEventListener("click", () => { closeModal(); rerenderCurrentPage(); });
      $("[data-viewinv]", backdrop).addEventListener("click", () => { location.hash = "#/invoice/" + inv.id; });
      $("[data-printnow]", backdrop).addEventListener("click", () => { printInvoice(inv.id); });
    }
  });

  if (printIt) setTimeout(() => printInvoice(inv.id), 350);
}
