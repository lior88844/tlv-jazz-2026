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
      const en = String(s.en || "").toLowerCase();
      const pic = /margeeah/.test(en) ? "margeeah" : /johnny/.test(en) ? "johnny" : /liraz/.test(en) ? "liraz" : /blue break/.test(en) ? "bbb" : /emma/.test(en) ? "emma" : "";
      return `<li class="hl-card reveal" style="--i:${i}" data-id="${s.id}" tabindex="0" role="button" aria-label="${esc(String(s.en || s.name).replace(" · ", " – "))}: פרטים">` +
        (pic ? `<img class="hl-photo" src="assets/headliners/${pic}.webp?v=2" alt="" loading="lazy">` : "") +
        `<div class="hl-strip ${pic === "liraz" ? "c-pink" : pic === "bbb" ? "c-blue" : COLORS[i % 5]}"><span class="en">${esc(main)}</span>` +
        (sub ? `<span class="en sub">${esc(sub)}</span>` : "") +
        `<span class="when">${DAYS[s.day].name} ${DAYS[s.day].date} · ${hhmm(s.start)} · ${esc(s.stage)}</span></div></li>`;
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
          `aria-label="${esc(s.name)}, ${hhmm(s.start)} עד ${hhmm(s.end)}, ${esc(s.stage)}">` +
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
      html += `<h3 class="mv-day ${animate ? "enter" : ""}" style="--i:${n++}">${DAYS[k].name} <span>${DAYS[k].date}</span><small>${items.length} ${items.length === 1 ? "הופעה" : "הופעות"}</small></h3>`;
      for (const s of items) {
        const clash = items.some((o) => o !== s && o.start < s.end && s.start < o.end);
        html += `<div class="mv-item s-${stageIdx(s.stage)} ${animate ? "enter" : ""}" style="--i:${n++}" data-id="${s.id}"><div class="mv-time">${hhmm(s.start)}</div>` +
          `<div class="mv-body"><div class="mv-name">${esc(s.name)}</div>` +
          `<div class="mv-meta">${esc(s.stage)}${s.kind === "dj" ? " · תקלוט" : ""}${clash ? ' · <span class="clash">חופף להופעה אחרת</span>' : ""}</div></div>` +
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
    $("#controls").classList.toggle("mine-on", on);
    const lbl = $("#mine .mine-label"); if (lbl) lbl.textContent = on ? "חזרה ללו״ז המלא" : "הליינאפ שלי";
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
  // schedule blocks aren't clickable (artist texts exist for headliners only); the star still toggles favorites
  function onListClick(e) {
    const star = e.target.closest(".star");
    if (star) { e.stopPropagation(); toggle(star.dataset.id); refresh(); }
  }
  for (const el of [$("#grid"), $("#mine-view")]) el.addEventListener("click", onListClick);

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
        `<div><dt>שעה</dt><dd dir="ltr">${hhmm(s.start)}</dd></div>` +
        `<div><dt>במה</dt><dd>${esc(s.stage)}</dd></div>` +
      `</dl>` +
      (info ? `<p class="a-info">${esc(info)}</p>` : "") +
      `<div class="a-actions">` +
        `<button class="a-fav ${fav ? "on" : ""}" data-id="${s.id}"><span class="a-star">${STAR_SVG}</span>${fav ? "בליינאפ שלי" : "הוספה לליינאפ שלי"}</button>` +
        `<a class="a-cal" href="${calLink(s)}" target="_blank" rel="noopener">הוספה ליומן</a>` +
      `</div>` +
      (same.length ? `<div class="a-same"><h4>באותו זמן</h4>` + same.map((o) =>
        { const tg = o.kind === "head" ? "button" : "div"; return `<${tg} class="a-same-item" data-id="${o.id}"><span class="dot s-${stageIdx(o.stage)}"></span><b>${esc(o.name)}</b><small>${esc(o.stage)} · <span dir="ltr">${hhmm(o.start)}</span></small></${tg}>`; }).join("") + `</div>` : "");
  }
  function openArtist(id) {
    const first = !dlg.open;
    openId = id; renderArtist();
    const body = $("#artist-body"); body.classList.remove("fresh"); void body.offsetWidth; body.classList.add("fresh");
    if (first) {
      dlg.showModal();
      try { history.pushState({ artist: id }, ""); } catch (e) {}
    }
    $("#artist-body").scrollTop = 0; updateBar(); scroller.querySelectorAll("img").forEach((i) => i.addEventListener("load", () => updateBar(), { once: true })); setTimeout(() => updateBar(), 650);
  }
  /* custom scroll indicator that stays inside the window's rounded corners */
  const scroller = $("#artist-body"), bar = dlg.querySelector(".a-bar"), thumb = dlg.querySelector(".a-thumb");
  let barHide = null;
  function updateBar(show) {
    const ch = scroller.clientHeight, sh = scroller.scrollHeight;
    if (!ch || sh <= ch + 2) { bar.style.opacity = 0; return; }
    const th = bar.clientHeight, h = Math.max(36, th * ch / sh);
    thumb.style.height = h + "px";
    thumb.style.transform = `translateY(${(scroller.scrollTop / (sh - ch)) * (th - h)}px)`;
    if (show) { bar.style.opacity = 1; clearTimeout(barHide); barHide = setTimeout(() => { bar.style.opacity = 0; }, 1100); }
  }
  scroller.addEventListener("scroll", () => updateBar(true), { passive: true });
  addEventListener("resize", () => dlg.open && updateBar());
  if ("ResizeObserver" in window) new ResizeObserver(() => dlg.open && updateBar()).observe(scroller);
  function closeArtist(fromHistory) {
    if (!dlg.open || dlg.classList.contains("closing")) return;
    if (!fromHistory && history.state && history.state.artist) history.back();
    const sheet = dlg.querySelector(".a-sheet");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !sheet.getAnimations) { dlg.close(); return; }
    dlg.classList.add("closing");
    const done = () => { dlg.classList.remove("closing"); dlg.close(); };
    sheet.addEventListener("animationend", done, { once: true });
    setTimeout(() => { if (dlg.classList.contains("closing")) done(); }, 450);
  }
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg || e.target.closest(".a-close")) return closeArtist();
    const fav = e.target.closest(".a-fav");
    if (fav) { toggle(fav.dataset.id); refresh(); $("#artist-body").classList.remove("fresh"); renderArtist(); return; }
    const other = e.target.closest("button.a-same-item");
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
    $("#artist-body").scrollTop = 0; updateBar(); scroller.querySelectorAll("img").forEach((i) => i.addEventListener("load", () => updateBar(), { once: true })); setTimeout(() => updateBar(), 650);
  }

  /* ---------- artists list ---------- */
  let arFilter = "all";
  const ORDER = { head: 0, live: 1, show: 2, dj: 3 };
  const DAY_ORDER = { thu: 0, fri: 1, sat: 2 };
  function renderArtists(animate) {
    const list = LINEUP.map((e, i) => ({ e, i }));
    const HEAD_ORDER = ["Margeeah", "Johnny", "Blue Break", "Liraz", "Emma"];
    const ho = (e) => { const k = HEAD_ORDER.findIndex((h) => e.en.startsWith(h)); return k < 0 ? 9 : k; };
    list.sort((a, b) => (ORDER[a.e.group] - ORDER[b.e.group]) || (a.e.group === "head" ? ho(a.e) - ho(b.e) : 0) || (DAY_ORDER[a.e.day] - DAY_ORDER[b.e.day]) || a.e.en.localeCompare(b.e.en));
    $("#ar-list").innerHTML = list.map(({ e, i }, n) => {
      const sh = showsFor(e)[0];
      const when = `${DAYS[e.day].name} ${DAYS[e.day].date}` + (sh ? ` · <span dir="ltr">${hhmm(sh.start)}</span> · ${esc(sh.stage)}` : "");
      const tag = e.group === "dj" ? "תקלוט · " : e.group === "show" ? esc(e.note || "שואוקייס") + " · " : "";
      const rnd = (k) => { const x = Math.sin((i + 1) * 9301 + k * 49297) * 233280; return x - Math.floor(x); };
      const r = ((rnd(1) - .5) * 2.4).toFixed(2), dx = 0;
      const tg = e.group === "head" ? "button" : "div";
      return `<li data-day="${e.day}" data-group="${e.group}"${matches(e.day, e.group) ? "" : " hidden"}><${tg} class="ar-item g-${e.group} wait" style="--r:${r}deg;--dx:${dx}px" data-i="${i}">` +
        `<span class="ar-name">${esc(e.en)}</span><span class="ar-sub">${tag}${when}</span></${tg}></li>`;
    }).join("");
    dropObserve();
  }
  /* gravity: strips fall in as they scroll into view, in small waves */
  let dropQueue = 0, dropTimer = null;
  const dropObs = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const el = en.target; dropObs.unobserve(el);
      el.style.setProperty("--d", (dropQueue++ * 70) + "ms");
      el.classList.remove("wait"); el.classList.add("drop");
    }
    clearTimeout(dropTimer); dropTimer = setTimeout(() => { dropQueue = 0; }, 120);
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.2 }) : null;
  function dropObserve() {
    document.querySelectorAll("#ar-list .ar-item").forEach((el) => dropObs ? dropObs.observe(el) : el.classList.remove("wait"));
  }
  $("#ar-filters").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-f]"); if (!b) return;
    if (arFilter === b.dataset.f) return;
    arFilter = b.dataset.f;
    $("#ar-filters").querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    applyFilter();
    schedulePlace(1100);
  });
  function matches(day, group) { return arFilter === "all" ? true : arFilter === "dj" ? group === "dj" : day === arFilter; }

  /* filter without re-dropping everything: leavers fall away, the rest slide into the gaps, newcomers drop in */
  function applyFilter() {
    const lis = [...document.querySelectorAll("#ar-list > li")];
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const first = new Map();
    lis.forEach((li) => { if (!li.hidden) first.set(li, li.getBoundingClientRect()); });
    const leaving = [], entering = [];
    lis.forEach((li) => {
      const want = matches(li.dataset.day, li.dataset.group);
      if (!li.hidden && !want) leaving.push(li);
      if (li.hidden && want) entering.push(li);
    });
    // leavers: a ghost copy falls off the pile while the real one leaves the layout
    if (!calm) leaving.forEach((li, n) => {
      const r = first.get(li), g = li.cloneNode(true);
      Object.assign(g.style, { position: "fixed", left: r.left + "px", top: r.top + "px", width: r.width + "px", margin: 0, zIndex: 30, pointerEvents: "none", listStyle: "none" });
      const src = li.firstElementChild, gb = g.firstElementChild, cs = getComputedStyle(src);
      gb.classList.remove("drop", "wait");
      Object.assign(gb.style, { background: cs.backgroundColor, color: cs.color, transform: cs.transform, animation: "none" });
      g.querySelectorAll(".ar-name").forEach((n) => { n.style.setProperty("color", getComputedStyle(src.querySelector(".ar-name")).color, "important"); n.style.setProperty("font-size", getComputedStyle(src.querySelector(".ar-name")).fontSize, "important"); });
      g.classList.add("ar-ghost"); document.body.appendChild(g);
      const rot = (n % 2 ? 1 : -1) * (8 + (n % 3) * 4);
      g.animate([{ transform: "translateY(0) rotate(0)", opacity: 1 },
                 { transform: `translateY(${innerHeight * .35}px) rotate(${rot}deg)`, opacity: 0 }],
                { duration: 520, delay: Math.min(n, 12) * 18, easing: "cubic-bezier(.5, 0, .9, .5)", fill: "forwards" }).onfinish = () => g.remove();
    });
    leaving.forEach((li) => { li.hidden = true; });
    entering.forEach((li) => { li.hidden = false; });
    if (calm) { entering.forEach((li) => li.firstElementChild.classList.remove("wait")); return; }
    // stayers: slide from where they were to where they are now, landing with a small bounce
    let k = 0;
    lis.forEach((li) => {
      if (li.hidden || !first.has(li)) return;
      const a = first.get(li), b = li.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      li.animate([
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: "translate(0, 0)", offset: .72, easing: "cubic-bezier(.2, .7, .4, 1)" },
        { transform: "translate(0, -7px)", offset: .86, easing: "cubic-bezier(.6, 0, .8, .4)" },
        { transform: "translate(0, 0)" },
      ], { duration: 640, delay: 140 + Math.min(k++, 20) * 14, easing: "cubic-bezier(.55, 0, .85, .45)", fill: "backwards" });
    });
    // newcomers: drop in from above
    entering.forEach((li, n) => {
      const el = li.firstElementChild;
      if (dropObs) dropObs.unobserve(el);
      el.classList.remove("wait", "drop"); void el.offsetWidth;
      el.style.setProperty("--d", (220 + Math.min(n, 20) * 45) + "ms");
      el.classList.add("drop");
    });
  }
  $("#hl-list").addEventListener("click", (ev) => { const c = ev.target.closest(".hl-card"); if (c) openArtist(c.dataset.id); });
  $("#hl-list").addEventListener("keydown", (ev) => { const c = ev.target.closest(".hl-card"); if (c && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); openArtist(c.dataset.id); } });
  $("#ar-list").addEventListener("click", (ev) => { const b = ev.target.closest("button.ar-item"); if (b) openLineup(+b.dataset.i); });


  /* ---------- stars across the whole hero ---------- */
  function buildSky() {
    const sky = $("#sky"); if (!sky) return;
    // x, y (% of hero), width (px), shape, rotation
    const S = [
      [3, 7, 34, "white", 10], [12, 22, 18, "pink", -20], [6, 46, 26, "blue", 12], [15, 63, 14, "white", 30], [4, 82, 30, "pink", -8],
      [22, 9, 14, "dots", 0], [20, 88, 16, "blue", 25], [27, 52, 12, "white", -30],
      [96, 9, 28, "blue", -15], [88, 24, 16, "white", 20], [94, 41, 34, "pink", 8], [86, 60, 14, "dots", 180], [95, 74, 22, "white", -25], [83, 90, 18, "blue", 15],
      [76, 6, 12, "pink", 40], [73, 47, 12, "white", 0], [50, 3, 14, "white", -10], [60, 95, 14, "pink", 20], [40, 94, 12, "blue", -20],
    ];
    const small = innerWidth < 760;
    sky.innerHTML = S.map(([x, y, s, k, r], n) =>
      `<img src="assets/stars/${k === "dots" ? "dots" : "star-" + k}.png" alt="" style="--x:${x}%;--y:${y}%;--s:${Math.round(s * (small ? .8 : 1.25))}px;--r:${r}deg;--d:${(.25 + n * .06).toFixed(2)}s;--t:${(2.6 + (n % 5) * .7).toFixed(1)}s">`).join("");
    // gentle parallax while scrolling
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      let ticking = false;
      addEventListener("scroll", () => {
        if (ticking) return; ticking = true;
        requestAnimationFrame(() => { if (scrollY < innerHeight * 1.5) sky.style.transform = `translateY(${scrollY * .18}px)`; ticking = false; });
      }, { passive: true });
    }
  }

  /* ---------- little stars and dots in the empty spaces of each section ---------- */
  function decorate() {
    const small = innerWidth < 760;
    // [section, dark background?, [x%, y%, size, shape, rotation] ...]
    const SETS = [
      [".headliners", true, [[3, 6, 22, "white", 10], [95, 12, 16, "pink", -20], [92, 48, 26, "blue", 15], [4, 58, 14, "dots", 0], [96, 82, 14, "white", -30], [48, 2, 12, "pink", 25]]],
      [".days", true, [[96, 8, 20, "blue", -10], [3, 14, 14, "white", 20], [94, 70, 14, "dots", 180], [5, 90, 22, "pink", -15], [50, 97, 12, "white", 0]]],
      [".artists", true, [[4, 3, 18, "pink", 15], [95, 6, 24, "white", -12], [2, 30, 14, "dots", 0], [97, 38, 16, "blue", 30], [3, 62, 22, "white", -20], [96, 70, 14, "pink", 10], [5, 92, 14, "blue", 0], [94, 95, 18, "dots", 180]]],
      [".info", false, [[95, 6, 26, "pink", -10], [4, 10, 18, "blue", 20], [97, 60, 16, "blue", -25], [3, 86, 22, "pink", 15], [60, 3, 34, "moon", -8]]],
      [".footer", true, [[8, 10, 22, "white", 12], [90, 14, 16, "pink", -18], [14, 52, 14, "dots", 0], [88, 48, 24, "blue", 20], [6, 86, 14, "pink", -10], [93, 84, 18, "white", 30]]],
    ];
    const src = (k) => `assets/stars/${k === "dots" ? "dots" : k === "moon" ? "moon" : "star-" + k}.png`;
    for (const [sel, dark, list] of SETS) {
      const sec = document.querySelector(sel); if (!sec) continue;
      const d = document.createElement("div"); d.className = "sky deco"; d.setAttribute("aria-hidden", "true");
      d.innerHTML = list.filter((_, n) => !small || n % 3 !== 2).map(([x, y, s, k, r], n) =>
        `<img src="${src(dark ? k : (k === "dots" ? "pink" : k))}" alt="" style="--x:${x}%;--y:${y}%;--s:${Math.round(s * (small ? .8 : 1.6))}px;--r:${r}deg;--d:${(.1 + n * .12).toFixed(2)}s;--t:${(2.8 + (n % 4) * .8).toFixed(1)}s">`).join("");
      sec.prepend(d);
    }
  }

  /* ---------- phones: move each star to the nearest truly empty spot (or hide it) ---------- */
  const OBST = {
    ".hero": [".hero-top > *", ".ribbon"],
    ".headliners": [".hl-photo", ".hl-strip", ".hl-trumpet"],
    ".days": [".section-title", ".day-card"],
    ".artists": [".section-title", ".ar-filters", "#ar-list > li:not([hidden])", ".ar-hint"],
    ".info": [".section-title", ".info-card"],
    ".footer": [".logo-small", ".f-dates", ".f-note", ".partners img", ".p-label", ".credits", ".f-legal"],
  };
  let artMask = null;
  (function loadMask() {
    const im = new Image(); im.src = "assets/poster-art-800.png";
    im.onload = () => { const c = document.createElement("canvas"); c.width = 200; c.height = Math.round(200 * im.height / im.width);
      const x = c.getContext("2d"); x.drawImage(im, 0, 0, c.width, c.height); artMask = { w: c.width, h: c.height, d: x.getImageData(0, 0, c.width, c.height).data }; placeStars(); };
  })();
  function textRects(el) {
    if (/^H[1-6]$|^P$/.test(el.tagName)) { const r = document.createRange(); r.selectNodeContents(el); return [...r.getClientRects()]; }
    return [el.getBoundingClientRect()];
  }
  function onArt(x, y, w, h) {   // does this box touch drawn (non-transparent) parts of the poster art?
    const img = document.querySelector(".poster img"); if (!img || !artMask) return false;
    const r = img.getBoundingClientRect(); if (x + w < r.left || x > r.right || y + h < r.top || y > r.bottom) return false;
    for (let sy = y; sy <= y + h; sy += 4) for (let sx = x; sx <= x + w; sx += 4) {
      const u = Math.floor((sx - r.left) / r.width * artMask.w), v = Math.floor((sy - r.top) / r.height * artMask.h);
      if (u < 0 || v < 0 || u >= artMask.w || v >= artMask.h) continue;
      if (artMask.d[(v * artMask.w + u) * 4 + 3] > 20) return true;
    }
    return false;
  }
  function placeStars() {
    const stars = document.querySelectorAll(".sky img");
    if (innerWidth >= 760) { stars.forEach((s) => { s.style.left = s.style.top = ""; s.style.visibility = ""; }); return; }
    for (const sel in OBST) {
      const sec = document.querySelector(sel); if (!sec) continue;
      const sky = sec.querySelector(".sky"); if (!sky) continue;
      const keepT = sky.style.transform; sky.style.transform = "none";
      const S = sec.getBoundingClientRect(), pad = 6;
      const boxes = [];
      OBST[sel].forEach((q) => sec.querySelectorAll(q).forEach((el) => textRects(el).forEach((r) => { if (r.width && r.height) boxes.push(r); })));
      const placed = [];
      const free = (x, y, w, h) => {
        if (x < S.left + 2 || y < S.top + 2 || x + w > S.right - 2 || y + h > S.bottom - 2) return false;
        for (const b of boxes.concat(placed)) if (x < b.right + pad && x + w > b.left - pad && y < b.bottom + pad && y + h > b.top - pad) return false;
        return !(sel === ".hero" && onArt(x - pad, y - pad, w + pad * 2, h + pad * 2));
      };
      sky.querySelectorAll("img").forEach((s) => {
        s.style.left = s.style.top = ""; s.style.visibility = "";
        const w = s.offsetWidth || 20, h = s.offsetHeight || 20;
        const ox = S.left + parseFloat(s.style.getPropertyValue("--x")) / 100 * S.width;
        const oy = S.top + parseFloat(s.style.getPropertyValue("--y")) / 100 * S.height;
        let best = null, bd = Infinity;
        for (let y = S.top + 4; y < S.bottom - h; y += 8) for (let x = S.left + 4; x < S.right - w; x += 8) {
          const d = (x - ox) ** 2 + (y - oy) ** 2; if (d >= bd) continue;
          if (free(x, y, w, h)) { bd = d; best = [x, y]; }
        }
        if (!best || bd > 260 ** 2) { s.style.visibility = "hidden"; return; }
        s.style.left = (best[0] - S.left) + "px"; s.style.top = (best[1] - S.top) + "px";
        placed.push({ left: best[0], top: best[1], right: best[0] + w, bottom: best[1] + h });
      });
      sky.style.transform = keepT;
    }
  }
  let placeT = null;
  const schedulePlace = (ms) => { clearTimeout(placeT); placeT = setTimeout(placeStars, ms); };
  addEventListener("load", () => schedulePlace(1400));
  addEventListener("resize", () => schedulePlace(300));
  /* ---------- day cards ---------- */
  function renderDays() {
    const PICS = { thu: ["margeeah", "johnny"], fri: ["bbb"], sat: ["liraz", "emma"] };
    $("#day-cards").innerHTML = Object.keys(DAYS).map((k, n) => {
      const d = DAYS[k], [dd] = d.date.split(".");
      const heads = LINEUP.filter((e) => e.day === k && e.group === "head").map((e) => esc(e.en.split(/ feat\.? | - /i)[0]));
      return `<div class="dc-wrap">` +
        `<button class="day-card reveal" data-day="${k}" style="--i:${n}">` +
        `<span class="dc-pop" aria-hidden="true">${(PICS[k] || []).map((p, j) => `<span class="dc-fig" style="--j:${j};--ar:${({ margeeah: "640/637", johnny: "640/530", bbb: "565/640", liraz: "424/640", emma: "538/640" })[p]};--src:url('assets/headliners/${p}.webp?v=2')"><img src="assets/headliners/${p}.webp?v=2" alt=""></span>`).join("")}</span>` +
        `<span class="dc-date"><span><b>${dd}</b><small>בנובמבר</small></span></span>` +
        `<span class="dc-day">${d.name}</span>` +
        `<span class="dc-heads">${heads.join(" · ")}</span>` +
        `<span class="dc-more">ועוד הרבה הופעות ותקלוטים</span>` +
        `<span class="dc-go" aria-hidden="true">←</span></button></div>`;
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
  const rbi = $("#rb-info"); if (rbi) rbi.innerHTML = rbi.innerHTML.repeat(4);
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
  document.querySelectorAll(".info-card").forEach((el, i) => { el.style.setProperty("--i", i); reveal(el); });
  document.querySelectorAll(".footer .partners img, .footer .p-label").forEach((el, i) => { el.style.setProperty("--i", i); reveal(el); });
  buildSky();
  decorate();
  setDay(day);
  updateCount(false);
  loadLive();
})();
