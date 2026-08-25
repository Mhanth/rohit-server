/* ============================================================
   products.js — item master: CRUD, stock, categories
   ============================================================ */

Pages.products = {
  title: "Items & Stock",

  render(el) {
    renderProductsTable(el, "");
    bindProductToolbar(el);
    setActions(`<button class="btn btn-primary" id="add-product-btn">
      ${ICONS.plus} Add item</button>`);
    $("#add-product-btn").addEventListener("click", () => productForm());
  }
};

function renderProductsTable(el, query) {
  const s = DB.getSettings();
  const q = query.trim().toLowerCase();
  let list = DB.products();

  if (q) list = list.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.category || "").toLowerCase().includes(q) ||
    (p.hsn || "").includes(q));

  el.innerHTML = `
    <div class="toolbar">
      <input type="search" id="prod-search" placeholder="Search items…" value="${esc(query)}">
      <span class="spacer"></span>
      <span class="hint">${list.length} item${list.length === 1 ? "" : "s"} · ${DB.categories().length} categories</span>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th>Item</th><th>Category</th><th>HSN/SAC</th><th>Type</th>
            <th class="num">Rate (excl. GST)</th><th class="num">GST %</th><th class="num">Stock</th><th></th>
          </tr></thead>
          <tbody>
            ${list.map(p => {
              const low = p.trackStock !== false && Number(p.stock) <= s.lowStockThreshold;
              return `
              <tr>
                <td><b>${esc(p.name)}</b></td>
                <td>${esc(p.category || "—")}</td>
                <td class="mono">${esc(p.hsn || "—")}</td>
                <td>${p.trackStock === false ? '<span class="badge info">Service</span>' : '<span class="badge neutral">Goods</span>'}</td>
                <td class="num">${fmtMoney(p.price)}</td>
                <td class="num">${p.gst}%</td>
                <td class="num">${p.trackStock === false ? "—" :
                  `<span style="${low ? "color:var(--stamp-red);font-weight:700" : ""}">${fmtNum(p.stock)} ${esc(p.unit || "")}${low ? " ⚠" : ""}</span>`}
                </td>
                <td>
                  <div class="row-actions">
                    <button class="row-btn" data-edit="${p.id}" title="Edit">${ICONS.edit}</button>
                    ${p.trackStock !== false ? `<button class="row-btn" data-stock="${p.id}" title="Add stock">📥</button>` : ""}
                    <button class="row-btn danger" data-del="${p.id}" title="Delete">${ICONS.trash}</button>
                  </div>
                </td>
              </tr>`;
            }).join("") || `
              <tr><td colspan="8" class="empty">
                <div class="big">📦</div><b>No items found</b>
                <p>${q ? "Nothing matches that search." : "Add your first item to start billing — goods or services both live here."}</p>
                <button class="btn btn-primary btn-sm" onclick="document.getElementById('add-product-btn').click()">Add an item</button>
              </td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;

  $("#prod-search", el).addEventListener("input", debounce(e =>
    renderProductsTable(el, e.target.value), 200));

  $$("[data-edit]", el).forEach(b => b.addEventListener("click", () =>
    productForm(DB.getProduct(b.dataset.edit))));

  $$("[data-stock]", el).forEach(b => b.addEventListener("click", () =>
    addStockForm(DB.getProduct(b.dataset.stock), el)));

  $$("[data-del]", el).forEach(b => b.addEventListener("click", () => {
    const p = DB.getProduct(b.dataset.del);
    confirmAction(`Delete “${esc(p.name)}”?`,
      "Past invoices keep their records, but this item disappears from new bills and the catalogue.",
      () => { DB.deleteProduct(p.id); toast(`Deleted “${p.name}”`); renderProductsTable(el, $("#prod-search", el)?.value || ""); });
  }));
}

function bindProductToolbar() { /* search is rebound per render */ }

function setActions(html) {
  $("#page-actions").innerHTML = html;
}

