(function () {
  // Published copy of the schedule tab ("ג'אז 2026 – לו\"ז לאתר (ציבורי)" in Drive).
  const SHEET_CSV = "https://docs.google.com/spreadsheets/d/1Cxua6aZYxJ8CCthvtaJc7cUPqcfAgxoieajsiCifOXE/pub?gid=1205429231&single=true&output=csv";
  const CACHE_KEY = "jazz26-live";
  let DATA = window.SCHEDULE || [];
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

  const cached = store.get(CACHE_KEY, null);
  if (cached && Array.isArray(cached) && cached.length) DATA = cached;
  let favs = new Set(store.get(FAV_KEY, []));
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
  function renderHeadliners() {
    const HL = window.HEADLINERS || {};
    const order = Object.keys(HL);
    const COLORS = ["c-yellow", "c-cream", "c-blue", "c-pink", "c-yellow"];
    const heads = DATA.filter((s) => s.kind === "head").sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
    $("#hl-list").innerHTML = heads.map((s, i) => {
      const [main, sub] = String(s.en || s.name).split(" · ");
      return `<li class="${COLORS[i % 5]}"><span class="en">${esc(main)}</span>` +
        (sub ? `<span class="en sub">${esc(sub)}</span>` : "") +
        `<span class="when">${DAYS[s.day].name} ${DAYS[s.day].date} · ${hhmm(s.start)} · ${esc(s.stage)}</span></li>`;
    }).join("");
  }

  /* ---------- live schedule from the Google Sheet ---------- */
  function parseCSV(text) {
    const rows = []; let row = [], f = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(f); rows.push(row); row = []; f = "";
      } else f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  const WEEKDAY = { "חמישי": "thu", "שישי": "fri", "שבת": "sat" };
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return (h < 6 ? h + 24 : h) * 60 + m; };
  const norm = (t) => t.replace(/\s+/g, " ").trim().replace(/^[\s\-–]+|[\s\-–]+$/g, "");
  function sheetToShows(rows) {
    const ALIAS = window.NAME_ALIASES || {}, DJ = new Set(window.DJ_NAMES || []), HL = window.HEADLINERS || {};
    const RANGE = /(\d{1,2}:\d\d)\s*[-–]\s*(\d{1,2}:\d\d)/;
    const out = []; let dayKey = null, stages = [], rowTime = null;
    for (const r of rows) {
      const a = (r[0] || "").trim();
      const wd = Object.keys(WEEKDAY).find((w) => a.startsWith(w + " "));
      if (wd) { dayKey = WEEKDAY[wd]; stages = []; rowTime = null; continue; }
      if (a === "שעה") { stages = r.map((x) => x.trim()); continue; }
      if (/^\d{1,2}:\d\d$/.test(a)) rowTime = toMin(a); else continue;
      if (!dayKey || !stages.length) continue;
      for (let c = 1; c < stages.length; c++) {
        const raw = (r[c] || "").trim(); const stage = stages[c];
        if (!raw || !stage) continue;
        const m = raw.match(RANGE);
        const key = norm(raw.replace(RANGE, ""));
        if (!key || stages.includes(key)) continue;
        const name = key in ALIAS ? ALIAS[key] : key.replace(/\?+$/, "");
        if (!name) continue;
        const start = m ? toMin(m[1]) : rowTime;
        const kind = name in HL ? "head" : (DJ.has(name) || /תקלוט|\bDJ\b/i.test(name) ? "dj" : "live");
        const show = { day: dayKey, stage, name, start, end: m ? toMin(m[2]) : null, kind, id: `${dayKey}-${start}-${stage}` };
        if (HL[name]) show.en = HL[name];
        out.push(show);
      }
    }
    // shows without an end time run until the next show on that stage, at most 1 hour
    for (const s of out) {
      const next = out.filter((o) => o.day === s.day && o.stage === s.stage && o.start > s.start).reduce((m, o) => Math.min(m, o.start), DAY_END);
      if (s.end == null || s.end <= s.start) s.end = Math.min(s.start + 60, next);
      s.end = Math.min(s.end, next);
      if (s.end <= s.start) s.end = s.start + 30;
    }
    return out.sort((a, b) => Object.keys(DAYS).indexOf(a.day) - Object.keys(DAYS).indexOf(b.day) || a.start - b.start);
  }
  async function loadLive() {
    try {
      const res = await fetch(SHEET_CSV, { cache: "no-store" });
      if (!res.ok) return;
      const shows = sheetToShows(parseCSV(await res.text()));
      if (shows.length < 5) return; // ignore empty or broken sheet
      DATA = shows;
      store.set(CACHE_KEY, shows);
      renderHeadliners();
      updateCount(false);
      mineOn ? renderMine() : renderGrid();
    } catch (e) { /* keep the built-in schedule */ }
  }

  const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.3l-5.8 3.1 1.2-6.5L2.6 9.4l6.5-.8z"/></svg>';
  const starBtn = (s) => `<button class="star" data-id="${s.id}" aria-pressed="${favs.has(s.id)}" aria-label="${favs.has(s.id) ? "הסרה מהליינאפ שלי" : "הוספה לליינאפ שלי"}">${STAR_SVG}</button>`;

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
        const cls = ["show", "s-" + stageIdx(s.stage), s.kind, favs.has(s.id) ? "fav" : "", favPop === s.id ? "pop" : ""].join(" ");
        html += `<div class="${cls}" data-id="${s.id}" style="inset-inline-start:${(s.start - d.start) * px + 2}px;width:${w}px" ` +
          `role="button" tabindex="0" aria-label="פרטים: ${esc(s.name)}, ${hhmm(s.start)} עד ${hhmm(s.end)}, ${esc(s.stage)}">` +
          `<span class="top">${starBtn(s)}<span class="nm">${esc(s.name)}</span></span>` +
          `<span class="tm"><em>${hhmm(s.start)}</em>–${hhmm(s.end)}</span></div>`;
      }
      html += `</div></div>`;
    }
    const sc = $("#scroller"), keep = sc.scrollLeft;
    $("#grid").innerHTML = html;
    sc.scrollLeft = keep;
  }

  /* ---------- my lineup ---------- */
  function renderMine() {
    const list = DATA.filter((s) => favs.has(s.id));
    if (!list.length) {
      $("#mine-view").innerHTML = `<div class="empty"><span class="big">★</span>עוד לא סימנתם הופעות.<br>הקישו על ☆ ליד הופעה בלו״ז כדי להוסיף אותה לליינאפ שלכם.</div>`;
      return;
    }
    let html = "";
    for (const k of Object.keys(DAYS)) {
      const items = list.filter((s) => s.day === k).sort((a, b) => a.start - b.start);
      if (!items.length) continue;
      html += `<h3 class="mv-day">${DAYS[k].name} ${DAYS[k].date}</h3>`;
      for (const s of items) {
        const clash = items.some((o) => o !== s && o.start < s.end && s.start < o.end);
        html += `<div class="mv-item s-${stageIdx(s.stage)}" data-id="${s.id}" role="button" tabindex="0"><div class="mv-time">${hhmm(s.start)}</div>` +
          `<div class="mv-body"><div class="mv-name">${esc(s.name)}</div>` +
          `<div class="mv-meta">${esc(s.stage)} · עד ${hhmm(s.end)}${s.kind === "dj" ? " · תקלוט" : ""}${clash ? ' · <span class="clash">חופף להופעה אחרת</span>' : ""}</div></div>` +
          `${starBtn(s)}</div>`;
      }
    }
    $("#mine-view").innerHTML = html;
  }

  /* ---------- state ---------- */
  function updateCount(bump) {
    $("#count").textContent = DATA.filter((s) => favs.has(s.id)).length;
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
  let toastT, favPop = null;
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
    favPop = on ? id : null;
    return on;
  }

  /* ---------- events ---------- */
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setDay(b.dataset.day); });
  $("#mine").addEventListener("click", () => setMine(!mineOn));
  // star = favorite, anywhere else on the block = artist details
  function onListClick(e) {
    const star = e.target.closest(".star");
    if (star) { e.stopPropagation(); toggle(star.dataset.id); refresh(); return; }
    const item = e.target.closest("[data-id]");
    if (item) openArtist(item.dataset.id);
  }
  function onListKey(e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("[role=button][data-id]")) { e.preventDefault(); openArtist(e.target.dataset.id); }
  }
  for (const el of [$("#grid"), $("#mine-view")]) { el.addEventListener("click", onListClick); el.addEventListener("keydown", onListKey); }

  /* ---------- artist details ---------- */
  const dlg = $("#artist");
  let openId = null;
  function calLink(s) {
    const t = (m) => {
      const base = new Date(DAYS[s.day].iso + "T00:00:00Z"); base.setUTCMinutes(m);
      return base.toISOString().slice(0, 16).replace(/[-:]/g, "") + "00";
    };
    const q = new URLSearchParams({
      action: "TEMPLATE", text: `${s.name} · פסטיבל הג'אז תל אביב-יפו`,
      dates: `${t(s.start)}/${t(s.end)}`, ctz: "Asia/Jerusalem",
      location: `בית רומנו, דרך יפו 9, תל אביב-יפו (${s.stage})`,
    });
    return "https://calendar.google.com/calendar/render?" + q.toString();
  }
  function renderArtist() {
    const s = DATA.find((x) => x.id === openId); if (!s) return;
    const fav = favs.has(s.id);
    const info = (window.ARTIST_INFO || {})[s.name];
    const same = DATA.filter((o) => o.day === s.day && o.id !== s.id && o.start < s.end && s.start < o.end);
    $("#artist-body").innerHTML =
      `<div class="a-head s-${stageIdx(s.stage)} ${s.kind}">` +
        `<span class="a-kind">${s.kind === "dj" ? "תקלוט" : s.kind === "head" ? "הדליינר" : "הופעה"}</span>` +
        `<h3 class="a-name" id="artist-title">${esc(s.name)}</h3>` +
        (s.en ? `<p class="a-en">${esc(s.en)}</p>` : "") +
      `</div>` +
      `<dl class="a-facts">` +
        `<div><dt>יום</dt><dd>${DAYS[s.day].name} ${DAYS[s.day].date}</dd></div>` +
        `<div><dt>שעה</dt><dd dir="ltr">${hhmm(s.start)}–${hhmm(s.end)}</dd></div>` +
        `<div><dt>במה</dt><dd>${esc(s.stage)}</dd></div>` +
      `</dl>` +
      (info ? `<p class="a-info">${esc(info)}</p>` : "") +
      `<div class="a-actions">` +
        `<button class="a-fav ${fav ? "on" : ""}" data-id="${s.id}"><span class="a-star">${STAR_SVG}</span>${fav ? "בליינאפ שלי" : "הוספה לליינאפ שלי"}</button>` +
        `<a class="a-cal" href="${calLink(s)}" target="_blank" rel="noopener">הוספה ליומן</a>` +
      `</div>` +
      (same.length ? `<div class="a-same"><h4>באותו זמן</h4>` + same.map((o) =>
        `<button class="a-same-item" data-id="${o.id}"><span class="dot s-${stageIdx(o.stage)}"></span><b>${esc(o.name)}</b><small>${esc(o.stage)} · <span dir="ltr">${hhmm(o.start)}–${hhmm(o.end)}</span></small></button>`).join("") + `</div>` : "");
  }
  function openArtist(id) {
    const first = !dlg.open;
    openId = id; renderArtist();
    if (first) {
      dlg.showModal();
      try { history.pushState({ artist: id }, ""); } catch (e) {}
    }
    dlg.querySelector(".a-sheet").scrollTop = 0;
  }
  function closeArtist(fromHistory) {
    if (!dlg.open) return;
    dlg.close();
    if (!fromHistory && history.state && history.state.artist) history.back();
  }
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg || e.target.closest(".a-close")) return closeArtist();
    const fav = e.target.closest(".a-fav");
    if (fav) { toggle(fav.dataset.id); refresh(); renderArtist(); return; }
    const other = e.target.closest(".a-same-item");
    if (other) openArtist(other.dataset.id);
  });
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeArtist(); });
  addEventListener("popstate", () => closeArtist(true));

  function refresh() { mineOn ? renderMine() : renderGrid(); favPop = null; }

  let lastPx = pxPerMin();
  addEventListener("resize", () => { const p = pxPerMin(); if (p !== lastPx) { lastPx = p; renderGrid(); } });

  const sentinel = document.createElement("div");
  $("#controls").before(sentinel);
  new IntersectionObserver(([en]) => $("#controls").classList.toggle("stuck", !en.isIntersecting)).observe(sentinel);

  renderHeadliners();
  setDay(day);
  updateCount(false);
  loadLive();
})();
