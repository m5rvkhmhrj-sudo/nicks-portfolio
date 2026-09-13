/* Nick's Portfolio - single-file app. Screens: home, stock, add, podcasts, score */

// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
const money = (n, d = 2) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (r, d = 1) => (r >= 0 ? "+" : "") + (r * 100).toFixed(d) + "%";
const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const daysBetween = (a, b) => (new Date(b) - new Date(a)) / 86400000;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const ICON = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8z"/></svg>',
  up: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 6l6 8H6z"/></svg>',
  down: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 18l-6-8h12z"/></svg>',
};

// ---------- price math ----------
function lastPrice(h) { return h.weekly[h.weekly.length - 1][1]; }
function priceOnOrBefore(series, iso) {
  let v = null;
  for (const [d, p] of series) { if (d <= iso) v = p; else break; }
  return v;
}
function seriesFor(h, range) {
  // returns [[iso, price], ...] for a range
  const end = h.daily.length ? h.daily[h.daily.length - 1][0] : h.weekly[h.weekly.length - 1][0];
  const back = { "1M": 31, "6M": 183, "1Y": 366 }[range];
  if (!back) return h.weekly;
  const start = new Date(new Date(end).getTime() - back * 86400000).toISOString().slice(0, 10);
  const src = h.daily.length && h.daily[0][0] <= start ? h.daily : h.daily.length ? h.daily : h.weekly;
  const out = src.filter(([d]) => d >= start);
  return out.length > 1 ? out : h.weekly.filter(([d]) => d >= start);
}
function ret6m(h) {
  const last = h.daily.length ? h.daily[h.daily.length - 1] : h.weekly[h.weekly.length - 1];
  const target = new Date(new Date(last[0]).getTime() - 183 * 86400000).toISOString().slice(0, 10);
  const src = h.daily.length && h.daily[0][0] <= target ? h.daily : h.weekly;
  let base = priceOnOrBefore(src, target);
  if (base == null) base = src[0][1]; // held less than 6 months: use purchase price
  return last[1] / base - 1;
}
function cagr(h) {
  const yrs = Math.max(daysBetween(h.buyDate, AS_OF) / 365.25, 0.25);
  return Math.pow(lastPrice(h) / h.buyPrice, 1 / yrs) - 1;
}
// Score 0-100. Recent 6 months counts twice, since-purchase counts once.
function scoreParts(h) {
  const r6 = ret6m(h), c = cagr(h);
  const recent = 50 + 50 * Math.tanh(r6 / 0.20);
  const since = 50 + 50 * Math.tanh(c / 0.35);
  return { r6, cagr: c, recent, since, score: Math.round((since + 2 * recent) / 3) };
}
function portfolioScore() {
  const s = HOLDINGS.map((h) => scoreParts(h).score);
  return Math.round(s.reduce((a, b) => a + b, 0) / s.length);
}
function portfolioSeries(range) {
  // value = sum over holdings of invested * price/buyPrice (0 before purchase)
  const per = HOLDINGS.map((h) => ({ h, s: seriesFor(h, range) }));
  const dates = [...new Set(per.flatMap((p) => p.s.map((x) => x[0])))].sort();
  return dates.map((d) => {
    let v = 0;
    for (const { h, s } of per) {
      if (d < h.buyDate) continue;
      let p = priceOnOrBefore(s, d);
      if (p == null) p = priceOnOrBefore(h.weekly, d);
      if (p != null) v += h.invested * (p / h.buyPrice);
    }
    return [d, v];
  });
}
function portfolioTotals() {
  const invested = HOLDINGS.reduce((a, h) => a + h.invested, 0);
  const value = HOLDINGS.reduce((a, h) => a + h.invested * (lastPrice(h) / h.buyPrice), 0);
  return { invested, value, gain: value - invested, ret: value / invested - 1 };
}

