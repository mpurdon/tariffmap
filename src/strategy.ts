import 'flag-icons/css/flag-icons.min.css';
import type {Endpoint, TariffAction} from './data/types';
import {responsesTo, median, STRATEGIES, type Response, type StrategyLabel} from './data/strategies';
import {STRATEGY_MODELS, playMatch, tournament, PAYOFF, type Move} from './data/game';
import {fmtDate} from './ui/format';
import {esc, safeUrl} from './ui/html';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
document.querySelector('[data-year]')!.textContent = String(new Date().getUTCFullYear());

/* Series colours, validated for CVD separation and contrast on the dark panel (dataviz validator). */
const COLOR_A = '#3987e5';
const COLOR_B = '#d95926';

/* ---------- tooltip shared by every chart ---------- */
const tip = $('tip');
function showTip(html: string, x: number, y: number) {
  tip.innerHTML = html;
  tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.transform = `translate(${Math.min(x + 14, window.innerWidth - w - 8)}px, ${y - h - 12 < 8 ? y + 16 : y - h - 12}px)`;
}
const hideTip = () => { tip.hidden = true; };

/* ---------- 1 · the dilemma ---------- */
const OUTCOMES: Record<string, string> = {
  'open-open': 'Both keep trade open: <b>3 · 3</b>. The best joint outcome, but each is tempted to grab 5.',
  'open-tariff': 'B tariffs, A doesn\'t: <b>0 · 5</b>. B free-rides on A\'s open market. A\'s best reply is to tariff back.',
  'tariff-open': 'A tariffs, B doesn\'t: <b>5 · 0</b>. A free-rides. B\'s best reply is to tariff back.',
  'tariff-tariff': 'A trade war: <b>1 · 1</b>. Each is doing the best it can given the other, and both are worse off than at 3 · 3.'
};
const pick = {a: 'open' as Move, b: 'open' as Move};
function renderDilemma() {
  document.querySelectorAll<HTMLButtonElement>('[data-a]').forEach(b => b.classList.toggle('on', b.dataset.a === pick.a));
  document.querySelectorAll<HTMLButtonElement>('[data-b]').forEach(b => b.classList.toggle('on', b.dataset.b === pick.b));
  const key = `${pick.a}-${pick.b}`;
  document.querySelectorAll<HTMLElement>('[data-cell]').forEach(td => td.classList.toggle('on', td.dataset.cell === key));
  $('outcome').innerHTML = OUTCOMES[key];
}
document.querySelectorAll<HTMLButtonElement>('[data-a]').forEach(b => b.addEventListener('click', () => { pick.a = b.dataset.a as Move; renderDilemma(); }));
document.querySelectorAll<HTMLButtonElement>('[data-b]').forEach(b => b.addEventListener('click', () => { pick.b = b.dataset.b as Move; renderDilemma(); }));
document.querySelectorAll<HTMLElement>('[data-cell]').forEach(td => td.addEventListener('click', () => {
  [pick.a, pick.b] = td.dataset.cell!.split('-') as [Move, Move];
  renderDilemma();
}));
renderDilemma();

/* ---------- 2 · strategies in the wild ---------- */
const TONE: Record<StrategyLabel, string> = {'tit-for-tat': 'info', retaliates: 'warn', 'holds-fire': 'ok', settles: 'muted', absorbs: 'muted'};
const chip = (label: StrategyLabel) => `<span class="chip ${TONE[label]}">${STRATEGIES[label].name}</span>`;

function renderRules() {
  $('rules').innerHTML = (Object.keys(STRATEGIES) as StrategyLabel[])
    .map(k => `<div class="rule">${chip(k)}<span>${esc(STRATEGIES[k].rule)}</span></div>`)
    .join('');
}

function measureLine(a: TariffAction, extra = '') {
  const src = a.sources[0] ? ` <a href="${safeUrl(a.sources[0])}" target="_blank" rel="noopener noreferrer">source ↗</a>` : '';
  return `<li><time>${fmtDate(a.effective)}</time><span>${esc(a.title)}${extra}${src}</span></li>`;
}

