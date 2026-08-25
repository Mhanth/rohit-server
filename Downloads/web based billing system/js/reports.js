/* ============================================================
   reports.js — date-range sales analysis with CSV export
   ============================================================ */

Pages.reports = {
  title: "Reports",

  render(el) {
    const today = todayISO();
    el.innerHTML = `
      <div class="toolbar">
        <div class="range-chips" id="range-chips">
          <button class="chip on" data-days="1">Today</button>
          <button class="chip" data-days="7">7 days</button>
          <button class="chip" data-days="30">30 days</button>
          <button class="chip" data-days="365">This year</button>
        </div>
        <span class="spacer"></span>
        <input type="date" id="rep-from" value="${daysAgoISO(0)}">
        <span style="color:var(--muted)">→</span>
        <input type="date" id="rep-to" value="${today}">
        <button class="btn btn-outline" id="rep-export">⬇ Export CSV</button>
      </div>

      <div id="report-body"></div>`;

    const from = $("#rep-from", el), to = $("#rep-to", el);
    let range = { from: from.value, to: to.value };

    function applyRange() {
      range = { from: from.value, to: to.value };
      renderReport($("#report-body", el), range);
    }

    $$("#range-chips .chip", el).forEach(ch => ch.addEventListener("click", () => {
      $$("#range-chips .chip", el).forEach(x => x.classList.toggle("on", x === ch));
      const d = Number(ch.dataset.days);
      if (d === 365) {
        from.value = `${new Date().getFullYear()}-01-01`;
        to.value = today;
      } else {
        from.value = daysAgoISO(d - 1);
        to.value = today;
      }
      applyRange();
    }));

    from.addEventListener("change", () => {
      $$("#range-chips .chip", el).forEach(x => x.classList.remove("on"));
      applyRange();
    });
    to.addEventListener("change", applyRange);

    $("#rep-export", el).addEventListener("click", () => exportReportCSV(range));

    renderReport($("#report-body", el), range);
  }
};

function inRange(v, range) {
  const d = v.date.slice(0, 10);
  return (!range.from || d >= range.from) && (!range.to || d <= range.to);
}

function renderReport(el, range) {
  const list = DB.invoices().filter(v => inRange(v, range));
  const revenue = list.reduce((s, v) => s + v.totals.grand, 0);
  const taxCollected = list.reduce((s, v) => s + v.totals.cgst + v.totals.sgst, 0);
  const discounts = list.reduce((s, v) => s + v.totals.billDiscount, 0);
  const pending = list.reduce((s, v) => s + Math.max(0, v.totals.grand - v.amountPaid), 0);

  // day-wise series
  const byDay = {};
  list.forEach(v => {
    const d = v.date.slice(0, 10);
    byDay[d] = (byDay[d] || 0) + v.totals.grand;
  });
  const dayEntries = Object.entries(byDay).sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-14);
  const maxDay = Math.max(...dayEntries.map(e => e[1]), 1);

  // product / category / mode breakdown
  const byProduct = {}, catTotals = {}, byMode = {};
  let unitsSold = {};
  list.forEach(v => v.items.forEach(it => {
    const val = it.taxable * (1 + (it.gst || 0) / 100);
    byProduct[it.name] = (byProduct[it.name] || 0) + val;
    unitsSold[it.name] = (unitsSold[it.name] || 0) + it.qty;
    const cat = DB.getProduct(it.productId)?.category || "Other";
    catTotals[cat] = (catTotals[cat] || 0) + val;
    byMode[v.paymentMode] = (byMode[v.paymentMode] || 0) + v.totals.grand;
  }));
  const topProducts = Object.entries(byProduct).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxProd = Math.max(...topProducts.map(p => p[1]), 1);

  el.innerHTML = `
    <div class="stat-row">
      ${statCard("Revenue", fmtMoney(revenue), `${list.length} bills in range`, "green", "💰")}
      ${statCard("GST collected", fmtMoney(taxCollected), "CGST + SGST", "teal", "🧮")}
      ${statCard("Discounts given", fmtMoney(discounts), "bill-level only", "gold", "🏷")}
      ${statCard("Payment pending", fmtMoney(pending), "from this range", "red", "⏳")}
    </div>

    <div class="grid-2-1">
      <div class="card card-pad">
        <div class="section-head" style="margin-top:0"><h3>Day-wise collection</h3><span class="hint">last 14 active days of the range</span></div>
        ${dayEntries.length ? `
          <div class="chart-bars">
            ${dayEntries.map(([d, total]) => `
              <div class="chart-bar-col" title="${fmtDate(d)} · ${fmtMoney(total)}">
                <div class="chart-bar-val">${fmtCompact(total)}</div>
                <div class="chart-bar" style="height:${total / maxDay * 100}%"></div>
                <div class="chart-bar-label">${d.slice(8)}/${d.slice(5, 7)}</div>
              </div>`).join("")}
          </div>`
        : `<p class="empty">No bills in this range.</p>`}
      </div>
      <div class="card card-pad">
        <div class="section-head" style="margin-top:0"><h3>Category mix</h3></div>
        <div id="rep-donut"></div>
      </div>
    </div>

    <div class="section-head"><h3>Payment modes</h3></div>
    <div class="card card-pad">
      <div class="legend" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));display:grid;gap:10px">
        ${Object.entries(byMode).sort((a, b) => b[1] - a[1]).map(([mode, amt], i) => `
          <div class="legend-item">
            <span class="legend-dot" style="background:${DONUT_COLORS[i % DONUT_COLORS.length]}"></span>
            <span>${esc(mode)}</span>
            <span class="pct num">${fmtMoney(amt)}</span>
          </div>`).join("") || `<span class="hint">No payments yet.</span>`}
      </div>
    </div>

    <div class="section-head"><h3>Best sellers</h3><span class="hint">by revenue including tax</span></div>
    <div class="card card-pad">
      <div class="hbar-list">
        ${topProducts.map(([name, val]) => `
          <div class="hbar-item">
            <div class="hbar-name" title="${esc(name)}">${esc(name)}</div>
            <div class="hbar-track"><div class="hbar-fill" style="width:${val / maxProd * 100}%"></div></div>
            <div class="num">${fmtMoney(val)} <span style="color:var(--muted)">· ${fmtNum(unitsSold[name])}u</span></div>
          </div>`).join("") || `<p class="empty">Nothing sold in this range.</p>`}
      </div>
    </div>`;

  renderDonut($("#rep-donut"), catTotals);
}

function exportReportCSV(range) {
  const list = DB.invoices().filter(v => inRange(v, range));
  const rows = [["Invoice", "Date", "Customer", "Mode", "Status", "Taxable", "CGST", "SGST", "Total", "Paid", "Balance"]];
  list.forEach(v => rows.push([
    v.no, new Date(v.date).toLocaleString("en-IN"), v.customer?.name || "Walk-in",
    v.paymentMode, v.status,
    v.totals.taxable, v.totals.cgst, v.totals.sgst, v.totals.grand,
    v.amountPaid, Math.max(0, v.totals.grand - v.amountPaid).toFixed(2)
  ]));
  exportCSV(`sales-report-${range.from}_to_${range.to}.csv`, rows);
  toast(`Report exported (${list.length} bills).`);
}