/* ---------- add / edit form ---------- */
function productForm(existing, onDone) {
  const s = DB.getSettings();
  const cats = DB.categories();
  const isService = existing?.trackStock === false;

  openModal({
    title: existing ? `Edit “${esc(existing.name)}”` : "Add a new item",
    wide: true,
    body: `
      <div class="form-grid">
        <label class="field span-2"><span class="field-label">Item / service name *</span>
          <input id="pf-name" type="text" value="${esc(existing?.name || "")}" placeholder="e.g. Basmati Rice 5kg or Home AC Service"></label>
        <label class="field"><span class="field-label">Category</span>
          <input id="pf-cat" type="text" list="cat-list" value="${esc(existing?.category || "")}" placeholder="e.g. Grocery">
          <datalist id="cat-list">${cats.map(c => `<option value="${esc(c)}">`).join("")}</datalist></label>
        <label class="field"><span class="field-label">HSN / SAC code</span>
          <input id="pf-hsn" type="text" value="${esc(existing?.hsn || "")}" placeholder="e.g. 1006 or 998714"></label>
        <label class="field"><span class="field-label">Rate (${s.currencySymbol}, excluding GST) *</span>
          <input id="pf-price" type="number" min="0" step="0.01" value="${existing?.price ?? ""}"></label>
        <label class="field"><span class="field-label">GST rate % *</span>
          <select id="pf-gst">
            ${[0, 5, 12, 18, 28].map(g => `<option value="${g}" ${Number(existing?.gst ?? s.defaultGst) === g ? "selected" : ""}>${g}%</option>`).join("")}
          </select></label>
        <label class="field"><span class="field-label">Type</span>
          <select id="pf-type">
            <option value="goods" ${!isService ? "selected" : ""}>Goods (stock tracked)</option>
            <option value="service" ${isService ? "selected" : ""}>Service (no stock)</option>
          </select></label>
        <div id="pf-stock-wrap" class="field" style="${isService ? "display:none" : ""}">
          <label><span class="field-label">Opening stock</span>
            <input id="pf-stock" type="number" min="0" step="1" value="${existing?.stock ?? 0}"></label>
          <label style="margin-top:6px;display:block"><span class="field-label">Unit</span>
            <input id="pf-unit" type="text" value="${esc(existing?.unit || "pc")}" placeholder="pc / kg / bag"></label>
        </div>
      </div>`,
    foot: `
      <button class="btn btn-outline" data-close>Cancel</button>
      <button class="btn btn-primary" data-save>${existing ? "Save changes" : "Add item"}</button>`,
    onMount(backdrop) {
      $("#pf-type", backdrop).addEventListener("change", e => {
        $("#pf-stock-wrap", backdrop).style.display = e.target.value === "service" ? "none" : "";
      });
      $("[data-save]", backdrop).addEventListener("click", () => {
        const name = $("#pf-name", backdrop).value.trim();
        const price = parseFloat($("#pf-price", backdrop).value);
        if (!name) return toast("Give the item a name.", "err");
        if (!(price >= 0)) return toast("Enter a valid rate.", "err");

        const type = $("#pf-type", backdrop).value;
        DB.saveProduct({
          id: existing?.id,
          name,
          category: $("#pf-cat", backdrop).value.trim(),
          hsn: $("#pf-hsn", backdrop).value.trim(),
          price,
          gst: Number($("#pf-gst", backdrop).value),
          trackStock: type !== "service",
          stock: type === "service" ? 0 : Math.max(0, parseInt($("#pf-stock", backdrop).value) || 0),
          unit: $("#pf-unit", backdrop).value.trim() || "pc"
        });
        closeModal();
        toast(existing ? "Item updated." : `“${name}” added to the catalogue.`);
        onDone ? onDone() : rerenderCurrentPage();
      });
    }
  });
}

/* ---------- quick stock-in ---------- */
function addStockForm(product, el) {
  openModal({
    title: `Add stock — ${esc(product.name)}`,
    body: `
      <div class="form-grid">
        <label class="field"><span class="field-label">Quantity received</span>
          <input id="sf-qty" type="number" min="1" step="1" value="10"></label>
        <div class="field"><span class="field-label">Current stock</span>
          <div class="stat-value" style="font-size:19px">${fmtNum(product.stock)} ${esc(product.unit || "")}</div></div>
      </div>`,
    foot: `
      <button class="btn btn-outline" data-close>Cancel</button>
      <button class="btn btn-primary" data-add>Add to stock</button>`,
    onMount(backdrop) {
      $("[data-add]", backdrop).addEventListener("click", () => {
        const qty = parseInt($("#sf-qty", backdrop).value) || 0;
        if (qty <= 0) return toast("Enter a quantity above zero.", "err");
        DB.saveProduct({ ...product, stock: Number(product.stock) + qty });
        closeModal();
        toast(`${qty} ${product.unit || "units"} added to “${product.name}”.`);
        rerenderCurrentPage();
      });
    }
  });
}