// ---------- chart ----------
function lineChart(points, { color = "#7C5CFF", w = 358, h = 170, baseline = true } = {}) {
  if (points.length < 2) return "";
  const ys = points.map((p) => p[1]);
  const min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
  const pad = 6;
  const X = (i) => (i / (points.length - 1)) * w;
  const Y = (v) => pad + (1 - (v - min) / span) * (h - pad * 2);
  const d = points.map((p, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p[1]).toFixed(1)).join(" ");
  const area = d + ` L${w} ${h} L0 ${h} Z`;
  const last = points[points.length - 1];
  const y0 = Y(points[0][1]);
  const id = "g" + Math.random().toString(36).slice(2, 7);
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#${id})"/>
    ${baseline ? `<line x1="0" x2="${w}" y1="${y0.toFixed(1)}" y2="${y0.toFixed(1)}" stroke="#3A3A4E" stroke-dasharray="3 5" stroke-width="1"/>` : ""}
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${w}" cy="${Y(last[1]).toFixed(1)}" r="4" fill="${color}"/>
  </svg>`;
}
// Two bars: what it was bought at, what it's at now. The simplest possible graph.
function twoBar(bought, now, { boughtLabel = "Bought at", nowLabel = "Now", boughtSub = "", nowSub = "", digits = 2 } = {}) {
  const max = Math.max(bought, now, 1e-9);
  const hB = Math.max(4, Math.round((bought / max) * 100));
  const hN = Math.max(4, Math.round((now / max) * 100));
  const up = now >= bought;
  return `<div class="twobar">
    <div class="col"><p class="val tnum">${money(bought, digits)}</p><div class="bar-v"><i style="height:${hB}%;background:#3A3A4E"></i></div><p class="lbl">${esc(boughtLabel)}</p>${boughtSub ? `<p class="sub">${esc(boughtSub)}</p>` : ""}</div>
    <div class="col"><p class="val tnum" style="color:${up ? "var(--gain)" : "var(--loss)"}">${money(now, digits)}</p><div class="bar-v"><i style="height:${hN}%;background:${up ? "var(--gain)" : "var(--loss)"}"></i></div><p class="lbl">${esc(nowLabel)}</p>${nowSub ? `<p class="sub">${esc(nowSub)}</p>` : ""}</div>
  </div>`;
}
function ring(score, size = 62, stroke = 6, fontSize = 20, label = "") {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const col = score >= 70 ? "var(--gain)" : score >= 45 ? "var(--accent)" : "var(--loss)";
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#26263A" stroke-width="${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - score / 100)).toFixed(1)}"/>
    </svg>
    <span class="num" style="font-size:${fontSize}px">${score}</span>${label ? `<span class="lbl" style="--lbl-off:${Math.round(fontSize * 0.62)}px">${label}</span>` : ""}
  </div>`;
}

// ---------- state ----------
const state = { screen: "home", range: "ALL", sym: null, stockRange: "ALL" };
// deep link: ?screen=stock&sym=NVDA&range=1Y&fit=1 (fit = bare 390x844 for screenshots)
{
  const q = new URLSearchParams(location.search);
  if (q.get("screen")) state.screen = q.get("screen");
  if (q.get("sym")) state.sym = q.get("sym");
  if (q.get("range")) { state.range = q.get("range"); state.stockRange = q.get("range"); }
  if (q.has("fit")) document.body.classList.add("fit");
}
function go(screen, extra = {}) { Object.assign(state, { screen }, extra); render(); $("#screen").scrollTop = 0; }

// ---------- screens ----------
function holdingRow(h) {
  const last = lastPrice(h), r = last / h.buyPrice - 1;
  const sc = scoreParts(h).score;
  return `<button class="row" data-go="stock" data-sym="${h.sym}">
    <div class="tile" style="background:${h.color}">${esc(h.sym.slice(0, 4))}</div>
    <div><p class="name">${esc(h.name)}</p><p class="meta">${h.buyLabel} at ${money(h.buyPrice)}</p></div>
    <div class="rowscore" title="Score">${ring(sc, 38, 4, 13)}</div>
    <div class="right"><p class="price tnum">${money(last)}</p><p class="putin tnum">Put in ${money(h.invested, 0)}</p><span class="pill ${r >= 0 ? "up" : "down"} tnum">${pct(r, 0)}</span></div>
  </button>`;
}