function card(r: Response, names: Map<string, Endpoint>): string {
  const ent = names.get(r.responder);
  const flag = ent ? `<span class="fi fi-${esc(ent.iso2)} flag"></span>` : '';
  const vs = esc(names.get(r.instigator)?.name ?? r.instigator);
  const lag = median(r.lagDays);
  const stats = [
    `<div><dt>Measures hitting it</dt><dd>${r.hits.length}</dd></div>`,
    `<div><dt>Countermeasures</dt><dd>${r.counters.length}</dd></div>`,
    lag !== null ? `<div><dt title="Median days from the latest ${vs} measure to each countermeasure">Typical response</dt><dd>${lag === 0 ? 'same day' : `${lag} days`}</dd></div>` : '',
    r.peakCounterRate !== null ? `<div><dt>Peak counter-tariff</dt><dd>${r.peakCounterRate}%</dd></div>` : '',
    r.deals.length ? `<div><dt title="${vs} measures that cap the rate for this economy">Deals</dt><dd>${r.deals.length}</dd></div>` : ''
  ].join('');
  // Skip the status note when the title already says it ("…(suspended)").
  const status = (a: TariffAction) => (a.status === 'active' || a.title.toLowerCase().includes(a.status) ? '' : ` <em>(${esc(a.status)}${a.expires ? ` ${fmtDate(a.expires)}` : ''})</em>`);
  const counters = r.counters.length ? `<h4>Countermeasures</h4><ul class="evidence">${r.counters.map(a => measureLine(a, status(a))).join('')}</ul>` : '';
  const deals = r.deals.length ? `<details><summary>${r.deals.length} negotiated cap${r.deals.length > 1 ? 's' : ''}</summary><ul class="evidence">${r.deals.map(a => measureLine(a)).join('')}</ul></details>` : '';
  const context = r.context.length ? `<details><summary>Also aimed at ${vs}, not counted (${r.context.length})</summary><ul class="evidence">${r.context.map(a => measureLine(a, ` <em>(${esc(a.legalBasis)})</em>`)).join('')}</ul></details>` : '';
  return `<article class="scard">
    <header>${flag}<h4>${esc(ent?.name ?? r.responder)}</h4>${chip(r.label)}</header>
    <p class="summary">${esc(STRATEGIES[r.label].summary)}</p>
    <dl class="stats">${stats}</dl>
    ${counters}${deals}${context}
  </article>`;
}

async function renderWild() {
  const [actions, geo] = await Promise.all([
    fetch('/data/actions.json').then(r => r.json() as Promise<TariffAction[]>),
    fetch('/geo/capitals.json').then(r => r.json() as Promise<{entities: Endpoint[]}>)
  ]);
  const names = new Map(geo.entities.map(e => [e.iso3, e]));
  const vsUsa = responsesTo(actions, 'USA');
  $('vs-usa').innerHTML = vsUsa.filter(r => r.label !== 'absorbs').map(r => card(r, names)).join('');
  const absorbers = vsUsa.filter(r => r.label === 'absorbs');
  $('absorbers').innerHTML = absorbers.length
    ? `<p>${chip('absorbs')} <b>${absorbers.length} more economies</b> hit by US measures have recorded no retaliation and no deal:</p>
       <p class="flags">${absorbers.map(r => { const e = names.get(r.responder); return e ? `<span class="fi fi-${esc(e.iso2)} flag" title="${esc(e.name)}"></span>` : ''; }).join('')}</p>`
    : '';
  const imposers = [...new Set(actions.map(a => a.imposer))].filter(i => i !== 'USA');
  const other = imposers.flatMap(i => responsesTo(actions, i)).filter(r => r.label !== 'absorbs' && r.label !== 'settles');
  $('other').innerHTML = other.length ? other.map(r => card(r, names)).join('') : '<p class="note">No other recorded retaliation.</p>';
}

/* ---------- 3 · play it out ---------- */
const ROUNDS = 40;
const sa = $<HTMLSelectElement>('sa'), sb = $<HTMLSelectElement>('sb'), noiseSel = $<HTMLSelectElement>('noise');
for (const s of [sa, sb]) s.innerHTML = STRATEGY_MODELS.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
sa.value = 'tft';
sb.value = 'tft';
const model = (id: string) => STRATEGY_MODELS.find(m => m.id === id)!;
const label = (m: Move) => (m === 'tariff' ? 'tariff' : 'open');

function renderStrips(match: ReturnType<typeof playMatch>) {
  const row = (name: string, moves: Move[], cls: string) =>
    `<div class="strip"><span class="strip-name ${cls}">${esc(name)}</span><div class="cells">${moves.map((m, i) => `<i class="${m}" data-r="${i}"></i>`).join('')}</div></div>`;
  $('strips').innerHTML = row(`A · ${model(sa.value).name}`, match.a, 'a') + row(`B · ${model(sb.value).name}`, match.b, 'b');
  $('strips').onmousemove = e => {
    const r = (e.target as HTMLElement).dataset?.r;
    if (r === undefined) return hideTip();
    const i = Number(r);
    showTip(`<b>Round ${i + 1}</b><br>A: ${label(match.a[i])} · B: ${label(match.b[i])}<br>Points: A ${match.pa[i]} · B ${match.pb[i]}`, e.clientX, e.clientY);
  };
  $('strips').onmouseleave = hideTip;
}

