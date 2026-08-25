/* ============================================================
   db.js — localStorage persistence, business logic, seed data
   ============================================================ */

const DB = (() => {
  const KEY = "ledgerdesk_db_v1";

  const DEFAULT_SETTINGS = {
    shopName: "Sundaram General Stores",
    tagline: "Quality goods since 1998",
    address: "12, M.G. Road, Pune - 411001",
    phone: "+91 98220 12345",
    email: "sundaram.stores@example.com",
    gstin: "27ABCDE1234F1Z5",
    currencySymbol: "₹",
    invoicePrefix: "INV",
    defaultGst: 18,
    lowStockThreshold: 5,
    bankNote: "",
    terms: "Goods once sold will not be taken back. Interest @18% p.a. will be charged on overdue bills."
  };

  let state = null;

  /* ---------------- load / save ---------------- */
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      state = raw ? JSON.parse(raw) : null;
    } catch { state = null; }
    if (!state || !state.settings) {
      state = null;
      seed();
      save();
    }
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  /* ---------------- settings / auth ---------------- */
  const getSettings = () => ({ ...DEFAULT_SETTINGS, ...state.settings });

  function updateSettings(patch) {
    state.settings = { ...getSettings(), ...patch };
    save();
  }

  function verifyLogin(username, password) {
    const u = state.users.find(u => u.username === username && u.password === password);
    return u ? { username: u.username, name: u.name } : null;
  }

  function getUser(username) {
    return state.users.find(u => u.username === username);
  }

  function changePassword(username, oldPass, newPass) {
    const u = getUser(username);
    if (!u || u.password !== oldPass) return false;
    u.password = newPass;
    save();
    return true;
  }

  /* ---------------- products ---------------- */
  const products = () => [...state.products];

  function getProduct(id) { return state.products.find(p => p.id === id); }

  function saveProduct(p) {
    if (p.id) {
      const i = state.products.findIndex(x => x.id === p.id);
      if (i >= 0) state.products[i] = { ...state.products[i], ...p };
    } else {
      p.id = uid();
      p.createdAt = new Date().toISOString();
      state.products.push(p);
    }
    save();
  }

  function deleteProduct(id) {
    state.products = state.products.filter(p => p.id !== id);
    save();
  }

  function categories() {
    return [...new Set(state.products.map(p => p.category).filter(Boolean))].sort();
  }

  /* ---------------- customers ---------------- */
  const customers = () => [...state.customers];

  function getCustomer(id) { return state.customers.find(c => c.id === id); }

  function saveCustomer(c) {
    if (c.id) {
      const i = state.customers.findIndex(x => x.id === c.id);
      if (i >= 0) state.customers[i] = { ...state.customers[i], ...c };
    } else {
      c.id = uid();
      c.createdAt = new Date().toISOString();
      state.customers.push(c);
    }
    save();
  }

  function deleteCustomer(id) {
    state.customers = state.customers.filter(c => c.id !== id);
    save();
  }

  /* ---------------- totals engine ----------------
     Prices are GST-exclusive. Per-line discount %, optional bill-level
     discount (% or flat amount) applied proportionally before tax. */
  function calcTotals(items, billDisc = { type: "none", value: 0 }) {
    let taxableSum = 0, taxSum = 0;
    const lines = items.map(it => {
      const gross = it.price * it.qty;
      const discAmt = gross * (Number(it.disc) || 0) / 100;
      const taxable = gross - discAmt;
      const tax = taxable * (Number(it.gst) || 0) / 100;
      taxableSum += taxable;
      taxSum += tax;
      return { ...it, taxable, tax };
    });

    let factor = 1;
    const val = Number(billDisc.value) || 0;
    if (billDisc.type === "pct" && val > 0) factor = Math.max(0, 1 - val / 100);
    if (billDisc.type === "amt" && val > 0 && taxableSum > 0) {
      factor = Math.max(0, Math.min(1, (taxableSum - val) / taxableSum));
    }

    const taxable = taxableSum * factor;
    const tax = taxSum * factor;
    return {
      lines,
      gross: lines.reduce((s, l) => s + l.price * l.qty, 0),
      lineDiscount: lines.reduce((s, l) => s + l.price * l.qty * ((l.disc || 0) / 100), 0),
      billDiscount: (taxableSum + taxSum) * (1 - factor),
      taxable,
      cgst: tax / 2,
      sgst: tax / 2,
      tax,
      grand: taxable + tax
    };
  }

  /* ---------------- invoices ---------------- */
  const invoices = () =>
    [...state.invoices].sort((a, b) => new Date(b.date) - new Date(a.date));

  function getInvoice(id) { return state.invoices.find(v => v.id === id); }

  function nextInvoiceNo() {
    const s = getSettings();
    return `${s.invoicePrefix || "INV"}-${String(state.counters.invoice + 1).padStart(4, "0")}`;
  }

  function createInvoice(data) {
    const totals = calcTotals(data.items, data.billDiscount);
    const inv = {
      id: uid(),
      no: nextInvoiceNo(),
      date: data.date || new Date().toISOString(),
      customerId: data.customerId || null,
      customer: data.customer,          // snapshot {name, phone, address, gstin}
      items: totals.lines,
      totals: {
        gross: round2(totals.gross),
        billDiscount: round2(totals.billDiscount),
        taxable: round2(totals.taxable),
        cgst: round2(totals.cgst),
        sgst: round2(totals.sgst),
        grand: round2(totals.grand)
      },
      paymentMode: data.paymentMode || "Cash",
      amountPaid: round2(Number(data.amountPaid) || 0),
      status: ""
    };

    const due = inv.totals.grand - inv.amountPaid;
    inv.status = due <= 0.009 ? "Paid" : (inv.amountPaid > 0 ? "Partial" : "Unpaid");
    inv.changeDue = due < 0 ? round2(-due) : 0;

    // deduct stock for tracked items
    inv.items.forEach(it => {
      const p = getProduct(it.productId);
      if (p && p.trackStock !== false) {
        p.stock = Math.max(0, Number(p.stock) - it.qty);
      }
    });

    state.counters.invoice += 1;
    state.invoices.push(inv);
    save();
    return inv;
  }

  function deleteInvoice(id) {
    const inv = getInvoice(id);
    if (!inv) return;
    // restore stock
    inv.items.forEach(it => {
      const p = getProduct(it.productId);
      if (p && p.trackStock !== false) p.stock = Number(p.stock) + it.qty;
    });
    state.invoices = state.invoices.filter(v => v.id !== id);
    save();
  }

  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  /* record a later payment against a partially-paid invoice */
  function recordPayment(id, amount) {
    const inv = state.invoices.find(v => v.id === id);
    if (!inv) return null;
    inv.amountPaid = round2(Number(inv.amountPaid) + Number(amount));
    inv.status = inv.totals.grand - inv.amountPaid <= 0.009 ? "Paid" : "Partial";
    if (inv.status === "Paid") inv.changeDue = 0;
    save();
    return inv;
  }

  /* ---------------- backup / restore ---------------- */
  function exportJSON() { return JSON.stringify(state, null, 2); }

  function importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed.settings || !Array.isArray(parsed.products)) throw new Error("Not a LedgerDesk backup file");
    state = parsed;
    save();
  }

  function resetAll() {
    localStorage.removeItem(KEY);
    state = null;
    seed();
    save();
  }

  /* ============================================================
     SEED DATA — sample shop so the system is alive on first run
     ============================================================ */
  function seed() {
    const now = new Date().toISOString();
    state = {
      settings: { ...DEFAULT_SETTINGS },
      users: [{ username: "admin", password: "admin123", name: "Administrator" }],
      counters: { invoice: 0 },
      products: [],
      customers: [],
      invoices: []
    };

    const P = (name, category, hsn, price, gst, stock, unit, trackStock = true) => {
      const p = { id: uid(), name, category, hsn, price, gst, stock, unit, trackStock, createdAt: now };
      state.products.push(p);
      return p;
    };

    P("Basmati Rice 5kg", "Grocery", "1006", 480, 5, 40, "bag");
    P("Sunflower Oil 1L", "Grocery", "1512", 145, 5, 60, "bottle");
    P("Wheat Atta 10kg", "Grocery", "1101", 410, 5, 25, "bag");
    P("Sugar 1kg", "Grocery", "1701", 46, 5, 80, "kg");
    P("Tea Powder 500g", "Beverages", "0902", 265, 5, 35, "pack");
    P("Instant Coffee 200g", "Beverages", "2101", 320, 18, 22, "jar");
    P("Cola Drink 750ml", "Beverages", "2202", 40, 28, 90, "bottle");
    P("Mineral Water 1L", "Beverages", "2201", 20, 18, 120, "bottle");
    P("Notebook A4 200pg", "Stationery", "4820", 85, 12, 50, "pc");
    P("Ball Pen (Blue)", "Stationery", "9608", 10, 12, 200, "pc");
    P("A4 Copier Paper Ream", "Stationery", "4802", 290, 18, 18, "ream");
    P("LED Bulb 9W", "Electricals", "8539", 120, 12, 45, "pc");
    P("Extension Cord 4m", "Electricals", "8544", 210, 18, 12, "pc");
    P("AA Battery (4-pack)", "Electricals", "8506", 95, 18, 30, "pack");
    P("Wall Clock", "Home", "9105", 549, 18, 4, "pc");

    // services — stock not tracked
    P("Home AC Service", "Services", "998714", 1499, 18, 0, "job", false);
    P("Water Purifier Install", "Services", "998739", 850, 18, 0, "job", false);
    P("Printer Repair", "Services", "998716", 650, 18, 0, "job", false);

    const C = (name, phone, email, address, gstin = "") => {
      const c = { id: uid(), name, phone, email, address, gstin, createdAt: now };
      state.customers.push(c);
      return c;
    };
    C("Ramesh Iyer", "98220 11111", "ramesh.iyer@example.com", "22 Shivaji Nagar, Pune");
    C("Anita Deshmukh", "98220 22222", "anita.d@example.com", "7 Kothrud, Pune", "27AAECA1234B1Z9");
    C("Farhan Qureshi", "98220 33333", "farhan.q@example.com", "45 Camp, Pune");
    C("Meera Krishnan", "98220 44444", "meera.k@example.com", "3 Aundh, Pune");
    C("Vikram Traders", "98220 55555", "accounts@vikramtraders.example.com", "101 Hadapsar, Pune", "27AACCV5678D1Z2");

    // --- demo invoices spread over the last 30 days (deterministic LCG rand)
    let _s = 42;
    const rnd = () => (_s = (_s * 1103515245 + 12345) % 2147483648) / 2147483648;

    for (let d = 29; d >= 0; d--) {
      const billsToday = 1 + Math.floor(rnd() * 3);
      for (let b = 0; b < billsToday; b++) {
        const when = new Date();
        when.setDate(when.getDate() - d);
        when.setHours(9 + Math.floor(rnd() * 10), Math.floor(rnd() * 60), 0, 0);

        const cust = rnd() < 0.6 ? state.customers[Math.floor(rnd() * state.customers.length)] : null;
        const nItems = 1 + Math.floor(rnd() * 4);
        const items = [];
        const used = new Set();
        for (let i = 0; i < nItems; i++) {
          let p = state.products[Math.floor(rnd() * state.products.length)];
          if (used.has(p.id)) continue;
          used.add(p.id);
          items.push({
            productId: p.id, name: p.name, hsn: p.hsn,
            qty: 1 + Math.floor(rnd() * 3),
            price: p.price, gst: p.gst, disc: 0
          });
        }
        if (!items.length) continue;

        const modes = ["Cash", "UPI", "Card"];
        const totals = calcTotals(items, { type: "none", value: 0 });
        const paidFull = rnd() < 0.88;
        const inv = {
          id: uid(),
          no: nextInvoiceNo(),
          date: when.toISOString(),
          customerId: cust?.id || null,
          customer: cust
            ? { name: cust.name, phone: cust.phone, address: cust.address, gstin: cust.gstin }
            : { name: "Walk-in Customer", phone: "", address: "", gstin: "" },
          items: totals.lines,
          totals: {
            gross: round2(totals.gross),
            billDiscount: 0,
            taxable: round2(totals.taxable),
            cgst: round2(totals.cgst),
            sgst: round2(totals.sgst),
            grand: round2(totals.grand)
          },
          paymentMode: modes[Math.floor(rnd() * modes.length)],
          amountPaid: paidFull ? round2(totals.grand) : round2(totals.grand * 0.5),
          status: paidFull ? "Paid" : "Partial"
        };
        state.counters.invoice += 1;
        state.invoices.push(inv);
      }
    }
  }

  load();

  return {
    getSettings, updateSettings,
    verifyLogin, getUser, changePassword,
    products, getProduct, saveProduct, deleteProduct, categories,
    customers, getCustomer, saveCustomer, deleteCustomer,
    invoices, getInvoice, nextInvoiceNo, createInvoice, deleteInvoice, recordPayment, calcTotals,
    exportJSON, importJSON, resetAll
  };
})();
