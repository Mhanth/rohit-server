/* ============================================================
   dashboard.js — overview: today's counter, 7-day chart,
   category mix, top items, recent bills
   ============================================================ */

Pages.dashboard = {
  title: "Dashboard",

  render(el) {
    const invoices = DB.invoices();
    const today = todayISO();

    const todays = invoices.filter(v => v.date.slice(0, 10) === today);
    const todayTotal = todays.reduce((s, v) => s + v.totals.grand, 0);
    const monthKey = today.slice(0, 7);
    const monthInvoices = invoices.filter(v => v.date.slice(0, 7) === monthKey);
    const monthTotal = monthInvoices.reduce((s, v) => s + v.totals.grand, 0);
    const lowStock = DB.products().filter(p =>
      p.trackStock !== false && Number(p.stock) <= DB.getSettings().lowStockThreshold
    );
    const unpaid = invoices.filter(v => v.status !== "Paid");

    // last 7 days series
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const iso = daysAgoISO(i);
      const total = invoices
        .filter(v => v.date.slice(0, 10) === iso)
        .reduce((s, v) => s + v.totals.grand, 0);
      days.push({ iso, label: new Date(iso).toLocaleDateString("en-IN", { weekday: "short" }), total });
    }
    const maxDay = Math.max(...days.map(d => d.total), 1);

    el.innerHTML = `
      <div class="stat-row">
        ${statCard("Today's collection", fmtMoney(todayTotal), `${todays.length} bill${todays.length === 1 ? "" : "s"} today`, "green", "💰")}
        ${statCard("This month", fmtMoney(monthTotal), `${monthInvoices.length} bills raised`, "gold", "🗓")}
        ${statCard("Payment pending", fmtMoney(unpaid.reduce((s, v) => s + (v.totals.grand - v.amountPaid), 0)), `${unpaid.length} bills not fully paid`, "red", "⏳")}
        ${statCard("Low stock items", String(lowStock.length), lowStock.length ? "Needs restocking" : "All sufficiently stocked", "teal", "📦")}
      </div>

      <div class="grid-2-1">
        <div class="card card-pad">
          <div class="section-head" style="margin-top:0">
            <h3>Sales — last 7 days</h3>
            <span class="hint">hover a bar for the exact figure</span>
          </div>
          <div class="chart-bars">
            ${days.map(d => `
              <div class="chart-bar-col">
                <div class="chart-bar-val">${fmtCompact(d.total)}</div>
                <div class="chart-bar" style="height:${Math.max(2, d.total / maxDay * 100)}%"></div>
                <div class="chart-bar-label">${d.label}</div>
              </div>`).join("")}
          </div>
        </div>
        <div class="card card-pad">
          <div class="section-head" style="margin-top:0"><h3>Sales by category</h3></div>
          <div id="dash-donut"></div>
        </div>
      </div>

      <div class="section-head">
        <h3>Top items this month</h3>
        <a href="#/reports" class="hint">full reports →</a>
      </div>
      <div class="card card-pad"><div class="hbar-list" id="dash-top"></div></div>

      <div class="section-head">
        <h3>Recent bills</h3>
        <a href="#/invoices" class="hint">all invoices →</a>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Mode</th><th>Status</th><th class="num">Amount</th></tr></thead>
            <tbody>
              ${invoices.slice(0, 6).map(v => `
                <tr style="cursor:pointer" data-open="${v.id}">
                  <td class="mono">${esc(v.no)}</td>
                  <td>${fmtDateTime(v.date)}</td>
                  <td>${esc(v.customer?.name || "Walk-in")}</td>
                  <td>${esc(v.paymentMode)}</td>
                  <td>${statusBadge(v.status)}</td>
                  <td class="num"><b>${fmtMoney(v.totals.grand)}</b></td>
                </tr>`).join("") || `<tr><td colspan="6" class="empty">No bills yet — raise your first one from <b>New Bill</b>.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;

    // donut: revenue share by product category (this month)
    const catTotals = {};
    monthInvoices.forEach(v => v.items.forEach(it => {
      const cat = DB.getProduct(it.productId)?.category || "Other";
      catTotals[cat] = (catTotals[cat] || 0) + it.taxable;
    }));
    renderDonut($("#dash-donut"), catTotals);

    // top products this month by taxable value
    const prodTotals = {};
    monthInvoices.forEach(v => v.items.forEach(it => {
      prodTotals[it.name] = (prodTotals[it.name] || 0) + it.taxable;
    }));
    const top = Object.entries(prodTotals).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const maxTop = Math.max(...top.map(t => t[1]), 1);
    $("#dash-top").innerHTML = top.map(([name, val]) => `
      <div class="hbar-item">
        <div class="hbar-name" title="${esc(name)}">${esc(name)}</div>
        <div class="hbar-track"><div class="hbar-fill" style="width:${val / maxTop * 100}%"></div></div>
        <div class="num">${fmtMoney(val)}</div>
      </div>`).join("") || `<p class="empty">Nothing sold yet.</p>`;

    // row click → invoice view
    $$("tr[data-open]", el).forEach(tr =>
      tr.addEventListener("click", () => { location.hash = "#/invoice/" + tr.dataset.open; })
    );
  }
};

/* ---------- shared little builders ---------- */
function statCard(label, value, sub, tone, emoji) {
  return `
    <div class="card stat-card">
      <span class="stat-label">${label}</span>
      <span class="stat-value">${value}</span>
      <span class="stat-sub">${sub}</span>
      <span class="stat-icon ${tone}">${emoji}</span>
    </div>`;
}

function statusBadge(status) {
  const cls = status === "Paid" ? "ok" : status === "Partial" ? "warn" : "danger";
  return `<span class="badge ${cls}">${esc(status)}</span>`;
}

const DONUT_COLORS = ["#3B4FE4", "#FFC94D", "#8A97F2", "#D9574A", "#63C99A", "#9A7BF0", "#4CB8D9", "#F0A58A"];

function renderDonut(container, totalsMap) {
  const entries = Object.entries(totalsMap).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    container.innerHTML = `<p class="empty">No sales recorded yet.</p>`;
    return;
  }
  const total = entries.reduce((s, e) => s + e[1], 0);
  let acc = 0;
  const stops = entries.map((e, i) => {
    const from = acc / total * 360; acc += e[1];
    const to = acc / total * 360;
    return `${DONUT_COLORS[i % DONUT_COLORS.length]} ${from}deg ${to}deg`;
  }).join(", ");

  container.innerHTML = `
    <div class="donut-wrap">
      <div class="donut" style="--donut-css:${stops}">
        <div class="donut-center"><div><b>${fmtCompact(total)}</b><span>this month</span></div></div>
      </div>
      <div class="legend">
        ${entries.map(([cat, val], i) => `
          <div class="legend-item">
            <span class="legend-dot" style="background:${DONUT_COLORS[i % DONUT_COLORS.length]}"></span>
            <span>${esc(cat)}</span>
            <span class="pct num">${(val / total * 100).toFixed(0)}%</span>
          </div>`).join("")}
      </div>
    </div>`;
}