function homeScreen() {
  const t = portfolioTotals();
  const series = portfolioSeries(state.range);
  const first = series[0][1], lastV = series[series.length - 1][1];
  const rr = lastV / first - 1;
  const rangeLabel = { "1M": "past month", "6M": "past 6 months", "1Y": "past year", ALL: "since first buy" }[state.range];
  return `
  <div class="topbar"><p class="eyebrow" style="margin:0">Nick's portfolio</p><span class="chip-date">As of ${fmtDate(AS_OF)}</span></div>
  <p class="big tnum">${money(t.value)}</p>
  <div class="delta ${rr >= 0 ? "up" : "down"}">${rr >= 0 ? ICON.up : ICON.down}<span class="tnum">${money(lastV - first)} (${pct(rr)})</span><span class="sub">${rangeLabel}</span></div>
  <div class="card tight">
    <div class="chart">${lineChart(series)}</div>
    <div class="ranges">${["1M", "6M", "1Y", "ALL"].map((r) => `<button data-range="${r}" class="${state.range === r ? "on" : ""}">${r}</button>`).join("")}</div>
  </div>
  <div class="card">
    <div class="section" style="margin:0 0 6px"><h2 style="font-size:15px">Bought at vs now</h2><span class="pill ${t.ret >= 0 ? "up" : "down"} tnum" style="margin:0">${(t.value / t.invested).toFixed(1)}x</span></div>
    ${twoBar(t.invested, t.value, { boughtLabel: "Put in", nowLabel: "Worth now", digits: 0 })}
  </div>
  <div class="section"><h2>Holdings</h2><span>score · price</span></div>
  ${HOLDINGS.map(holdingRow).join("")}`;
}

function stockScreen() {
  const h = HOLDINGS.find((x) => x.sym === state.sym) || HOLDINGS[0];
  const last = lastPrice(h), r = last / h.buyPrice - 1;
  const s = seriesFor(h, state.stockRange);
  const rr = s[s.length - 1][1] / s[0][1] - 1;
  const sp = scoreParts(h);
  const rangeLabel = { "1M": "1 month", "6M": "6 months", "1Y": "1 year", ALL: "since you bought" }[state.stockRange];
  return `
  <div class="topbar"><button class="iconbtn" data-go="home" aria-label="Back">${ICON.back}</button><span class="chip-date">${esc(h.sym)}</span></div>
  <h1 class="h1">${esc(h.name)}</h1>
  <p class="big tnum" style="margin-top:6px">${money(last)}</p>
  <div class="delta ${rr >= 0 ? "up" : "down"}">${rr >= 0 ? ICON.up : ICON.down}<span class="tnum">${pct(rr)}</span><span class="sub">${rangeLabel}</span></div>
  <div class="card tight">
    <div class="chart">${lineChart(s, { color: rr >= 0 ? "#47C784" : "#F0645A" })}</div>
    <div class="ranges">${["1M", "6M", "1Y", "ALL"].map((x) => `<button data-srange="${x}" class="${state.stockRange === x ? "on" : ""}">${x}</button>`).join("")}</div>
  </div>
  <div class="card">
    <div class="section" style="margin:0 0 6px"><h2 style="font-size:15px">Bought at vs now</h2><span class="pill ${r >= 0 ? "up" : "down"} tnum" style="margin:0">${pct(r, 0)}</span></div>
    ${twoBar(h.buyPrice, last, { boughtLabel: "Bought at", nowLabel: "Now", boughtSub: fmtDate(h.buyDate), nowSub: fmtDate(AS_OF) })}
  </div>
  <div class="card" style="display:flex;gap:16px;align-items:center">
    ${ring(sp.score, 72, 7, 22)}
    <div style="flex:1">
      <p class="card-title">Stock score</p>
      <div class="kv"><span>Past 6 months (x2)</span><b class="tnum">${pct(sp.r6)}</b></div>
      <div class="kv"><span>Yearly since buy</span><b class="tnum">${pct(sp.cagr)}</b></div>
    </div>
  </div>
  <div class="card"><p class="card-title">Your position</p>
    <div class="kv"><span>Invested</span><b class="tnum">${money(h.invested, 0)}</b></div>
    <div class="kv"><span>Worth now</span><b class="tnum">${money(h.invested * (last / h.buyPrice))}</b></div>
    <div class="kv"><span>Multiple</span><b class="tnum">${(last / h.buyPrice).toFixed(1)}x</b></div>
  </div>
  ${h.note ? `<p class="note"><b>Note:</b> ${esc(h.note)}</p>` : ""}`;
}

