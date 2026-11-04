(function () {
  document.documentElement.classList.add("js");
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

  /* ---------- reveal on scroll ---------- */
  const revealObs = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add("in"); revealObs.unobserve(en.target); }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.15 }) : null;
  const reveal = (el) => { el.classList.add("reveal"); revealObs ? revealObs.observe(el) : el.classList.add("in"); };

  /* ---------- headliners ---------- */
  function renderHeadliners() {
    const keepIn = document.querySelectorAll("#hl-list li.in").length > 0;
    const HL = window.HEADLINERS || {};
    const order = Object.keys(HL);
    const COLORS = ["c-yellow", "c-cream", "c-blue", "c-pink", "c-yellow"];
    const heads = DATA.filter((s) => s.kind === "head").sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
    $("#hl-list").innerHTML = heads.map((s, i) => {
      const [main, sub] = String(s.en || s.name).split(" · ");
      return `<li class="${COLORS[i % 5]} reveal" style="--i:${i}"><span class="en">${esc(main)}</span>` +
        (sub ? `<span class="en sub">${esc(sub)}</span>` : "") +
        `<span class="when">${DAYS[s.day].name} ${DAYS[s.day].date} · ${hhmm(s.start)} · ${esc(s.stage)}</span></li>`;
    }).join("");
    document.querySelectorAll("#hl-list li").forEach((li) => keepIn ? li.classList.add("in") : revealObs && revealObs.observe(li));
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
      renderArtists(false);
      updateCount(false);
      mineOn ? renderMine() : renderGrid();
    } catch (e) { /* keep the built-in schedule */ }
  }

  const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.3l-5.8 3.1 1.2-6.5L2.6 9.4l6.5-.8z"/></svg>';
  const starBtn = (s) => `<button class="star" data-id="${s.id}" aria-pressed="${favs.has(s.id)}" aria-label="${favs.has(s.id) ? "הסרה מהליינאפ שלי" : "הוספה לליינאפ שלי"}">${STAR_SVG}</button>`;

  /* ---------- grid ---------- */
  function renderGrid(animate) {
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
        const cls = ["show", "s-" + stageIdx(s.stage), s.kind, favs.has(s.id) ? "fav" : "", favPop === s.id ? "pop" : "", animate ? "enter" : ""].join(" ");
        const delay = Math.round(((s.start - d.start) / (DAY_END - d.start)) * 260 + stages.indexOf(st) * 45);
        html += `<div class="${cls}" data-id="${s.id}" style="inset-inline-start:${(s.start - d.start) * px + 2}px;width:${w}px;--d:${delay}ms" ` +
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
  function renderMine(animate) {
    let n = 0;
    const list = DATA.filter((s) => favs.has(s.id));
    if (!list.length) {
      $("#mine-view").innerHTML = `<div class="empty ${animate ? "enter" : ""}"><span class="big">★</span>עוד לא סימנתם הופעות.<br>הקישו על ☆ ליד הופעה בלו״ז כדי להוסיף אותה לליינאפ שלכם.</div>`;
      return;
    }
    let html = "";
    for (const k of Object.keys(DAYS)) {
      const items = list.filter((s) => s.day === k).sort((a, b) => a.start - b.start);
      if (!items.length) continue;
      html += `<h3 class="mv-day ${animate ? "enter" : ""}" style="--i:${n++}">${DAYS[k].name} ${DAYS[k].date}</h3>`;
      for (const s of items) {
        const clash = items.some((o) => o !== s && o.start < s.end && s.start < o.end);
        html += `<div class="mv-item s-${stageIdx(s.stage)} ${animate ? "enter" : ""}" style="--i:${n++}" data-id="${s.id}" role="button" tabindex="0"><div class="mv-time">${hhmm(s.start)}</div>` +
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
    renderGrid(true);
    $("#scroller").scrollLeft = 0;
  }
  function setMine(on) {
    mineOn = on;
    $("#mine").setAttribute("aria-pressed", String(on));
    $("#grid-view").hidden = on;
    $("#mine-view").hidden = !on;
    document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-selected", String(!on && b.dataset.day === day)));
    if (on) renderMine(true); else renderGrid(true);
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
    const entry = lineupFor(s);
    const meta = infoFor(entry, s.name);
    const info = meta.bio;
    const same = DATA.filter((o) => o.day === s.day && o.id !== s.id && o.start < s.end && s.start < o.end);
    $("#artist-body").innerHTML = photoHTML(meta) +
      `<div class="a-head s-${stageIdx(s.stage)} ${s.kind}">` +
        `<span class="a-kind">${s.kind === "dj" ? "תקלוט" : s.kind === "head" ? "הדליינר" : "הופעה"}</span>` +
        `<h3 class="a-name" id="artist-title">${esc(s.name)}</h3>` +
        ((s.en || (entry && entry.en)) ? `<p class="a-en">${esc(s.en || entry.en)}</p>` : "") +
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
    const body = $("#artist-body"); body.classList.remove("fresh"); void body.offsetWidth; body.classList.add("fresh");
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
    if (fav) { toggle(fav.dataset.id); refresh(); $("#artist-body").classList.remove("fresh"); renderArtist(); return; }
    const other = e.target.closest(".a-same-item");
    if (other) openArtist(other.dataset.id);
  });
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeArtist(); });
  addEventListener("popstate", () => closeArtist(true));


  /* ---------- lineup (official list) + artist info ---------- */
  const LINEUP = window.LINEUP || [];
  const GROUP_LABEL = { head: "הדליינר", live: "הופעה", show: "שואוקייס", dj: "תקלוט" };
  function lineupFor(s) { return LINEUP.find((e) => e.day === s.day && e.show === s.name) || null; }
  function infoFor(entry, heName) {
    const I = window.ARTIST_INFO || {};
    const v = (entry && I[entry.en]) || I[heName] || null;
    if (!v) return {};
    return typeof v === "string" ? { bio: v } : v;
  }
  function photoHTML(meta) {
    return meta.photo ? `<figure class="a-photo"><img src="${esc(meta.photo)}" alt="">` +
      (meta.credit ? `<figcaption>${esc(meta.credit)}</figcaption>` : "") + `</figure>` : "";
  }
  function showsFor(e) { return e.show ? DATA.filter((s) => s.day === e.day && s.name === e.show).sort((a, b) => a.start - b.start) : []; }

  function openLineup(i) {
    const e = LINEUP[i]; if (!e) return;
    const sh = showsFor(e);
    if (sh.length) return openArtist(sh[0].id);
    const meta = infoFor(e);
    openId = null;
    $("#artist-body").innerHTML = photoHTML(meta) +
      `<div class="a-head s-${e.group === "dj" ? 1 : e.group === "head" ? 0 : 2} ${e.group === "dj" ? "dj" : ""}">` +
        `<span class="a-kind">${GROUP_LABEL[e.group]}</span>` +
        `<h3 class="a-name" id="artist-title" dir="ltr" style="text-align:left">${esc(e.en)}</h3>` +
      `</div>` +
      `<dl class="a-facts"><div><dt>יום</dt><dd>${DAYS[e.day].name} ${DAYS[e.day].date}</dd></div>` +
        `<div><dt>שעה</dt><dd>בקרוב</dd></div><div><dt>מקום</dt><dd>בית רומנו</dd></div></dl>` +
      (e.note ? `<p class="a-note">${esc(e.note)}</p>` : "") +
      (meta.bio ? `<p class="a-info">${esc(meta.bio)}</p>` : "");
    const body = $("#artist-body"); body.classList.remove("fresh"); void body.offsetWidth; body.classList.add("fresh");
    if (!dlg.open) { dlg.showModal(); try { history.pushState({ artist: "lineup-" + i }, ""); } catch (err) {} }
    dlg.querySelector(".a-sheet").scrollTop = 0;
  }

  /* ---------- artists list ---------- */
  let arFilter = "all";
  const ORDER = { head: 0, live: 1, show: 2, dj: 3 };
  const DAY_ORDER = { thu: 0, fri: 1, sat: 2 };
  function renderArtists(animate) {
    const list = LINEUP.map((e, i) => ({ e, i })).filter(({ e }) =>
      arFilter === "all" ? true : arFilter === "dj" ? e.group === "dj" : e.day === arFilter);
    list.sort((a, b) => (ORDER[a.e.group] - ORDER[b.e.group]) || (DAY_ORDER[a.e.day] - DAY_ORDER[b.e.day]) || a.e.en.localeCompare(b.e.en));
    $("#ar-list").innerHTML = list.map(({ e, i }, n) => {
      const sh = showsFor(e)[0];
      const when = `${DAYS[e.day].name} ${DAYS[e.day].date}` + (sh ? ` · <span dir="ltr">${hhmm(sh.start)}</span> · ${esc(sh.stage)}` : "");
      const tag = e.group === "dj" ? "תקלוט · " : e.group === "show" ? esc(e.note || "שואוקייס") + " · " : "";
      return `<li><button class="ar-item g-${e.group}${animate ? " enter" : ""}" style="--i:${Math.min(n, 24)}" data-i="${i}">` +
        `<span class="ar-name">${esc(e.en)}</span><span class="ar-sub">${tag}${when}</span></button></li>`;
    }).join("");
  }
  $("#ar-filters").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-f]"); if (!b) return;
    arFilter = b.dataset.f;
    $("#ar-filters").querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    renderArtists(true);
  });
  $("#ar-list").addEventListener("click", (ev) => { const b = ev.target.closest(".ar-item"); if (b) openLineup(+b.dataset.i); });

  /* ---------- day cards ---------- */
  function renderDays() {
    $("#day-cards").innerHTML = Object.keys(DAYS).map((k) => {
      const d = DAYS[k], [dd] = d.date.split(".");
      const heads = LINEUP.filter((e) => e.day === k && e.group === "head").map((e) => esc(e.en.split(/ feat\.? | - /i)[0]));
      const live = LINEUP.filter((e) => e.day === k && e.group !== "dj").length;
      const dj = LINEUP.filter((e) => e.day === k && e.group === "dj").length;
      return `<button class="day-card reveal" data-day="${k}">` +
        `<span class="dc-date"><span><b>${dd}</b><small>בנובמבר</small></span></span>` +
        `<span class="dc-day">${d.name}</span>` +
        `<span class="dc-heads">${heads.join(" · ")}</span>` +
        `<span class="dc-meta">${live} הופעות · ${dj} תקלוטים · ג׳אם חצות</span>` +
        `<span class="dc-go" aria-hidden="true">←</span></button>`;
    }).join("");
    document.querySelectorAll(".day-card").forEach(reveal);
  }
  $("#day-cards").addEventListener("click", (ev) => {
    const c = ev.target.closest(".day-card"); if (!c) return;
    if (mineOn) setMine(false);
    setDay(c.dataset.day);
    $("#schedule").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });

  /* ---------- stage ribbon: double the track for a seamless loop ---------- */
  const rb = $("#rb-track"); if (rb) { rb.innerHTML += rb.innerHTML; rb.querySelectorAll("span, i").forEach((el, n) => n >= rb.children.length / 2 && el.setAttribute("aria-hidden", "true")); }

  /* ---------- top menu ---------- */
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([en]) => document.body.classList.toggle("nav-on", !en.isIntersecting), { rootMargin: "-60px 0px 0px 0px" }).observe($(".poster"));
    const links = [...document.querySelectorAll(".tn-links a")];
    const secObs = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) links.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + en.target.id));
    }, { rootMargin: "-45% 0px -50% 0px" });
    ["days", "schedule", "artists", "info"].forEach((id) => secObs.observe(document.getElementById(id)));
  }

  function refresh() { mineOn ? renderMine() : renderGrid(); favPop = null; }

  let lastPx = pxPerMin();
  addEventListener("resize", () => { const p = pxPerMin(); if (p !== lastPx) { lastPx = p; renderGrid(); } });

  const sentinel = document.createElement("div");
  $("#controls").before(sentinel);
  new IntersectionObserver(([en]) => $("#controls").classList.toggle("stuck", !en.isIntersecting)).observe(sentinel);

  document.querySelectorAll(".section-title, .about p, .hint").forEach(reveal);
  renderHeadliners();
  renderDays();
  renderArtists(false);
  document.querySelectorAll(".info-card").forEach(reveal);
  setDay(day);
  updateCount(false);
  loadLive();
})();
