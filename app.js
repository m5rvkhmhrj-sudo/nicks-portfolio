/* Nick's Portfolio - single-file app.
   Screens: home, stock, add, reports, report, score
   Everything shown is computed from past prices + published analyst data. No predictions of our own. */

// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
const money = (n, d = 2) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (r, d = 1) => (r >= 0 ? "+" : "") + (r * 100).toFixed(d) + "%";
const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtMon = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
const daysBetween = (a, b) => (new Date(b) - new Date(a)) / 86400000;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
};

const ICON = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
  report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8z"/></svg>',
  up: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 6l6 8H6z"/></svg>',
  down: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 18l-6-8h12z"/></svg>',
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
};

// ---------- lots (supports buying the same stock at different times) ----------
const userLots = store.get("npf_lots", {});      // { SYM: [{date, price, amount}] }
const pending = store.get("npf_pending", []);    // tickers added without price history yet
function lotsOf(h) { return [...h.lots, ...(userLots[h.sym] || [])].sort((a, b) => a.date.localeCompare(b.date)); }
function sharesOf(h) { return lotsOf(h).reduce((a, l) => a + l.amount / l.price, 0); }
function investedOf(h) { return lotsOf(h).reduce((a, l) => a + l.amount, 0); }
function avgCost(h) { return investedOf(h) / sharesOf(h); }
function firstBuy(h) { return lotsOf(h)[0].date; }
function valueOf(h) { return sharesOf(h) * lastPrice(h); }

// ---------- price math ----------
function lastPrice(h) { return h.weekly[h.weekly.length - 1][1]; }
function priceOnOrBefore(series, iso) {
  let v = null;
  for (const [d, p] of series) { if (d <= iso) v = p; else break; }
  return v;
}
function seriesFor(h, range) {
  const end = h.daily.length ? h.daily[h.daily.length - 1][0] : h.weekly[h.weekly.length - 1][0];
  const back = { "1M": 31, "6M": 183, "1Y": 366 }[range];
  if (!back) return h.weekly.filter(([d]) => d >= firstBuy(h));
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
  if (base == null) base = src[0][1];
  return last[1] / base - 1;
}
function retDays(h, days) {
  const s = h.daily.length ? h.daily : h.weekly;
  const last = s[s.length - 1];
  const target = new Date(new Date(last[0]).getTime() - days * 86400000).toISOString().slice(0, 10);
  const base = priceOnOrBefore(s, target) ?? s[0][1];
  return last[1] / base - 1;
}
function yearsHeld(h) { return Math.max(daysBetween(firstBuy(h), AS_OF) / 365.25, 0.25); }
function cagr(h) { return Math.pow(lastPrice(h) / avgCost(h), 1 / yearsHeld(h)) - 1; }
// Yearly volatility from daily log returns (falls back to weekly). Used for the exit range and the "swing" tag.
function annVol(h) {
  const useDaily = h.daily.length > 60;
  const s = useDaily ? h.daily : h.weekly;
  const rets = [];
  for (let i = 1; i < s.length; i++) rets.push(Math.log(s[i][1] / s[i - 1][1]));
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, r) => a + (r - m) ** 2, 0) / (rets.length - 1));
  return clamp(sd * Math.sqrt(useDaily ? 252 : 52), 0.08, 0.6);
}
// Exit range for the next 12 months, from how much this stock has swung in the past year.
// One standard deviation band. "Fair" = a solid step above today. "Optimal" = the upper part of the band.
function exitRange(h) {
  const p = lastPrice(h), v = annVol(h);
  return { low: p * Math.exp(-v), high: p * Math.exp(v), fairLo: p * Math.exp(0.2 * v), fairHi: p * Math.exp(0.5 * v), optimal: p * Math.exp(0.5 * v), vol: v, now: p };
}
// Score 0-100. Recent 6 months counts twice, since-purchase counts once.
function scoreParts(h) {
  const r6 = ret6m(h), c = cagr(h);
  const recent = 50 + 50 * Math.tanh(r6 / 0.20);
  const since = 50 + 50 * Math.tanh(c / 0.35);
  return { r6, cagr: c, recent, since, score: Math.round((since + 2 * recent) / 3) };
}
function tierOf(score) { return score >= 85 ? "Top" : score >= 70 ? "Solid" : score >= 50 ? "Watch" : "Weak"; }
function portfolioScore() {
  const s = HOLDINGS.map((h) => scoreParts(h).score);
  return Math.round(s.reduce((a, b) => a + b, 0) / s.length);
}
function portfolioSeries(range) {
  const per = HOLDINGS.map((h) => ({ h, s: seriesFor(h, range), lots: lotsOf(h) }));
  const dates = [...new Set(per.flatMap((p) => p.s.map((x) => x[0])))].sort();
  return dates.map((d) => {
    let v = 0;
    for (const { h, s, lots } of per) {
      const sh = lots.filter((l) => l.date <= d).reduce((a, l) => a + l.amount / l.price, 0);
      if (!sh) continue;
      let p = priceOnOrBefore(s, d);
      if (p == null) p = priceOnOrBefore(h.weekly, d);
      if (p != null) v += sh * p;
    }
    return [d, v];
  });
}
function portfolioTotals() {
  const invested = HOLDINGS.reduce((a, h) => a + investedOf(h), 0);
  const value = HOLDINGS.reduce((a, h) => a + valueOf(h), 0);
  return { invested, value, gain: value - invested, ret: value / invested - 1 };
}
// What kind of stock this is, in plain words.
function stockTags(h) {
  const tags = [];
  const v = annVol(h), a = h.analysts || {};
  if (h.index) tags.push("Index fund");
  else if ((a.fwdPE && a.fwdPE > 25) || cagr(h) > 0.3) tags.push("Growth");
  else tags.push("Steady");
  tags.push(v > 0.45 ? "High swing" : v > 0.25 ? "Medium swing" : "Low swing");
  tags.push(yearsHeld(h) >= 2 ? "Long-term hold" : "Newer position");
  if (a.beta && a.beta > 1.5) tags.push(`Moves ${a.beta.toFixed(1)}x the market`);
  return tags;
}
const REC = { strong_buy: "Strong buy", buy: "Buy", hold: "Hold", underperform: "Underperform", sell: "Sell" };

