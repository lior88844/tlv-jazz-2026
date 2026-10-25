(function () {
  const DATA = window.SCHEDULE || [];
  const STAGES = ["רחבה", "רפי", "חואניטה", "קיסה", "מטמון", "רומנו", "נואיבה", "במה 2"];
  const DAYS = {
    thu: { name: "חמישי", date: "19.11", iso: "2026-11-19", start: 18 * 60 },
    fri: { name: "שישי",  date: "20.11", iso: "2026-11-20", start: 12 * 60 },
    sat: { name: "שבת",   date: "21.11", iso: "2026-11-21", start: 12 * 60 },
  };
  const DAY_END = 25 * 60; // 01:00
  const FAV_KEY = "jazz26-favs";
  const DAY_KEY = "jazz26-day";

  const $ = (s) => document.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  let favs = new Set(store.get(FAV_KEY, []).filter((id) => DATA.some((s) => s.id === id)));
  let day = pickDay();
  let mineOn = false;

  function pickDay() {
    const today = new Date().toISOString().slice(0, 10);
    for (const k in DAYS) if (DAYS[k].iso === today) return k;
    const saved = store.get(DAY_KEY, null);
    return DAYS[saved] ? saved : "thu";
  }
  const hhmm = (m) => String(Math.floor(m / 60) % 24).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  const stageIdx = (s) => Math.max(0, STAGES.indexOf(s));
  const pxPerMin = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--px-min")) || 3.2;
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- headliners ---------- */
  const HL_ORDER = ["Margeeah", "Johnny", "Liraz", "Blue Break", "Emma"];
  const HL_COLORS = ["c-yellow", "c-cream", "c-blue", "c-pink", "c-yellow"];
  const heads = DATA.filter((s) => s.kind === "head")
    .sort((a, b) => HL_ORDER.findIndex((k) => a.en.startsWith(k)) - HL_ORDER.findIndex((k) => b.en.startsWith(k)));
  $("#hl-list").innerHTML = heads.map((s, i) =>
    `<li class="${HL_COLORS[i % 5]}"><span class="en">${esc(s.en.split(" · ")[0])}</span>` +
    (s.en.includes(" · ") ? `<span class="en sub">${esc(s.en.split(" · ")[1])}</span>` : "") +
    `<span class="when">${DAYS[s.day].name} ${DAYS[s.day].date} · ${hhmm(s.start)} · ${esc(s.stage)}</span></li>`
  ).join("");

  /* ---------- grid ---------- */
  function renderGrid() {
    const px = pxPerMin();
    const d = DAYS[day];
    const width = (DAY_END - d.start) * px;
    const shows = DATA.filter((s) => s.day === day);
    const stages = STAGES.filter((st) => shows.some((s) => s.stage === st));

    let times = "";
    for (let m = d.start; m <= DAY_END; m += 30) {
      times += `<span class="${m % 60 ? "half" : ""}" style="inset-inline-start:${(m - d.start) * px}px">${hhmm(m)}</span>`;
    }
    let html = `<div class="times" style="width:${width}px">${times}</div>`;
    for (const st of stages) {
      html += `<div class="row"><div class="stage">${esc(st)}</div><div class="lane" style="width:${width + 16}px">`;
      for (const s of shows.filter((x) => x.stage === st)) {
        const w = (s.end - s.start) * px - 4;
        const cls = ["show", "s-" + stageIdx(s.stage), s.kind, favs.has(s.id) ? "fav" : ""].join(" ");
        html += `<button class="${cls}" data-id="${s.id}" style="inset-inline-start:${(s.start - d.start) * px + 2}px;width:${w}px" ` +
          `aria-pressed="${favs.has(s.id)}" aria-label="${esc(s.name)}, ${hhmm(s.start)} עד ${hhmm(s.end)}, ${esc(s.stage)}">` +
          `<span class="top"><span class="st" aria-hidden="true">★</span><span class="nm">${esc(s.name)}</span></span>` +
          `<span class="tm"><em>${hhmm(s.start)}</em>–${hhmm(s.end)}</span></button>`;
      }
      html += `</div></div>`;
    }
    $("#grid").innerHTML = html;
  }

  /* ---------- my lineup ---------- */
  function renderMine() {
    const list = DATA.filter((s) => favs.has(s.id));
    if (!list.length) {
      $("#mine-view").innerHTML = `<div class="empty"><span class="big">★</span>עוד לא סימנתם הופעות.<br>הקישו על הופעה בלו״ז כדי להוסיף אותה לליינאפ שלכם.</div>`;
      return;
    }
    let html = "";
    for (const k of Object.keys(DAYS)) {
      const items = list.filter((s) => s.day === k).sort((a, b) => a.start - b.start);
      if (!items.length) continue;
      html += `<h3 class="mv-day">${DAYS[k].name} ${DAYS[k].date}</h3>`;
      for (const s of items) {
        const clash = items.some((o) => o !== s && o.start < s.end && s.start < o.end);
        html += `<div class="mv-item s-${stageIdx(s.stage)}"><div class="mv-time">${hhmm(s.start)}</div>` +
          `<div class="mv-body"><div class="mv-name">${esc(s.name)}</div>` +
          `<div class="mv-meta">${esc(s.stage)} · עד ${hhmm(s.end)}${s.kind === "dj" ? " · תקלוט" : ""}${clash ? ' · <span class="clash">חופף להופעה אחרת</span>' : ""}</div></div>` +
          `<button class="mv-rm" data-id="${s.id}" aria-label="הסרה מהליינאפ שלי">★</button></div>`;
      }
    }
    $("#mine-view").innerHTML = html;
  }

  /* ---------- state ---------- */
  function updateCount(bump) {
    $("#count").textContent = favs.size;
    if (bump) { const b = $("#mine"); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }
  }
  function setDay(k) {
    day = k; store.set(DAY_KEY, k);
    document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.day === k)));
    if (mineOn) setMine(false);
    renderGrid();
    $("#scroller").scrollLeft = 0;
  }
  function setMine(on) {
    mineOn = on;
    $("#mine").setAttribute("aria-pressed", String(on));
    $("#grid-view").hidden = on;
    $("#mine-view").hidden = !on;
    document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-selected", String(!on && b.dataset.day === day)));
    if (on) renderMine();
  }
  let toastT;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("on");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 1600);
  }
  function toggle(id) {
    const s = DATA.find((x) => x.id === id); if (!s) return;
    const on = !favs.has(id);
    on ? favs.add(id) : favs.delete(id);
    store.set(FAV_KEY, [...favs]);
    updateCount(on);
    if (navigator.vibrate) navigator.vibrate(on ? 12 : 6);
    toast(on ? "★ נוסף לליינאפ שלי" : "הוסר מהליינאפ שלי");
    return on;
  }

  /* ---------- events ---------- */
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setDay(b.dataset.day); });
  $("#mine").addEventListener("click", () => setMine(!mineOn));
  $("#grid").addEventListener("click", (e) => {
    const b = e.target.closest(".show"); if (!b) return;
    const on = toggle(b.dataset.id);
    b.classList.toggle("fav", on); b.setAttribute("aria-pressed", String(on));
  });
  $("#mine-view").addEventListener("click", (e) => {
    const b = e.target.closest(".mv-rm"); if (!b) return;
    toggle(b.dataset.id); renderMine(); renderGrid();
  });

  let lastPx = pxPerMin();
  addEventListener("resize", () => { const p = pxPerMin(); if (p !== lastPx) { lastPx = p; renderGrid(); } });

  const sentinel = document.createElement("div");
  $("#controls").before(sentinel);
  new IntersectionObserver(([en]) => $("#controls").classList.toggle("stuck", !en.isIntersecting)).observe(sentinel);

  setDay(day);
  updateCount(false);
})();
