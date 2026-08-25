/* ============================================================
   utils.js — shared helpers (DOM, formatting, modal, toast)
   ============================================================ */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* Page registry — each module file assigns Pages.<route> */
const Pages = {};

/* Escape user-entered text before injecting into HTML */
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

/* ---------- money & numbers ---------- */
function fmtMoney(n, withSymbol = true) {
  const s = DB.getSettings();
  const sym = withSymbol ? (s.currencySymbol || "₹") : "";
  const num = Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sym}${num}`;
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString("en-IN");
}

function fmtCompact(n) {
  n = Number(n || 0);
  if (n >= 1e7) return (n / 1e7).toFixed(1).replace(/\.0$/, "") + "Cr";
  if (n >= 1e5) return (n / 1e5).toFixed(1).replace(/\.0$/, "") + "L";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return Math.round(n).toString();
}

/* ---------- dates ---------- */
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + ", " +
         d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ---------- misc ---------- */
let _uidCounter = 0;
function uid() {
  return Date.now().toString(36) + (++_uidCounter).toString(36);
}

function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ---------- toast ---------- */
function toast(msg, type = "ok") {
  const root = $("#toast-root");
  const t = document.createElement("div");
  t.className = `toast ${type === "err" ? "err" : ""}`;
  t.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
      ${type === "err"
        ? '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/>'
        : '<path d="M20 6 9 17l-5-5"/>'}
    </svg><span>${esc(msg)}</span>`;
  root.appendChild(t);
  setTimeout(() => {
    t.classList.add("out");
    setTimeout(() => t.remove(), 260);
  }, 2600);
}

/* ---------- modal ---------- */
function openModal({ title, body, foot, wide = false, onMount }) {
  closeModal();
  const root = $("#modal-root");
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal ${wide ? "modal-wide" : ""}" role="dialog" aria-modal="true">
      <div class="modal-head">
        <div class="modal-title">${title}</div>
        <button class="modal-close" aria-label="Close">×</button>
      </div>
      <div class="modal-body"></div>
      ${foot === false ? "" : `<div class="modal-foot">${foot || `
        <button class="btn btn-outline" data-close>Cancel</button>`}</div>`}
    </div>`;
  root.appendChild(backdrop);

  $(".modal-body", backdrop).innerHTML = body;
  $("[data-close]", backdrop)?.addEventListener("click", closeModal);
  $(".modal-close", backdrop).addEventListener("click", closeModal);
  backdrop.addEventListener("mousedown", e => { if (e.target === backdrop) closeModal(); });
  document.addEventListener("keydown", escListener);
  onMount?.(backdrop);
  const firstInput = $("input, select, textarea", backdrop);
  firstInput?.focus();
  return backdrop;
}

function escListener(e) { if (e.key === "Escape") closeModal(); }

function closeModal() {
  $("#modal-root").innerHTML = "";
  document.removeEventListener("keydown", escListener);
}

/* Confirmation dialog. Returns via onConfirm callback. */
function confirmAction(title, message, onConfirm, confirmLabel = "Delete") {
  openModal({
    title,
    body: `<p style="font-size:14px; color:var(--muted)">${message}</p>`,
    foot: `
      <button class="btn btn-outline" data-close>Cancel</button>
      <button class="btn btn-danger" data-confirm>${confirmLabel}</button>`,
    onMount: (backdrop) => {
      $("[data-confirm]", backdrop).addEventListener("click", () => {
        closeModal();
        onConfirm();
      });
    }
  });
}

/* Close button markup for modals without footer buttons */
function noFooter() { return false; }

/* ---------- number to words (Indian system, for invoices) ---------- */
function numberToWordsRupees(amount) {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
    "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function twoDigits(n) {
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
  }
  function threeDigits(n) {
    const h = Math.floor(n / 100), rest = n % 100;
    return (h ? ones[h] + " Hundred" + (rest ? " " : "") : "") + (rest ? twoDigits(rest) : "");
  }

  let n = Math.floor(Math.abs(Number(amount) || 0));
  if (n === 0) return "Zero Rupees Only";
  const parts = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;

  if (crore) parts.push(threeDigits(crore) + " Crore");
  if (lakh) parts.push(twoDigits(lakh) + " Lakh");
  if (thousand) parts.push(twoDigits(thousand) + " Thousand");
  if (n) parts.push(threeDigits(n));
  return parts.join(" ") + " Rupees Only";
}

/* ---------- CSV export ---------- */
function downloadFile(filename, content, mime = "text/plain") {
  const blob = new Blob([content], { type: mime + ";charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportCSV(filename, rows) {
  // rows: array of arrays
  const csv = rows.map(row =>
    row.map(cell => {
      const v = String(cell ?? "");
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(",")
  ).join("\r\n");
  downloadFile(filename, "﻿" + csv, "text/csv");
}

/* Small inline SVG icon set for row actions */
const ICONS = {
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-7.5 11-7.5S23 12 23 12s-4 7.5-11 7.5S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 15H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>'
};
