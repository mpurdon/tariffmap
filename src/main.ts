import {Deck, MapView, _GlobeView as GlobeView, LinearInterpolator, type PickingInfo} from '@deck.gl/core';
import {ArcLayer} from '@deck.gl/layers';
import {loadDataset, type Dataset} from './data/load';
import {liveArcs, liveActions, today, type ViewState, type LiveArc} from './data/filter';
import {imposerColor} from './data/palette';
import {FlowArcLayer} from './layers/arcs';
import {countriesLayer, oceanLayer, COLORS} from './layers/basemap';
import {nodeLayers, visibleLabels, type NodeDatum} from './layers/labels';
import {showTooltip, hideTooltip} from './ui/tooltip';
import {renderLegend} from './ui/legend';
import {renderFreshness} from './ui/freshness';
import {renderFeed} from './ui/feed';
import {buildSteps, scheduledChanges} from './data/timeline';
import {renderTimeline, type TimelineState} from './ui/timeline';
import 'flag-icons/css/flag-icons.min.css';
import './styles.css';

const MAP_VIEW = {longitude: 12, latitude: 24, zoom: 1.3, minZoom: 0.8, maxZoom: 9, pitch: 0, bearing: 0};
const GLOBE_VIEW = {longitude: -60, latitude: 35, zoom: 1.75, minZoom: 0.5, maxZoom: 9};

const state: ViewState = {date: today(), focus: null, highlight: null, hidden: new Set(), sort: 'date'};
const timeline: TimelineState = {steps: [], index: 0, playing: false, delayMs: 1000};
let playTimer: number | null = null;
let upcoming: ReturnType<typeof scheduledChanges> = [];
let motion = true;
let frozenAt = 0;
let globe = new URLSearchParams(location.search).has('globe');
let zoom = MAP_VIEW.zoom;
let viewState: {longitude: number; latitude: number; zoom: number; [k: string]: unknown} = {...MAP_VIEW};
let ds: Dataset;
let deck: Deck<MapView | GlobeView>;
let arcs: LiveArc[] = [];
let nodes: NodeDatum[] = [];
const t0 = performance.now();

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

function currentViewport() {
  try {
    return deck?.isInitialized ? deck.getViewports()[0] : undefined;
  } catch {
    return undefined;
  }
}

function recompute() {
  arcs = liveArcs(ds, state);
  const weights = new Map<string, {w: number; imposes: boolean}>();
  for (const a of arcs) {
    const f = weights.get(a.imposer) ?? {w: 0, imposes: false};
    f.w += a.rate; f.imposes = true; weights.set(a.imposer, f);
    const t = weights.get(a.target) ?? {w: 0, imposes: false};
    t.w += a.rate; weights.set(a.target, t);
  }
  nodes = ds.entities
    .filter(e => weights.has(e.iso3))
    .map(e => ({...e, weight: weights.get(e.iso3)!.w, imposes: weights.get(e.iso3)!.imposes}));

  renderLegend(document.getElementById('legend')!, ds, new Set(ds.arcs.map(a => a.imposer)), state.hidden, toggleImposer);
  renderTimeline(document.getElementById('timeline')!, timeline, {onIndex: setStep, onPlay: setPlaying, onDelay: setDelay});
  renderFeed(document.getElementById('feed')!, ds, liveActions(ds, state), state.focus, state.date, state.sort, upcoming, {
    onHover: id => { state.highlight = id; render(); },
    onFocus: setFocus,
    onSort: key => { state.sort = key; recompute(); render(); },
    onJump: date => { const i = timeline.steps.findIndex(s => s.date === date); if (i >= 0) setStep(i); }
  });
}

function toggleImposer(iso3: string) {
  if (state.hidden.has(iso3)) state.hidden.delete(iso3);
  else state.hidden.add(iso3);
  recompute();
  render();
}

function setStep(i: number) {
  timeline.index = Math.max(0, Math.min(timeline.steps.length - 1, i));
  state.date = timeline.steps[timeline.index].date;
  recompute();
  render();
}