function renderScores(match: ReturnType<typeof playMatch>) {
  const el = $('scores');
  const W = el.clientWidth || 640, H = 220, m = {l: 40, r: 120, t: 12, b: 28};
  const cum = (ps: number[]) => ps.reduce<number[]>((acc, p) => [...acc, (acc.at(-1) ?? 0) + p], []);
  const ca = cum(match.pa), cb = cum(match.pb);
  const max = Math.max(5, ...ca, ...cb, ROUNDS * 3);
  const x = (i: number) => m.l + (i / (ROUNDS - 1)) * (W - m.l - m.r);
  const y = (v: number) => H - m.b - (v / max) * (H - m.t - m.b);
  const path = (vs: number[]) => vs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const ticks = [0, max / 2, max].map(v => Math.round(v));
  el.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="Cumulative points: A ${ca.at(-1)}, B ${cb.at(-1)}, after ${ROUNDS} rounds">
    ${ticks.map(t => `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join('')}
    <line class="ref" x1="${x(0)}" x2="${x(ROUNDS - 1)}" y1="${y(3)}" y2="${y(ROUNDS * 3)}"/>
    <text class="ref-label" x="${x(ROUNDS - 1) - 4}" y="${y(ROUNDS * 3) - 6}" text-anchor="end">always open: ${ROUNDS * 3}</text>
    <text class="tick" x="${x(0)}" y="${H - 8}">round 1</text><text class="tick" x="${x(ROUNDS - 1)}" y="${H - 8}" text-anchor="end">${ROUNDS}</text>
    <path d="${path(ca)}" fill="none" stroke="${COLOR_A}" stroke-width="2"/>
    <path d="${path(cb)}" fill="none" stroke="${COLOR_B}" stroke-width="2"/>
    <text class="dlabel" x="${x(ROUNDS - 1) + 8}" y="${y(ca.at(-1)!) + (ca.at(-1)! >= cb.at(-1)! ? -2 : 12)}"><tspan fill="${COLOR_A}">●</tspan> A ${ca.at(-1)}</text>
    <text class="dlabel" x="${x(ROUNDS - 1) + 8}" y="${y(cb.at(-1)!) + (cb.at(-1)! > ca.at(-1)! ? -2 : 12)}"><tspan fill="${COLOR_B}">●</tspan> B ${cb.at(-1)}</text>
    <line class="cross" id="cross" y1="${m.t}" y2="${H - m.b}" visibility="hidden"/>
    <rect x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent" id="hit"/>
  </svg>`;
  const cross = el.querySelector<SVGLineElement>('#cross')!;
  const hit = el.querySelector<SVGRectElement>('#hit')!;
  hit.onmousemove = e => {
    const box = hit.getBoundingClientRect();
    const i = Math.max(0, Math.min(ROUNDS - 1, Math.round(((e.clientX - box.left) / box.width) * (ROUNDS - 1))));
    cross.setAttribute('x1', String(x(i)));
    cross.setAttribute('x2', String(x(i)));
    cross.setAttribute('visibility', 'visible');
    showTip(`<b>After round ${i + 1}</b><br><span style="color:${COLOR_A}">●</span> A ${ca[i]} · <span style="color:${COLOR_B}">●</span> B ${cb[i]}`, e.clientX, e.clientY);
  };
  hit.onmouseleave = () => { cross.setAttribute('visibility', 'hidden'); hideTip(); };
}

function renderTourney(noise: number) {
  const results = tournament(STRATEGY_MODELS, ROUNDS, noise, 30);
  $('t-noise').textContent = noise ? `· mistakes: 1 in ${Math.round(1 / noise)} moves` : '· no mistakes';
  // Axis 0–3: permanent open trade (3) is the practical ceiling for an average, so differences stay readable.
  const max = PAYOFF.open.open;
  $('tourney').innerHTML = `<div class="bars">${results
    .map(r => `<div class="bar-row" data-id="${r.strategy.id}">
      <span class="bar-name">${esc(r.strategy.name)}</span>
      <span class="bar-track"><span class="bar" style="width:${Math.min(100, (r.perRound / max) * 100)}%"></span><span class="mark war" style="left:${(1 / max) * 100}%"></span></span>
      <span class="bar-val">${r.perRound.toFixed(2)}</span>
    </div>`)
    .join('')}</div><p class="note">Points per round, averaged over every pairing. The axis runs to 3, permanent open trade; the red tick is a permanent trade war (1).</p>`;
  $('tourney').querySelectorAll<HTMLElement>('.bar-row').forEach(row => {
    const s = model(row.dataset.id!);
    row.onmousemove = e => showTip(`<b>${esc(s.name)}</b><br>${esc(s.description)}`, e.clientX, e.clientY);
    row.onmouseleave = hideTip;
  });
  $('tourney-table').innerHTML = `<table class="data"><thead><tr><th>Rank</th><th>Strategy</th><th>Points per round</th><th>How it plays</th></tr></thead><tbody>${results
    .map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.strategy.name)}</td><td class="num">${r.perRound.toFixed(2)}</td><td>${esc(r.strategy.description)}</td></tr>`)
    .join('')}</tbody></table>`;
}

function renderPlay() {
  const noise = Number(noiseSel.value);
  const match = playMatch(model(sa.value), model(sb.value), ROUNDS, noise, 7);
  renderStrips(match);
  renderScores(match);
  renderTourney(noise);
}
for (const s of [sa, sb, noiseSel]) s.addEventListener('change', renderPlay);
let resizeRaf = 0;
window.addEventListener('resize', () => { cancelAnimationFrame(resizeRaf); resizeRaf = requestAnimationFrame(renderPlay); });

renderRules();
renderPlay();
renderWild().catch(() => { $('vs-usa').innerHTML = '<p class="note">The measures could not be loaded right now.</p>'; });
