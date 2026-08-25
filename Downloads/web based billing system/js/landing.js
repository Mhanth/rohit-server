/* ============================================================
   landing.js — hero bill count-up + scroll reveals
   ============================================================ */

(function () {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- count the hero total up to ₹2,541.00 ---- */
  const totalEl = document.getElementById("bill-total");
  const TARGET = 2541;

  function countUp() {
    if (!totalEl) return;
    if (reduced) { totalEl.textContent = "2,541.00"; return; }
    const t0 = performance.now();
    const DURATION = 900;
    function tick(now) {
      const p = Math.min(1, (now - t0) / DURATION);
      const eased = 1 - Math.pow(1 - p, 3);
      totalEl.textContent = (TARGET * eased).toLocaleString("en-IN", {
        minimumFractionDigits: 2, maximumFractionDigits: 2
      });
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // total row appears at .55 + 7*.38 = 3.21s; count as it lands
  setTimeout(countUp, reduced ? 0 : 3150);

  /* ---- scroll reveals ---- */
  const revealEls = [...document.querySelectorAll(".reveal")];
  if (reduced || !("IntersectionObserver" in window)) {
    revealEls.forEach(el => el.classList.add("in"));
  } else {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.15 });
    revealEls.forEach(el => io.observe(el));
  }
})();