function addScreen() {
  return `
  <div class="topbar"><button class="iconbtn" data-go="home" aria-label="Back">${ICON.back}</button></div>
  <h1 class="h1">Add new stock</h1>
  <p class="hint" style="margin-top:8px">Enter what you bought and when. Prices fill in from market history.</p>
  <form id="addForm">
    <div class="field"><label for="f-sym">Ticker</label><input id="f-sym" placeholder="TSLA" autocapitalize="characters" required></div>
    <div class="field"><label for="f-name">Company</label><input id="f-name" placeholder="Tesla"></div>
    <div class="field"><label for="f-date">Bought on</label><input id="f-date" type="date" required></div>
    <div class="field"><label for="f-price">Bought at (per share)</label><input id="f-price" type="number" step="0.01" inputmode="decimal" placeholder="248.50"></div>
    <div class="field"><label for="f-amt">Amount invested</label><input id="f-amt" type="number" step="1" inputmode="numeric" placeholder="1000" value="1000"></div>
    <p class="hint">Leave "bought at" blank and it uses the closing price on that date.</p>
    <button class="btn" type="submit">Add to portfolio</button>
  </form>`;
}

const PODCASTS = [
  { t: "SpaceX at $151: three months after the IPO", d: "2026-09-08", len: "7:12", tags: ["SPCX"] },
  { t: "Apple crosses $330. Is the iPhone cycle done?", d: "2026-08-30", len: "6:48", tags: ["AAPL"] },
  { t: "Nvidia pulls back 9% from the high. What changed", d: "2026-08-19", len: "8:03", tags: ["NVDA"] },
  { t: "Portfolio check-in: 4 holdings, $4k in, where it stands", d: "2026-08-04", len: "9:31", tags: ["NVDA", "SPCX", "SPX", "AAPL"] },
  { t: "S&P 500 at 7,600. What the index did since 2018", d: "2026-07-21", len: "5:56", tags: ["SPX"] },
  { t: "Why the 6-month window gets double weight", d: "2026-07-06", len: "4:40", tags: [] },
];
function podcastsScreen() {
  return `
  <div class="topbar"><button class="iconbtn" data-go="home" aria-label="Back">${ICON.back}</button><span class="chip-date">${PODCASTS.length} episodes</span></div>
  <h1 class="h1">Podcasts</h1>
  <p class="hint" style="margin-top:8px">A short episode about your holdings, made from the latest prices and news.</p>
  <button class="cta" data-make-podcast>Make me a podcast ${ICON.arrow}</button>
  <div class="section"><h2>Past podcasts</h2></div>
  ${PODCASTS.map((p) => `<button class="ep"><span class="play" aria-hidden="true">${ICON.play}</span>
    <div><p class="t">${esc(p.t)}</p><p class="m">${fmtDate(p.d)} · ${p.len}</p>${p.tags.length ? `<div class="tags">${p.tags.map((x) => `<span>${x}</span>`).join("")}</div>` : ""}</div></button>`).join("")}`;
}

