/* Recoup — zero-cost voice agent. Uses the browser-native Web Speech API
   (SpeechRecognition + SpeechSynthesis) — no keys, no paid service, low latency.
   Speak a command; Recoup acts and talks back. Falls back gracefully off-Chrome. */
(function () {
  "use strict";
  const btn = document.getElementById("voice-btn");
  if (!btn) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;
  const label = document.getElementById("voice-label");

  const flash = (t) => { if (label) { label.textContent = t; label.classList.add("show"); clearTimeout(flash._t); flash._t = setTimeout(() => label.classList.remove("show"), 3200); } };
  const say = (t) => { try { if (!synth) return; synth.cancel(); const u = new SpeechSynthesisUtterance(t); u.rate = 1.06; u.pitch = 1; u.volume = 1; synth.speak(u); } catch (e) {} };
  const click = (sel) => { const e = document.querySelector(sel); if (e) { e.click(); return true; } return false; };

  if (!SR || !synth) {
    btn.title = "Voice commands need Chrome or Edge";
    btn.addEventListener("click", () => flash("Voice needs Chrome or Edge"));
    return;
  }

  // route a transcript to an intent (deterministic — the LLM/rules still own all money)
  function route(t) {
    t = (t || "").toLowerCase().trim();
    const has = (...w) => w.some((x) => t.includes(x));
    if (!t) { return; }
    if (has("find my money", "find money", "start scan", "scan my", "run scan", "scan")) { flash("“" + t + "”"); say("Opening your private scan. Paste a statement and nothing leaves your browser."); click("#find-money"); }
    else if (has("example", "demo", "walk", "show me how")) { flash("“" + t + "”"); say("Here is a sixty second example of how recovery works."); click("#see-example"); }
    else if (has("approve all", "approve everything", "approve the safe", "recover all")) { flash("“" + t + "”"); if (click("#btn-approve-all")) say("Approving every safe win. Nothing is sent until you confirm on the real site."); else say("Run a scan first, then I can approve your safe wins."); }
    else if (has("how much", "my total", "owed", "leaking", "how many")) { speakTotal(); }
    else if (has("connect gmail", "my email", "read my")) { flash("“" + t + "”"); say("You can connect read only Gmail from the sign in page. It only reads subscription receipts."); }
    else if (has("what", "who", "explain", "help", "about", "how does", "tell me")) { flash("What is Recoup?"); say("Recoup is a money recovery agent. It scans your statements or read only Gmail, finds money you are owed and subscriptions draining you, drafts every claim, and waits for your approval before anything happens. You stay in control of every dollar."); }
    else { flash("Try: “find my money”"); say("I can scan your money, show an example, approve your safe wins, or tell you your total. What would you like?"); }
  }
  function speakTotal() {
    const o = (document.querySelector("#one-time") || {}).textContent || "0";
    const r = (document.querySelector("#recurring") || {}).textContent || "0";
    flash("Your total");
    say("You have about " + o + " dollars owed to you now, and " + r + " dollars leaking every year. Say find my money to start recovering it.");
  }

  let rec = null, listening = false, timer = null;
  function stop() { if (rec) { try { rec.stop(); } catch (e) {} } }
  function start() {
    if (listening) { stop(); return; }
    try { rec = new SR(); } catch (e) { flash("Voice unavailable"); return; }
    rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 1; rec.continuous = false;
    rec.onstart = () => { listening = true; btn.classList.add("listening"); btn.setAttribute("aria-pressed", "true"); flash("Listening…"); timer = setTimeout(stop, 8000); };
    rec.onend = () => { listening = false; btn.classList.remove("listening"); btn.setAttribute("aria-pressed", "false"); clearTimeout(timer); };
    rec.onerror = (e) => { listening = false; btn.classList.remove("listening"); btn.setAttribute("aria-pressed", "false"); if (e.error === "not-allowed" || e.error === "service-not-allowed") { flash("Allow the mic to use voice"); say("I need microphone permission to listen."); } else if (e.error === "no-speech") { flash("Didn't catch that"); } };
    rec.onresult = (e) => { const best = e.results[0][0]; if (best && (best.confidence === 0 || best.confidence > 0.35)) route(best.transcript); else flash("Didn't catch that — try again"); };
    try { rec.start(); } catch (e) { /* already started */ }
  }
  btn.addEventListener("click", start);
  // keyboard: the button is focusable; Enter/Space already trigger click
})();
