/* Recoup — hero Google Pixel phone "demo reel"
   Cycles through a 5-step showcase: Scan → Vector Match → Gemini Reasoning → Human Approval Gate → Recovered
   Bulletproof: scene is visible, pauses off-screen, handles reduced-motion. */
(function () {
  "use strict";
  const stage = document.getElementById("reel-stage");
  if (!stage) return;
  const scenes = Array.prototype.slice.call(stage.querySelectorAll(".reel-scene"));
  if (!scenes.length) return;
  const countEl = document.getElementById("reel-count");
  const scanN = document.getElementById("reel-scan-n");
  const phone = document.getElementById("reel-phone");
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // keyboard a11y: the phone is role=button -> Enter/Space activates the scan
  if (phone) phone.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); phone.click(); }
  });

  const show = (i) => scenes.forEach((s, k) => s.classList.toggle("is-active", k === i));
  show(0); // default: scan scene visible

  if (reduce) { if (countEl) countEl.textContent = "480"; return; } // static

  const DUR = [4000, 3500, 4500, 3500, 4000]; // longer duration showcase for the Pixel Frame
  let idx = 0, timer = null, running = false, raf = 0;

  function countTo(el, target, ms) {
    if (!el) return;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString();
      if (p < 1 && running) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function play() {
    show(idx);
    if (idx === 0) {
      if (scanN) {
        scanN.textContent = "Connecting Gmail...";
        setTimeout(() => { if (running && idx === 0) scanN.textContent = "Reading receipts & statement..."; }, 1500);
      }
    }
    if (idx === 4) {
      if (countEl) countEl.textContent = "0";
      countTo(countEl, 480, 1500);
    }
    const d = DUR[idx] || 3500;
    timer = setTimeout(() => {
      idx = (idx + 1) % scenes.length;
      if (running) play();
    }, d);
  }
  
  function start() { if (running) return; running = true; idx = 0; play(); }
  function stop() { running = false; clearTimeout(timer); cancelAnimationFrame(raf); }

  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else start(); });
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? start() : stop())), { threshold: 0.25 });
    io.observe(stage);
  } else { start(); }
})();
