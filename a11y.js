// Accessibility menu: round button at the bottom corner that opens a small panel.
// Options: text size (80%–140%), high contrast, stop animations, highlight links, reset.
// Settings are saved on the device and applied as classes on <html>.
(function () {
  const KEY = "jazz26-a11y";
  const root = document.documentElement;
  const EN = root.lang === "en";
  const T = EN
    ? { open: "Open accessibility menu", title: "Accessibility", close: "Close", size: "Text size", smaller: "Smaller text", bigger: "Bigger text",
        contrast: "High contrast", motion: "Stop animations and motion", links: "Highlight links", reset: "Reset settings", statement: "Accessibility statement" }
    : { open: "פתיחת תפריט נגישות", title: "נגישות", close: "סגירה", size: "גודל טקסט", smaller: "הקטנת טקסט", bigger: "הגדלת טקסט",
        contrast: "ניגודיות גבוהה", motion: "עצירת אנימציות ותנועה", links: "הדגשת קישורים", reset: "איפוס הגדרות", statement: "הצהרת נגישות" };
  const MIN = -2, MAX = 4; // 80% … 140%, 10% per step
  const DEFAULTS = { fontStep: 0, contrast: false, reduceMotion: false, underlineLinks: false };

  let st = { ...DEFAULTS };
  try { st = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };

  function apply() {
    const z = 1 + st.fontStep / 10;
    root.style.setProperty("--a11y-zoom", z);
    root.classList.toggle("a11y-zoomed", st.fontStep !== 0);
    root.classList.toggle("a11y-contrast", st.contrast);
    root.classList.toggle("a11y-reduce-motion", st.reduceMotion);
    root.classList.toggle("a11y-underline-links", st.underlineLinks);
  }
  apply();

  const ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><circle cx="12" cy="4.5" r="1.8"/><path d="M6 8.5h12v1.2h-4.4l1.4 5.3 1.5 4.8-1.7.6-1.3-4.4h-2.9l-1.3 4.4-1.7-.6 1.5-4.8 1.4-5.3H6z"/></svg>';
  const row = (k, label) => `<button type="button" class="a11y-opt" data-k="${k}" aria-pressed="false"><span>${label}</span><span class="a11y-dot" aria-hidden="true"></span></button>`;

  function build() {
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "a11y-toggle";
    btn.setAttribute("aria-label", T.open); btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-controls", "a11y-panel");
    btn.innerHTML = ICON;

    const panel = document.createElement("div");
    panel.id = "a11y-panel"; panel.className = "a11y-panel"; panel.hidden = true;
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-labelledby", "a11y-title");
    panel.innerHTML =
      `<header class="a11y-head"><h2 id="a11y-title" class="a11y-title">${T.title}</h2><button type="button" class="a11y-close" aria-label="${T.close}">×</button></header>` +
      `<div class="a11y-row"><span class="a11y-label">${T.size}</span><div class="a11y-stepper">` +
        `<button type="button" data-step="-1" aria-label="${T.smaller}">−</button><span class="a11y-value" aria-live="polite"></span><button type="button" data-step="1" aria-label="${T.bigger}">+</button></div></div>` +
      row("contrast", T.contrast) + row("reduceMotion", T.motion) + row("underlineLinks", T.links) +
      `<div class="a11y-foot"><button type="button" class="a11y-reset">${T.reset}</button><a class="a11y-link" href="accessibility.html"${EN ? ' hreflang="he"' : ""}>${T.statement}</a></div>`;

    document.body.append(btn, panel);

    function render() {
      panel.querySelector(".a11y-value").textContent = (100 + st.fontStep * 10) + "%";
      panel.querySelector('[data-step="-1"]').disabled = st.fontStep <= MIN;
      panel.querySelector('[data-step="1"]').disabled = st.fontStep >= MAX;
      panel.querySelectorAll(".a11y-opt").forEach((b) => {
        const on = !!st[b.dataset.k];
        b.setAttribute("aria-pressed", String(on));
        b.classList.toggle("on", on);
      });
    }
    function setOpen(open) {
      panel.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      if (open) { render(); panel.querySelector(".a11y-close").focus(); }
    }
    const change = () => { apply(); save(); render(); };

    btn.addEventListener("click", () => setOpen(panel.hidden));
    panel.addEventListener("click", (e) => {
      if (e.target.closest(".a11y-close")) { setOpen(false); btn.focus(); return; }
      const step = e.target.closest("[data-step]");
      if (step) { st.fontStep = Math.max(MIN, Math.min(MAX, st.fontStep + Number(step.dataset.step))); return change(); }
      const opt = e.target.closest(".a11y-opt");
      if (opt) { st[opt.dataset.k] = !st[opt.dataset.k]; return change(); }
      if (e.target.closest(".a11y-reset")) { st = { ...DEFAULTS }; change(); }
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) { setOpen(false); btn.focus(); } });
    document.addEventListener("click", (e) => { if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) setOpen(false); });
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", build) : build();
})();