function scoreScreen() {
  const ps = portfolioScore();
  const rows = HOLDINGS.map((h) => ({ h, ...scoreParts(h) })).sort((a, b) => b.score - a.score);
  return `
  <div class="topbar"><button class="iconbtn" data-go="home" aria-label="Back">${ICON.back}</button><span class="chip-date">As of ${fmtDate(AS_OF)}</span></div>
  <h1 class="h1">Scores</h1>
  <p class="hint" style="margin-top:8px">One score per company, 0 to 100. The <b>past 6 months counts twice</b>, the yearly return since you bought counts once. 50 is flat.</p>
  ${rows.map(({ h, score, r6, cagr: c }) => `<button class="row" data-go="stock" data-sym="${h.sym}" style="display:block;padding:14px">
    <div style="display:flex;align-items:center;gap:12px">
      ${ring(score, 56, 6, 18)}
      <div style="flex:1"><p class="name" style="font-size:16px">${esc(h.name)}</p><p class="meta">6 mo ${pct(r6, 0)} · yearly since buy ${pct(c, 0)}</p></div>
      <div class="tile" style="background:${h.color};width:34px;height:34px;font-size:11px">${esc(h.sym.slice(0, 4))}</div>
    </div>
    <div class="bar"><i style="width:${score}%"></i></div>
  </button>`).join("")}
  <div class="card" style="display:flex;align-items:center;gap:14px;margin-top:20px">${ring(ps, 56, 6, 18)}<div><p class="card-title" style="margin:0">Portfolio average</p><p class="hint" style="margin:2px 0 0">Mean of the ${rows.length} company scores above.</p></div></div>`;
}

function tabbar() {
  const s = state.screen;
  return `
  <button class="tab ${s === "add" ? "on" : ""}" data-go="add">${ICON.plus}<span>Add new stock</span></button>
  <button class="tab score" data-go="score" aria-label="Portfolio score">${ring(portfolioScore())}<span>Score</span></button>
  <button class="tab ${s === "podcasts" ? "on" : ""}" data-go="podcasts">${ICON.mic}<span>Past podcasts</span></button>`;
}

// ---------- render + events ----------
const SCREENS = { home: homeScreen, stock: stockScreen, add: addScreen, podcasts: podcastsScreen, score: scoreScreen };
function render() {
  $("#screen").innerHTML = SCREENS[state.screen]();
  $("#tabbar").innerHTML = tabbar();
}
function toast(msg) {
  let t = $(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; $("#phone").appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2200);
}
document.addEventListener("click", (e) => {
  const go_ = e.target.closest("[data-go]");
  if (go_) { go(go_.dataset.go, go_.dataset.sym ? { sym: go_.dataset.sym } : {}); return; }
  const r = e.target.closest("[data-range]"); if (r) { state.range = r.dataset.range; render(); return; }
  const sr = e.target.closest("[data-srange]"); if (sr) { state.stockRange = sr.dataset.srange; render(); return; }
  if (e.target.closest("[data-make-podcast]")) { toast("Making your podcast. About 2 minutes."); return; }
  if (e.target.closest(".ep")) { toast("Playing episode"); }
});
document.addEventListener("submit", (e) => {
  if (e.target.id !== "addForm") return;
  e.preventDefault();
  const sym = $("#f-sym").value.trim().toUpperCase();
  if (!sym) return;
  toast(sym + " added. Prices sync on next refresh.");
  go("home");
});
render();

// ---------- Canva export: every screen as a static page ----------
window.exportCanva = function () {
  const css = [...document.styleSheets].map((s) => { try { return [...s.cssRules].map((r) => r.cssText).join("\n"); } catch (_) { return ""; } }).join("\n");
  const saved = { ...state };
  const pages = [
    ["Home", { screen: "home", range: "ALL" }],
    ["Stock detail", { screen: "stock", sym: "NVDA", stockRange: "ALL" }],
    ["Portfolio score", { screen: "score" }],
    ["Add new stock", { screen: "add" }],
    ["Past podcasts", { screen: "podcasts" }],
  ];
  const out = pages.map(([label, st]) => {
    Object.assign(state, st);
    return `<div data-document-role="page" data-label="${label}" style="position:relative;width:390px;height:844px;overflow:hidden;background:#0B0B10;color:#F2F2F7;font-family:-apple-system,'SF Pro Text','Helvetica Neue',Helvetica,Arial,sans-serif">
      <main class="screen" style="position:absolute;inset:0;overflow:hidden">${SCREENS[state.screen]()}</main>
      <nav class="tabbar">${tabbar()}</nav>
    </div>`;
  }).join("\n");
  Object.assign(state, saved); render();
  return `<!doctype html><html><head><meta charset="utf-8"><title>Nick's Portfolio UI</title><style>${css}\n.stage,.phone{all:unset}</style></head><body style="margin:0;background:#050508">${out}</body></html>`;
};