function setPlaying(playing: boolean) {
  if (playTimer !== null) { clearInterval(playTimer); playTimer = null; }
  timeline.playing = playing;
  if (playing) {
    // Play runs through history and stops at Now; future steps are for browsing only.
    const nowIdx = timeline.steps.findIndex(s => s.kind === 'now');
    if (timeline.index >= nowIdx) setStep(0);
    playTimer = window.setInterval(() => {
      if (timeline.index >= nowIdx) return setPlaying(false);
      setStep(timeline.index + 1);
    }, timeline.delayMs);
  }
  renderTimeline(document.getElementById('timeline')!, timeline, {onIndex: setStep, onPlay: setPlaying, onDelay: setDelay});
}

function setDelay(ms: number) {
  timeline.delayMs = ms;
  if (timeline.playing) setPlaying(true);
}

function setMotion(on: boolean) {
  motion = on;
  if (!on) frozenAt = clock();
  render();
}

/** Animation clock in seconds; holds still while motion is off. */
function clock(): number {
  return motion ? (performance.now() - t0) / 1000 : frozenAt;
}

function setFocus(iso3: string | null) {
  state.focus = state.focus === iso3 ? null : iso3;
  state.highlight = null;
  recompute();
  render();
  if (globe && state.focus) flyTo(state.focus);
}

/** Rotate the globe so the focused country faces the viewer. */
function flyTo(iso3: string) {
  const e = ds.entityByIso.get(iso3);
  if (!e) return;
  deck.setProps({
    initialViewState: {
      ...viewState,
      longitude: e.lon,
      latitude: e.lat,
      transitionDuration: 900,
      transitionInterpolator: new LinearInterpolator(['longitude', 'latitude'])
    }
  });
}

let zen = false;
function setZen(on: boolean) {
  zen = on;
  document.body.classList.toggle('zen', on);
  (document.getElementById('zenExit') as HTMLButtonElement).hidden = !on;
  hideTooltip();
}

function setFeedCollapsed(collapsed: boolean) {
  document.body.classList.toggle('feed-collapsed', collapsed);
  const btn = document.getElementById('feedToggle')!;
  btn.setAttribute('aria-expanded', String(!collapsed));
  btn.title = collapsed ? 'Expand panel' : 'Collapse panel';
  try { localStorage.setItem('feedCollapsed', String(collapsed)); } catch { /* private mode */ }
}

function arcAlpha(a: LiveArc): number {
  if (!state.highlight) return 1;
  return a.actionIds.includes(state.highlight) ? 1 : 0.12;
}

function layers(time: number) {
  const involved = new Set<string>();
  for (const a of arcs) { involved.add(a.imposer); involved.add(a.target); }
  // Width encodes dollars of imports covered (log scale: $100M → 1px, $10B → ~3px, $300B → 5px);
  // pairs without trade data fall back to rate.
  const width = (a: LiveArc) =>
    a.tradeUsd !== undefined ? 0.7 + Math.max(0, Math.min(4.3, Math.log10(Math.max(a.tradeUsd, 1e7) / 1e8) * 1.25)) : 1 + Math.min(3, a.rate / 25);
  const color = (a: LiveArc, alpha: number) => [...imposerColor(a.imposer), Math.round(alpha * 255 * arcAlpha(a))] as [number, number, number, number];
  const trig = [state.highlight];

  return [
    globe ? oceanLayer() : null,
    countriesLayer(ds, {involved, focus: state.focus, globe, onClick: setFocus}),
    new ArcLayer<LiveArc>({
      id: 'base-arcs',
      data: arcs,
      greatCircle: globe,
      getSourcePosition: a => a.from,
      getTargetPosition: a => a.to,
      getSourceColor: a => color(a, 0.16),
      getTargetColor: a => color(a, 0.16),
      getWidth: width,
      widthUnits: 'pixels',
      getHeight: globe ? 0.08 : 0.32,
      getTilt: globe ? 0 : 55,
      pickable: true,
      parameters: {cullMode: 'none'},
      updateTriggers: {getSourceColor: trig, getTargetColor: trig}
    }),
    new FlowArcLayer<LiveArc>({
      id: 'flow-arcs',
      data: arcs,
      greatCircle: globe,
      getSourcePosition: a => a.from,
      getTargetPosition: a => a.to,
      getSourceColor: a => color(a, 0.95),
      getTargetColor: a => color(a, 0.95),
      getWidth: a => width(a) + 0.8,
      widthUnits: 'pixels',
      getHeight: globe ? 0.08 : 0.32,
      getTilt: globe ? 0 : 55,
      getPhase: a => hash(a.id),
      getDensity: a => 1 + Math.min(3, Math.floor(a.rate / 25)),
      getSpeed: () => 0.22,
      tail: 0.3,
      time,
      pickable: false,
      parameters: {cullMode: 'none', blendColorOperation: 'add', blendColorSrcFactor: 'src-alpha', blendColorDstFactor: 'one', blendAlphaOperation: 'add', blendAlphaSrcFactor: 'one', blendAlphaDstFactor: 'one'},
      updateTriggers: {getSourceColor: trig, getTargetColor: trig}
    }),
    ...nodeLayers(nodes, visibleLabels(nodes, currentViewport(), zoom), zoom)
  ];
}

