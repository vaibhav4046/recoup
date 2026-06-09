/* Recoup — hero phone "demo reel": loops scan -> money found -> recovered.
   Bulletproof: a scene is always visible, the loop pauses off-screen/hidden,
   and prefers-reduced-motion shows a single static frame (no motion). */
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
  show(1); // default: the "money found" frame is visible immediately, even if the loop never starts

  if (reduce) { if (countEl) countEl.textContent = "1,305"; return; } // static, no animation

  const DUR = [2600, 3500, 2600]; // ms per scene
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
    if (idx === 0 && scanN) scanN.textContent = "1,204 emails read · scanning";
    if (idx === 1) { if (countEl) countEl.textContent = "0"; countTo(countEl, 1305, 1300); }
    const d = DUR[idx];
    timer = setTimeout(() => { idx = (idx + 1) % scenes.length; if (running) play(); }, d);
  }
  function start() { if (running) return; running = true; idx = 0; play(); }
  function stop() { running = false; clearTimeout(timer); cancelAnimationFrame(raf); }

  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else start(); });
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? start() : stop())), { threshold: 0.25 });
    io.observe(stage);
  } else { start(); }
})();