// ---------- charts ----------
// markers: [{ x: 0..1, y: price, label, color }]
function lineChart(points, { color = "var(--accent)", w = 358, h = 150, baseline = true, costLine = null, markers = [] } = {}) {
  if (points.length < 2) return "";
  const ys = points.map((p) => p[1]);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (costLine != null && costLine > min * 0.7 && costLine < max * 1.3) { min = Math.min(min, costLine); max = Math.max(max, costLine); }
  const span = max - min || 1;
  const pad = 8;
  const X = (i) => (i / (points.length - 1)) * w;
  const Y = (v) => pad + (1 - (v - min) / span) * (h - pad * 2);
  const d = points.map((p, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p[1]).toFixed(1)).join(" ");
  const area = d + ` L${w} ${h} L0 ${h} Z`;
  const last = points[points.length - 1];
  const y0 = Y(points[0][1]);
  const id = "g" + Math.random().toString(36).slice(2, 7);
  const costY = costLine != null && costLine >= min && costLine <= max ? Y(costLine) : null;
  const mk = markers.map((m) => {
    const cx = m.x * w, cy = Y(m.y);
    const anchor = m.x > 0.7 ? "end" : "start", dx = m.x > 0.7 ? -8 : 8;
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5" fill="${m.color}" stroke="#0B0B10" stroke-width="2"/>
      <text x="${(cx + dx).toFixed(1)}" y="${(cy - 9).toFixed(1)}" text-anchor="${anchor}" font-size="11" font-weight="600" fill="${m.color}">${esc(m.label)}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#${id})"/>
    ${baseline && costY == null ? `<line x1="0" x2="${w}" y1="${y0.toFixed(1)}" y2="${y0.toFixed(1)}" stroke="#3A3A4E" stroke-dasharray="3 5" stroke-width="1"/>` : ""}
    ${costY != null ? `<line x1="0" x2="${w}" y1="${costY.toFixed(1)}" y2="${costY.toFixed(1)}" stroke="var(--muted)" stroke-dasharray="3 5" stroke-width="1"/><text x="${w - 4}" y="${(costY - 5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--muted)">your cost ${money(costLine)}</text>` : ""}
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${w}" cy="${Y(last[1]).toFixed(1)}" r="4" fill="${color}"/>
    ${mk}
  </svg>`;
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
// Horizontal scale: low ... [fair] [optimal] ... high, with a "now" marker.
function exitBar(e) {
  const P = (v) => clamp((Math.log(v / e.low) / Math.log(e.high / e.low)) * 100, 0, 100);
  return `<div class="exitbar">
    <div class="track">
      <i class="fair" style="left:${P(e.fairLo)}%;width:${P(e.fairHi) - P(e.fairLo)}%"></i>
      <i class="opt" style="left:${P(e.optimal)}%;width:${100 - P(e.optimal)}%"></i>
      <b class="now" style="left:${P(e.now)}%"><span>now ${money(e.now, 0)}</span></b>
    </div>
    <div class="ends tnum"><span>${money(e.low, 0)}</span><span>${money(e.high, 0)}</span></div>
  </div>`;
}
// Analyst target range with mean + now markers
function targetBar(a, now) {
  const lo = Math.min(a.low, now) * 0.95, hi = Math.max(a.high, now) * 1.05;
  const P = (v) => clamp(((v - lo) / (hi - lo)) * 100, 0, 100);
  return `<div class="exitbar">
    <div class="track">
      <i class="fair" style="left:${P(a.low)}%;width:${P(a.high) - P(a.low)}%"></i>
      <b class="mean" style="left:${P(a.mean)}%"><span>avg ${money(a.mean, 0)}</span></b>
      <b class="now" style="left:${P(now)}%"><span>now ${money(now, 0)}</span></b>
    </div>
    <div class="ends tnum"><span>low ${money(a.low, 0)}</span><span>high ${money(a.high, 0)}</span></div>
  </div>`;
}

// ---------- reports (auto-generated from the numbers; podcast narration per report) ----------
function reportsFor() {
  const out = [];
  for (const h of HOLDINGS) {
    const m1 = retDays(h, 31), m6 = ret6m(h), a = h.analysts || {}, p = lastPrice(h);
    const reasons = [];
    if (Math.abs(m1) >= 0.10) reasons.push(`${m1 >= 0 ? "Up" : "Down"} ${pct(Math.abs(m1), 0).slice(1)} in the past month`);
    if (a.wkHigh && p >= a.wkHigh * 0.97) reasons.push("Within 3% of its 52-week high");
    if (a.wkLow && p <= a.wkLow * 1.03) reasons.push("Within 3% of its 52-week low");
    if (a.mean && Math.abs(a.mean / p - 1) >= 0.40) reasons.push(`Analyst average target is ${pct(a.mean / p - 1, 0)} from today's price`);
    if (h.estUntil && daysBetween(h.estUntil, AS_OF) < 120) reasons.push("Recently listed, first months of public trading");
    const fresh = reasons.length > 0;
    out.push({ id: h.sym, h, fresh, reasons, date: AS_OF, len: fresh ? `${5 + reasons.length}:${String((reasons.length * 17) % 60).padStart(2, "0")}` : "4:10", m1, m6 });
  }
  return out.sort((x, y) => (y.fresh - x.fresh) || (Math.abs(y.m1) - Math.abs(x.m1)));
}

// ---------- state ----------
const state = { screen: "home", range: "ALL", sym: null, stockRange: "ALL", report: null, showScoreHelp: false };
const THEMES = ["violet", "mint", "sky", "amber"];
state.theme = store.get("npf_theme", "violet");
{
  const q = new URLSearchParams(location.search);
  if (q.get("screen")) state.screen = q.get("screen");
  if (q.get("sym")) { state.sym = q.get("sym"); state.report = q.get("sym"); }
  if (q.get("range")) { state.range = q.get("range"); state.stockRange = q.get("range"); }
  if (q.get("theme")) state.theme = q.get("theme");
  if (q.has("fit")) document.body.classList.add("fit");
}
function applyTheme() { document.documentElement.dataset.theme = state.theme; }
function go(screen, extra = {}) { Object.assign(state, { screen }, extra); render(); $("#screen").scrollTop = 0; }
function findH(sym) { return HOLDINGS.find((x) => x.sym === sym) || HOLDINGS[0]; }

// ---------- screens ----------
function holdingRow(h) {
  const last = lastPrice(h), cost = avgCost(h), r = last / cost - 1, n = lotsOf(h).length;
  const sc = scoreParts(h).score;
  return `<button class="row" data-go="stock" data-sym="${h.sym}">
    <div class="tile" style="background:${h.color}">${esc(h.sym.slice(0, 4))}</div>
    <div><p class="name">${esc(h.name)}</p><p class="meta">${n > 1 ? `${n} lots · avg ${money(cost)}` : `${fmtMon(firstBuy(h))} at ${money(cost)}`}</p></div>
    <div class="rowscore" title="Score">${ring(sc, 38, 4, 13)}</div>
    <div class="right"><p class="price tnum">${money(last)}</p><p class="putin tnum">Put in ${money(investedOf(h), 0)}</p><span class="pill ${r >= 0 ? "up" : "down"} tnum">${pct(r, 0)}</span></div>
  </button>`;
}
function pendingRow(p) {
  return `<div class="row" style="opacity:.7">
    <div class="tile" style="background:var(--line);color:var(--text)">${esc(p.sym.slice(0, 4))}</div>
    <div><p class="name">${esc(p.name || p.sym)}</p><p class="meta">${fmtMon(p.lots[0].date)} at ${money(p.lots[0].price)}</p></div>
    <div class="right"><p class="price" style="color:var(--muted);font-size:12px">Price history syncing</p><p class="putin tnum">Put in ${money(p.lots.reduce((a, l) => a + l.amount, 0), 0)}</p></div>
  </div>`;
}

function homeScreen() {
  const t = portfolioTotals();
  const series = portfolioSeries(state.range);
  const first = series[0][1], lastV = series[series.length - 1][1];
  const rr = lastV / first - 1;
  const rangeLabel = { "1M": "past month", "6M": "past 6 months", "1Y": "past year", ALL: "since first buy" }[state.range];
  return `
  <div class="topbar"><p class="eyebrow" style="margin:0">Nick's portfolio</p>
    <div style="display:flex;gap:8px;align-items:center"><span class="chip-date">As of ${fmtDate(AS_OF)}</span><button class="iconbtn" data-theme-next aria-label="Try another color scheme">${ICON.palette}</button></div></div>
  <p class="big tnum">${money(t.value)}</p>
  <div class="delta ${rr >= 0 ? "up" : "down"}">${rr >= 0 ? ICON.up : ICON.down}<span class="tnum">${money(lastV - first)} (${pct(rr)})</span><span class="sub">${rangeLabel}</span></div>
  <div class="card tight">
    <div class="chart">${lineChart(series)}</div>
    <div class="ranges">${["1M", "6M", "1Y", "ALL"].map((r) => `<button data-range="${r}" class="${state.range === r ? "on" : ""}">${r}</button>`).join("")}</div>
  </div>
  <div class="stats">
    <div><p class="card-title">Put in</p><p class="card-value tnum">${money(t.invested, 0)}</p></div>
    <div><p class="card-title">Worth now</p><p class="card-value tnum" style="color:var(--gain)">${money(t.value, 0)}</p></div>
    <div><p class="card-title">Multiple</p><p class="card-value tnum">${(t.value / t.invested).toFixed(1)}x</p></div>
  </div>
  <div class="section"><h2>Holdings</h2><span>score · price · put in</span></div>
  ${HOLDINGS.map(holdingRow).join("")}
  ${pending.map(pendingRow).join("")}`;
}

function stockScreen() {
  const h = findH(state.sym);
  const last = lastPrice(h), cost = avgCost(h), r = last / cost - 1;
  const s = seriesFor(h, state.stockRange);
  const rr = s[s.length - 1][1] / s[0][1] - 1;
  const sp = scoreParts(h), lots = lotsOf(h), e = exitRange(h), a = h.analysts || {};
  const rangeLabel = { "1M": "1 month", "6M": "6 months", "1Y": "1 year", ALL: "since you bought" }[state.stockRange];
  const lineColor = rr >= 0 ? "var(--gain)" : "var(--loss)";
  // Markers: each lot that falls inside the visible range, plus "now"
  const t0 = new Date(s[0][0]).getTime(), t1 = new Date(s[s.length - 1][0]).getTime();
  const markers = lots.filter((l) => l.date >= s[0][0]).map((l, i) => ({ x: (new Date(l.date).getTime() - t0) / (t1 - t0 || 1), y: l.price, label: `${lots.length > 1 ? "Lot " + (i + 1) + " " : "Bought "}${money(l.price)}`, color: "var(--accent)" }));
  markers.push({ x: 1, y: last, label: `Now ${money(last)}`, color: lineColor });
  const val = valueOf(h), c = sp.cagr;
  const proj = [1, 2, 3].map((n) => ({ n, v: val * Math.pow(1 + c, n), p: last * Math.pow(1 + c, n) }));
  return `
  <div class="topbar"><button class="iconbtn" data-go="home" aria-label="Back">${ICON.back}</button><span class="chip-date">${esc(h.sym)}${a.sector ? " · " + esc(a.sector) : ""}</span></div>
  <h1 class="h1">${esc(h.name)}</h1>
  <div class="chips">${stockTags(h).map((t) => `<span>${esc(t)}</span>`).join("")}</div>
  <p class="big tnum" style="margin-top:10px">${money(last)}</p>
  <div class="delta ${rr >= 0 ? "up" : "down"}">${rr >= 0 ? ICON.up : ICON.down}<span class="tnum">${pct(rr)}</span><span class="sub">${rangeLabel}</span></div>
  <div class="card tight">
    <p class="card-title" style="margin:0 0 2px">Where you got in vs where it is now</p>
    <div class="chart" style="height:170px">${lineChart(s, { color: lineColor, costLine: state.stockRange === "ALL" ? null : cost, markers })}</div>
    <div class="ranges">${["1M", "6M", "1Y", "ALL"].map((x) => `<button data-srange="${x}" class="${state.stockRange === x ? "on" : ""}">${x}</button>`).join("")}</div>
  </div>

  <div class="card" style="display:flex;gap:16px;align-items:center">
    ${ring(sp.score, 72, 7, 22)}
    <div style="flex:1">
      <div style="display:flex;justify-content:space-between;align-items:center"><p class="card-title" style="margin:0">Score · ${tierOf(sp.score)}</p><button class="linkbtn" data-go="score">How it works</button></div>
      <div class="kv"><span>Past 6 months (counts 2x)</span><b class="tnum">${pct(sp.r6)}</b></div>
      <div class="kv"><span>Yearly since you bought</span><b class="tnum">${pct(sp.cagr)}</b></div>
    </div>
  </div>

  <div class="card">
    <div class="section" style="margin:0 0 4px"><h2 style="font-size:15px">Your lots</h2><button class="linkbtn" data-go="add" data-sym="${h.sym}">+ Add a lot</button></div>
    ${lots.map((l, i) => `<div class="lot"><div><b>${fmtDate(l.date)}</b><span>${money(l.amount, 0)} at ${money(l.price)}</span></div><div class="right"><b class="tnum">${money((l.amount / l.price) * last, 0)}</b><span class="${last >= l.price ? "up" : "down"} tnum">${pct(last / l.price - 1, 0)}</span></div></div>`).join("")}
    <div class="kv" style="border-top:1px solid var(--line);padding-top:10px"><span>${lots.length > 1 ? "Average cost" : "Cost"} · ${sharesOf(h).toFixed(2)} shares</span><b class="tnum">${money(cost)}</b></div>
    <div class="kv"><span>Put in → worth now</span><b class="tnum">${money(investedOf(h), 0)} → ${money(val, 0)} <span class="${r >= 0 ? "up" : "down"}">(${pct(r, 0)})</span></b></div>
  </div>

  <div class="card">
    <div class="section" style="margin:0 0 4px"><h2 style="font-size:15px">Exit range, next 12 months</h2><span>${Math.round(e.vol * 100)}% yearly swing</span></div>
    <p class="hint" style="margin:0 0 10px">Based on how far ${esc(h.name)} moved in the past year, one standard deviation each way. Not a prediction.</p>
    ${exitBar(e)}
    <div class="legend-row"><span><i class="sw fair"></i>Fair exit ${money(e.fairLo, 0)} to ${money(e.fairHi, 0)}</span><span><i class="sw opt"></i>Optimal ${money(e.optimal, 0)}+</span></div>
  </div>

  ${a.mean ? `<div class="card">
    <div class="section" style="margin:0 0 4px"><h2 style="font-size:15px">What the experts say</h2><span>${a.n} analysts</span></div>
    <p class="hint" style="margin:0 0 10px">Published 12-month price targets from Wall Street analysts (via Yahoo Finance). Their view, not ours. Consensus: <b style="color:var(--text)">${REC[a.rec] || "n/a"}</b>.</p>
    ${targetBar(a, last)}
    <div class="kv"><span>Average target vs today</span><b class="tnum ${a.mean >= last ? "up" : "down"}">${pct(a.mean / last - 1, 0)}</b></div>
  </div>` : `<div class="card"><p class="card-title">What the experts say</p><p class="hint" style="margin:4px 0 0">Analysts publish targets for companies, not for the index itself. Track a fund like SPY or VOO to see fund-level notes.</p></div>`}

  <div class="card">
    <div class="section" style="margin:0 0 4px"><h2 style="font-size:15px">If it keeps this pace</h2><span>${pct(c, 0)} a year</span></div>
    <p class="hint" style="margin:0 0 8px">Your ${money(val, 0)} at the same yearly pace it has had since you bought. Past pace only.</p>
    <div class="stats" style="margin-top:0">${proj.map((x) => `<div><p class="card-title">${x.n} yr${x.n > 1 ? "s" : ""}</p><p class="card-value tnum">${money(x.v, 0)}</p><p class="hint" style="margin:2px 0 0">${money(x.p, 0)}/sh</p></div>`).join("")}</div>
  </div>

  <button class="btn ghost" data-go="report" data-sym="${h.sym}">Open ${esc(h.name)} report</button>
  ${h.note ? `<p class="note"><b>Note:</b> ${esc(h.note)}</p>` : ""}
  <p class="note">Ranges, pace and expert targets use past prices and published analyst data. Nothing here is a recommendation to buy, sell or hold.</p>`;
}

function addScreen() {
  const existing = state.sym ? findH(state.sym) : null;
  const pre = existing && state.sym === existing.sym ? existing : null;
  return `
  <div class="topbar"><button class="iconbtn" data-go="${pre ? "stock" : "home"}" ${pre ? `data-sym="${pre.sym}"` : ""} aria-label="Back">${ICON.back}</button></div>
  <h1 class="h1">${pre ? `Add a lot of ${esc(pre.name)}` : "Add new stock"}</h1>
  <p class="hint" style="margin-top:8px">${pre ? "Bought more at a different time or price? Add it here. Your average cost updates." : "Enter what you bought and when. Bought the same stock twice? Add it twice, each as its own lot."}</p>
  <form id="addForm">
    <div class="field"><label for="f-sym">Ticker</label><input id="f-sym" placeholder="TSLA" autocapitalize="characters" value="${pre ? pre.sym : ""}" ${pre ? "readonly" : ""} required></div>
    ${pre ? "" : `<div class="field"><label for="f-name">Company</label><input id="f-name" placeholder="Tesla"></div>`}
    <div class="field"><label for="f-date">Bought on</label><input id="f-date" type="date" max="${AS_OF}" required></div>
    <div class="field"><label for="f-price">Bought at (per share)</label><input id="f-price" type="number" step="0.01" min="0.01" inputmode="decimal" placeholder="248.50" ${pre ? "" : "required"}></div>
    <div class="field"><label for="f-amt">Amount invested</label><input id="f-amt" type="number" step="1" min="1" inputmode="numeric" placeholder="1000" value="1000" required></div>
    ${pre ? `<p class="hint">Leave "bought at" blank and it uses ${esc(pre.name)}'s closing price on that date.</p>` : ""}
    <button class="btn" type="submit">${pre ? "Add lot" : "Add to portfolio"}</button>
  </form>`;
}

function reportsScreen() {
  const reps = reportsFor();
  const fresh = reps.filter((r) => r.fresh), rest = reps.filter((r) => !r.fresh);
  const card = (r) => `<button class="ep" data-go="report" data-sym="${r.h.sym}">
    <div class="tile" style="background:${r.h.color}">${esc(r.h.sym.slice(0, 4))}</div>
    <div style="flex:1;min-width:0"><p class="t">${esc(r.h.name)} report${r.fresh ? ` <span class="new">New</span>` : ""}</p>
      <p class="m">${r.fresh ? esc(r.reasons[0]) : "Quiet month. Numbers refreshed."}</p>
      <p class="m" style="margin-top:2px">${fmtDate(r.date)} · ${r.len} narrated</p></div>
    <span class="play" aria-label="Play narration">${ICON.play}</span>
  </button>`;
  return `
  <div class="topbar"><button class="iconbtn" data-go="home" aria-label="Back">${ICON.back}</button><span class="chip-date">${fresh.length} new this week</span></div>
  <h1 class="h1">Reports</h1>
  <p class="hint" style="margin-top:8px">A report is written for each holding automatically, and narrated as a short podcast. Only stocks with something report-worthy get flagged as new.</p>
  ${fresh.length ? `<div class="section"><h2>Report-worthy</h2><span>${fresh.length} of ${reps.length} holdings</span></div>${fresh.map(card).join("")}` : ""}
  ${rest.length ? `<div class="section"><h2>Nothing new</h2></div>${rest.map(card).join("")}` : ""}`;
}

function reportScreen() {
  const h = findH(state.report || state.sym);
  const r = reportsFor().find((x) => x.h.sym === h.sym);
  const last = lastPrice(h), cost = avgCost(h), e = exitRange(h), a = h.analysts || {}, sp = scoreParts(h);
  const m1 = retDays(h, 31), m6 = sp.r6, y1 = retDays(h, 366);
  const s = seriesFor(h, "1Y");
  const expert = a.mean
    ? `${a.n} analysts publish 12-month targets on ${h.name}. The average is ${money(a.mean, 0)}, the range runs ${money(a.low, 0)} to ${money(a.high, 0)}, and the consensus label is "${REC[a.rec] || "n/a"}". Today's price of ${money(last)} sits ${pct(last / a.mean - 1, 0)} from that average. This is their published view, relayed as-is.`
    : `Analysts publish targets for companies, not for the index itself, so there is no expert target to relay for ${h.name}.`;
  return `
  <div class="topbar"><button class="iconbtn" data-go="reports" aria-label="Back">${ICON.back}</button><span class="chip-date">${fmtDate(r.date)}</span></div>
  <p class="eyebrow">${r.fresh ? "New report" : "Report"}</p>
  <h1 class="h1">${esc(h.name)}</h1>
  <button class="player" data-play><span class="play">${ICON.play}</span><div><b>Listen to this report</b><span>${r.len} · narrated from the numbers below</span></div></button>

  <div class="card"><p class="card-title">What happened</p>
    <p class="body">${esc(h.name)} is at ${money(last)}, ${pct(m1, 1)} over the past month, ${pct(m6, 1)} over 6 months and ${pct(y1, 1)} over the past year.${r.reasons.length ? " Flagged because: " + esc(r.reasons.join(". ")) + "." : " Nothing unusual this month."}</p>
    <div class="chart" style="height:110px;margin-top:8px">${lineChart(s, { color: y1 >= 0 ? "var(--gain)" : "var(--loss)", baseline: true })}</div>
  </div>
  <div class="card"><p class="card-title">Your position</p>
    <p class="body">You put in ${money(investedOf(h), 0)} across ${lotsOf(h).length} lot${lotsOf(h).length > 1 ? "s" : ""} at an average cost of ${money(cost)}. That is worth ${money(valueOf(h), 0)} today, ${pct(last / cost - 1, 0)}. Score ${sp.score} of 100 (${tierOf(sp.score)}).</p>
  </div>
  <div class="card"><p class="card-title">Exit range, next 12 months</p>
    <p class="body">Given a ${Math.round(e.vol * 100)}% yearly swing, one standard deviation puts the next year's range at ${money(e.low, 0)} to ${money(e.high, 0)}. A fair exit reads ${money(e.fairLo, 0)} to ${money(e.fairHi, 0)}, and ${money(e.optimal, 0)} or above is the optimal zone. Statistics from past moves, not a forecast.</p>
    ${exitBar(e)}
  </div>
  <div class="card"><p class="card-title">What the experts say</p><p class="body">${esc(expert)}</p>${a.mean ? targetBar(a, last) : ""}</div>
  <p class="note">Reports are generated from price history and published analyst data. Not investment advice.</p>`;
}

function scoreScreen() {
  const ps = portfolioScore();
  const t = portfolioTotals();
  const rows = HOLDINGS.map((h) => ({ h, ...scoreParts(h), share: valueOf(h) / t.value })).sort((a, b) => b.score - a.score);
  const best = rows[0], worst = rows[rows.length - 1];
  return `
  <div class="topbar"><button class="iconbtn" data-go="home" aria-label="Back">${ICON.back}</button><span class="chip-date">As of ${fmtDate(AS_OF)}</span></div>
  <h1 class="h1">Scores</h1>
  <div class="card" style="display:flex;align-items:center;gap:14px">${ring(ps, 64, 7, 20)}<div><p class="card-title" style="margin:0">Portfolio average</p><p class="hint" style="margin:2px 0 0">Mean of the ${rows.length} company scores. ${tierOf(ps)} tier.</p></div></div>

  <div class="card">
    <div class="section" style="margin:0 0 6px"><h2 style="font-size:15px">How scoring works</h2></div>
    <p class="body">Every company gets a number from 0 to 100. Two things go in. <b>The past 6 months</b>, which counts twice, because what a stock is doing now matters most. <b>The yearly return since you bought</b>, which counts once. 50 means flat. A stock that gained around 20% in 6 months lands near 90. One that lost 20% lands near 10.</p>
    <div class="tiers"><span class="tier top">Top 85+</span><span class="tier solid">Solid 70+</span><span class="tier watch">Watch 50+</span><span class="tier weak">Weak</span></div>
  </div>

  <div class="section"><h2>Ranked</h2><span>best value to worst value</span></div>
  ${rows.map(({ h, score, r6, cagr: c, share }, i) => `<button class="row" data-go="stock" data-sym="${h.sym}" style="display:block;padding:14px">
    <div style="display:flex;align-items:center;gap:12px">
      <span class="rank">${i + 1}</span>
      ${ring(score, 50, 5, 16)}
      <div style="flex:1;min-width:0"><p class="name" style="font-size:16px">${esc(h.name)} <span class="tier ${tierOf(score).toLowerCase()}">${tierOf(score)}</span></p><p class="meta">6 mo ${pct(r6, 0)} · yr ${pct(c, 0)} · ${Math.round(share * 100)}% of holdings</p></div>
    </div>
    <div class="bar"><i style="width:${score}%"></i></div>
  </button>`).join("")}

  <div class="card">
    <p class="card-title">Portfolio clean-up notes</p>
    <p class="body"><b>${esc(best.h.name)}</b> is your best value right now at ${best.score}, and it is ${Math.round(best.share * 100)}% of what you hold. <b>${esc(worst.h.name)}</b> is the lowest at ${worst.score} (${tierOf(worst.score)}) and makes up ${Math.round(worst.share * 100)}%.${worst.score < 70 ? ` Holdings in the Watch or Weak tier are the ones to look at first when you re-balance.` : ` Every holding is Solid or better, so there is nothing urgent to re-allocate.`} Open a stock to see its exit range and what analysts say.</p>
  </div>`;
}

function tabbar() {
  const s = state.screen;
  const fresh = reportsFor().filter((r) => r.fresh).length;
  return `
  <button class="tab ${s === "add" ? "on" : ""}" data-go="add" data-sym="">${ICON.plus}<span>Add new stock</span></button>
  <button class="tab score" data-go="score" aria-label="Portfolio score">${ring(portfolioScore())}<span>Score</span></button>
  <button class="tab ${s === "reports" || s === "report" ? "on" : ""}" data-go="reports"><span class="badgewrap">${ICON.report}${fresh ? `<i class="badge">${fresh}</i>` : ""}</span><span>Reports</span></button>`;
}

// ---------- render + events ----------
const SCREENS = { home: homeScreen, stock: stockScreen, add: addScreen, reports: reportsScreen, report: reportScreen, score: scoreScreen, podcasts: reportsScreen };
function render() {
  applyTheme();
  $("#screen").innerHTML = SCREENS[state.screen]();
  $("#tabbar").innerHTML = tabbar();
}
function toast(msg) {
  let t = $(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; $("#phone").appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2400);
}
document.addEventListener("click", (e) => {
  const go_ = e.target.closest("[data-go]");
  if (go_) {
    const extra = {};
    if ("sym" in go_.dataset) { extra.sym = go_.dataset.sym || null; extra.report = go_.dataset.sym || null; }
    go(go_.dataset.go, extra); return;
  }
  const r = e.target.closest("[data-range]"); if (r) { state.range = r.dataset.range; render(); return; }
  const sr = e.target.closest("[data-srange]"); if (sr) { state.stockRange = sr.dataset.srange; render(); return; }
  if (e.target.closest("[data-theme-next]")) { state.theme = THEMES[(THEMES.indexOf(state.theme) + 1) % THEMES.length]; store.set("npf_theme", state.theme); render(); toast("Color scheme: " + state.theme); return; }
  if (e.target.closest("[data-play]") || e.target.closest(".ep .play")) { toast("Playing narration"); }
});
document.addEventListener("submit", (e) => {
  if (e.target.id !== "addForm") return;
  e.preventDefault();
  const sym = $("#f-sym").value.trim().toUpperCase();
  const date = $("#f-date").value, amount = Number($("#f-amt").value) || 0;
  let price = Number($("#f-price").value) || 0;
  if (!sym || !date || !amount) return;
  const existing = HOLDINGS.find((h) => h.sym === sym);
  if (existing) {
    if (!price) price = priceOnOrBefore(existing.weekly, date) || lastPrice(existing);
    (userLots[sym] = userLots[sym] || []).push({ date, price, amount });
    store.set("npf_lots", userLots);
    toast(`Lot added. ${existing.name} average cost is now ${money(avgCost(existing))}.`);
    go("stock", { sym });
  } else {
    if (!price) { toast("Enter the price you paid."); return; }
    const name = ($("#f-name") && $("#f-name").value.trim()) || sym;
    const p = pending.find((x) => x.sym === sym);
    if (p) p.lots.push({ date, price, amount }); else pending.push({ sym, name, lots: [{ date, price, amount }] });
    store.set("npf_pending", pending);
    toast(`${sym} added. Price history syncs on next refresh.`);
    go("home");
  }
});
render();

// ---------- Canva export: every screen as a static page ----------
window.exportCanva = function () {
  const css = [...document.styleSheets].map((s) => { try { return [...s.cssRules].map((r) => r.cssText).join("\n"); } catch (_) { return ""; } }).join("\n");
  const saved = { ...state };
  const pages = [
    ["Home", { screen: "home", range: "ALL" }],
    ["Stock detail", { screen: "stock", sym: "NVDA", stockRange: "ALL" }],
    ["Stock detail (scrolled)", { screen: "stock", sym: "NVDA", stockRange: "ALL", _scroll: 760 }],
    ["Scores", { screen: "score" }],
    ["Reports", { screen: "reports" }],
    ["Report", { screen: "report", report: "NVDA", sym: "NVDA" }],
    ["Add new stock", { screen: "add", sym: null }],
  ];
  const out = pages.map(([label, st]) => {
    Object.assign(state, st);
    const shift = st._scroll ? `transform:translateY(-${st._scroll}px)` : "";
    return `<div data-document-role="page" data-label="${label}" style="position:relative;width:390px;height:844px;overflow:hidden;background:#0B0B10;color:#F2F2F7;font-family:-apple-system,'SF Pro Text','Helvetica Neue',Helvetica,Arial,sans-serif" data-theme="${state.theme}">
      <main class="screen" style="position:absolute;inset:0;overflow:hidden"><div style="${shift}">${SCREENS[state.screen]()}</div></main>
      <nav class="tabbar">${tabbar()}</nav>
    </div>`;
  }).join("\n");
  Object.assign(state, saved); render();
  return `<!doctype html><html data-theme="${state.theme}"><head><meta charset="utf-8"><title>Nick's Portfolio UI</title><style>${css}\n.stage,.phone{all:unset}</style></head><body style="margin:0;background:#050508">${out}</body></html>`;
};