function render() {
  deck.setProps({layers: layers(clock())});
}

function frame() {
  if (motion) render();
  requestAnimationFrame(frame);
}

function makeDeck() {
  viewState = {...(globe ? GLOBE_VIEW : MAP_VIEW)};
  zoom = viewState.zoom;
  deck = new Deck({
    parent: document.getElementById('map') as HTMLDivElement,
    views: globe ? new GlobeView({id: 'globe'}) : new MapView({id: 'map', repeat: true}),
    initialViewState: globe ? GLOBE_VIEW : MAP_VIEW,
    controller: {inertia: 250},
    layers: [],
    style: {background: `rgb(${COLORS.ocean.slice(0, 3).join(' ')})`},
    onViewStateChange: ({viewState: vs}) => { zoom = vs.zoom; viewState = vs as typeof viewState; },
    onHover: (info: PickingInfo) => showTooltip(info, ds, state.date),
    onClick: (info: PickingInfo) => { if (!info.object) setFocus(null); },
    getCursor: ({isHovering}) => (isHovering ? 'pointer' : 'grab')
  });
  if (import.meta.env.DEV) (window as unknown as {__deck: unknown}).__deck = deck;
}

async function main() {
  ds = await loadDataset();
  renderFreshness(document.getElementById('freshness')!, ds.meta);
  const earliest = ds.actions.map(a => a.effective).sort()[0] ?? today();
  upcoming = scheduledChanges(ds.actions, today());
  timeline.steps = buildSteps(earliest, today(), upcoming);
  timeline.index = timeline.steps.findIndex(s => s.kind === 'now');
  recompute();
  makeDeck();
  frame();

  (document.getElementById('viewToggle') as HTMLInputElement).checked = globe;
  document.getElementById('viewToggle')!.addEventListener('change', e => {
    globe = (e.target as HTMLInputElement).checked;
    hideTooltip();
    deck.finalize();
    makeDeck();
  });
  document.getElementById('map')!.addEventListener('mouseleave', hideTooltip);
  const motionToggle = document.getElementById('motionToggle') as HTMLInputElement;
  motionToggle.checked = motion;
  motionToggle.addEventListener('change', () => setMotion(motionToggle.checked));
  document.getElementById('zenToggle')!.addEventListener('click', () => setZen(true));
  document.getElementById('zenExit')!.addEventListener('click', () => setZen(false));
  document.getElementById('feedToggle')!.addEventListener('click', () => setFeedCollapsed(!document.body.classList.contains('feed-collapsed')));
  try { if (localStorage.getItem('feedCollapsed') === 'true') setFeedCollapsed(true); } catch { /* ignore */ }
  window.addEventListener('keydown', e => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === ' ') { e.preventDefault(); setPlaying(!timeline.playing); }
    else if (e.key === 'ArrowLeft') setStep(timeline.index - 1);
    else if (e.key === 'ArrowRight') setStep(timeline.index + 1);
    else if (e.key === 'z' || e.key === 'Z') setZen(!zen);
    else if (e.key === 'Escape') { if (zen) setZen(false); else if (state.focus) setFocus(null); }
  });
}

main().catch(err => {
  console.error(err);
  document.getElementById('feed')!.innerHTML = `<div class="empty">Failed to load data: ${err.message}</div>`;
});

// A second Deck on the same canvas is worse than a reload.
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
