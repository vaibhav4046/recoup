/* Recoup — voice agent. Browser-native Web Speech (free, low-latency) for listening;
   answers come from Gemini for anything that isn't a direct command; speech is
   browser-native Web Speech TTS only (no non-Google voice service).
   Continuous listen with start/stop, interim transcript, and mic-pause while it talks
   (so it never hears itself). Falls back gracefully off-Chrome. */
(function () {
  "use strict";
  const cfg = window.RO_CONFIG || {};
  const API = (cfg.apiBase || "").replace(/\/+$/, "");
  const btn = document.getElementById("voice-btn");
  if (!btn) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;
  const label = document.getElementById("voice-label");

  const flash = (t, hold) => {
    if (!label) return;
    label.textContent = t; label.classList.add("show");
    clearTimeout(flash._t);
    if (hold !== true) flash._t = setTimeout(() => label.classList.remove("show"), 3800);
  };

  if (!SR) { btn.title = "Voice needs Chrome or Edge"; btn.addEventListener("click", () => flash("Voice commands need Chrome or Edge")); return; }

  let rec = null, active = false, speaking = false, processing = false, idleTimer = null, restartTimer = null, audio = null;

  // ---- speak: free browser TTS only ----
  async function speak(text) {
    if (!text) return;
    speaking = true; clearTimeout(restartTimer);
    try { if (rec) rec.stop(); } catch (e) {}   // pause the mic so we don't transcribe ourselves
    if (synth) {  // browser-native Web Speech TTS only (no non-Google voice service)
      await new Promise((res) => { try { synth.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1.05; u.onend = res; u.onerror = res; synth.speak(u); } catch (e) { res(); } });
    }
    speaking = false;
  }

  // ---- direct commands (instant, deterministic — the rules still own every dollar) ----
  function command(t) {
    const has = (...w) => w.some((x) => t.includes(x));
    if (has("find my money", "find money", "start scan", "scan my", "run a scan", "run scan")) { flash("→ opening scan"); speak("Opening your private scan. Paste a statement and nothing leaves your browser."); document.querySelector("#find-money") && document.querySelector("#find-money").click(); return true; }
    if (has("example", "demo", "walk me", "show me how")) { flash("→ example"); speak("Here is a sixty second example of how recovery works."); document.querySelector("#see-example") && document.querySelector("#see-example").click(); return true; }
    if (has("approve all", "approve everything", "recover all")) { const b = document.querySelector("#btn-approve-all"); if (b) { flash("→ approving"); speak("Approving every safe win. Nothing sends until you confirm on the real site."); b.click(); } else speak("Run a scan first, then I can approve your safe wins."); return true; }
    if (has("stop listening", "stop", "cancel", "that's all", "goodbye")) { flash("voice off"); stop(); return true; }
    if (/(how much|my total|owed|leaking)/.test(t)) { const o = (document.querySelector("#one-time") || {}).textContent || "0", r = (document.querySelector("#recurring") || {}).textContent || "0"; flash("your total"); speak("You have about " + o + " dollars owed to you now, and " + r + " dollars leaking every year. Say find my money to recover it."); return true; }
    return false;
  }

  function pageContext() {
    const o = (document.querySelector("#one-time") || {}).textContent, r = (document.querySelector("#recurring") || {}).textContent;
    const res = document.querySelector("#results");
    const shown = res && !res.classList.contains("hidden");
    return shown ? ("A scan is on screen: about $" + o + " owed one-time and $" + r + " per year leaking.") : "On the Recoup landing page (no scan run yet).";
  }

  async function handle(transcript) {
    const t = (transcript || "").toLowerCase().trim();
    if (!t) return;
    if (command(t)) return;                         // direct command -> act instantly
    if (!API) { await speak("I can scan your money, show an example, approve your safe wins, or tell you your total."); return; }
    flash("Thinking…", true);
    try {
      const r = await fetch(API + "/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: transcript, context: pageContext() }) });
      const d = await r.json();
      const a = (d && d.answer) ? d.answer : "I can scan your money, show an example, approve your safe wins, or tell you your total. What would you like?";
      flash(a.slice(0, 110));
      await speak(a);
    } catch (e) { await speak("I couldn't reach my brain just now. Try a command like, find my money."); }
  }

  // ---- recognition lifecycle (continuous, auto-restart, idle-off) ----
  function startRec() {
    if (!active || speaking || processing) return;
    try { rec = new SR(); } catch (e) { return; }
    rec.lang = "en-US"; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let interim = "", final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) { const res = e.results[i]; if (res.isFinal) final += res[0].transcript; else interim += res[0].transcript; }
      if (interim) flash("“" + interim.trim() + "”", true);
      if (final.trim()) {
        resetIdle(); processing = true;
        try { rec.stop(); } catch (er) {}
        handle(final.trim()).catch(() => {}).then(() => { processing = false; if (active) startRec(); });
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { flash("Allow the mic to use voice"); speak("I need microphone permission to listen."); active = false; setUI(); }
    };
    rec.onend = () => { if (active && !speaking && !processing) { restartTimer = setTimeout(startRec, 250); } };
    try { rec.start(); } catch (e) {}
  }
  function resetIdle() { clearTimeout(idleTimer); idleTimer = setTimeout(() => { flash("Voice off (idle)"); stop(); }, 30000); }
  function setUI() { btn.classList.toggle("listening", active); btn.setAttribute("aria-pressed", String(active)); }
  function start() { active = true; setUI(); flash("Listening… try “find my money” or ask me anything"); resetIdle(); startRec(); }
  function stop() {
    active = false; setUI();
    clearTimeout(idleTimer); clearTimeout(restartTimer);
    try { rec && rec.stop(); } catch (e) {}
    try { synth && synth.cancel(); } catch (e) {}
    if (audio) { try { audio.pause(); } catch (e) {} }
  }

  btn.addEventListener("click", () => { active ? stop() : start(); });
})();
