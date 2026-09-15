import {Deck, MapView, _GlobeView as GlobeView, LinearInterpolator, FlyToInterpolator, type PickingInfo} from '@deck.gl/core';
import {ArcLayer} from '@deck.gl/layers';
import {loadDataset, type Dataset} from './data/load';
import {liveArcs, liveRegionalArcs, liveActions, today, type ViewState, type LiveArc, type LiveRegionalArc} from './data/filter';
import {imposerColor, rgbCss, withAlpha} from './data/palette';
import {FlowArcLayer} from './layers/arcs';
import {countriesLayer, admin1Layer, oceanLayer, COLORS} from './layers/basemap';
import {nodeLayers, visibleLabels, type NodeDatum} from './layers/labels';
import {showTooltip, hideTooltip} from './ui/tooltip';
import {renderLegend} from './ui/legend';
import {renderFreshness} from './ui/freshness';
import {renderFeed} from './ui/feed';
import {buildSteps, nowIndex, scheduledChanges, type Upcoming} from './data/timeline';
import {renderTimeline, type TimelineState} from './ui/timeline';
import 'flag-icons/css/flag-icons.min.css';
import './styles.css';

/* ---------- view modes: everything that differs between the flat map and the globe ---------- */
type CameraState = {longitude: number; latitude: number; zoom: number; [k: string]: unknown};
const VIEW_MODES = {
  map: {
    // The map wraps: panning past an edge slides the far side in instead of snapping back.
    // minZoom is the absolute floor; mapMinZoom() raises it to fit one world.
    makeView: () => new MapView({id: 'map', repeat: true}),
    camera: {longitude: 12, latitude: 24, zoom: 1.3, minZoom: 1.2, maxZoom: 9, pitch: 0, bearing: 0} as CameraState,
    ocean: false,
    wrapLongitude: true,
    // Flat arcs bow sideways in the screen plane; reciprocal pairs bow to opposite sides.
    arc: {greatCircle: false, getHeight: 0.32, getTilt: 55}
  },
  globe: {
    makeView: () => new GlobeView({id: 'globe'}),
    camera: {longitude: -60, latitude: 35, zoom: 1.75, minZoom: 0.5, maxZoom: 9} as CameraState,
    ocean: true,
    wrapLongitude: false,
    arc: {greatCircle: true, getHeight: 0.08, getTilt: 0}
  }
} as const;
type ModeName = keyof typeof VIEW_MODES;

/* ---------- state ---------- */
const state: ViewState = {date: today(), focus: null, highlight: null, hidden: new Set(), sort: 'date', direction: 'both'};
const timeline: TimelineState = {steps: [], index: 0, playing: false, delayMs: 1000};
let mode: ModeName = 'map';
let camera: CameraState = {...VIEW_MODES.map.camera};
let ds: Dataset;
let deck: Deck<MapView | GlobeView>;
let upcoming: Upcoming[] = [];
let playTimer: number | null = null;

/** Zoom at which country arcs give way to province/state arcs where regional data exists. */
const REGIONAL_ZOOM = 3;
const ADMIN1_ZOOM = 2.4;
const isRegional = () => camera.zoom >= REGIONAL_ZOOM;

// Derived on every state change (not every frame).
let arcs: LiveArc[] = [];
let rarcs: LiveRegionalArc[] = [];
let nodes: NodeDatum[] = [];
let labels: NodeDatum[] = [];
let involved = new Set<string>();

/* ---------- animation clock: the comets read it on every draw; freezing holds it still ---------- */
const t0 = performance.now();
let motion = true;
let frozenAt = 0;
const clock = () => (motion ? (performance.now() - t0) / 1000 : frozenAt);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

const $ = (id: string) => document.getElementById(id)!;
const timelineCallbacks = {onIndex: setStep, onPlay: setPlaying, onDelay: setDelay};
const renderTimelineBar = () => renderTimeline($('timeline'), timeline, timelineCallbacks);

/* ---------- derived state ---------- */
function recompute() {
  arcs = liveArcs(ds, state);
  rarcs = liveRegionalArcs(ds, state);
  involved = new Set(arcs.flatMap(a => [a.imposer, a.target]));

  const weights = new Map<string, {w: number; imposes: boolean}>();
  for (const a of arcs) {
    const f = weights.get(a.imposer) ?? {w: 0, imposes: false};
    f.w += a.rate; f.imposes = true; weights.set(a.imposer, f);
    const t = weights.get(a.target) ?? {w: 0, imposes: false};
    t.w += a.rate; weights.set(a.target, t);
  }
  const countryNodes: NodeDatum[] = ds.entities.filter(e => weights.has(e.iso3)).map(e => ({...e, ...weights.get(e.iso3)!, weight: weights.get(e.iso3)!.w}));
  const regionWeight = new Map<string, number>();
  for (const a of rarcs) regionWeight.set(a.region, (regionWeight.get(a.region) ?? 0) + a.rate);
  const regionNodes: NodeDatum[] = ds.regions.filter(x => regionWeight.has(x.id)).map(x => ({iso3: x.iso3, name: x.name, capital: x.anchor, lon: x.lon, lat: x.lat, region: x.id, weight: regionWeight.get(x.id)!, imposes: false}));
  nodes = [...countryNodes, ...regionNodes];
  relabel();
  $('modeBadge').hidden = !isRegional() || !rarcs.length;

  renderLegend($('legend'), ds, state.hidden, toggleImposer);
  renderTimelineBar();
  renderFeed($('feed'), ds, liveActions(ds, state), state, upcoming, {
    onHover: id => { state.highlight = id; render(); },
    onFocus: setFocus,
    onSort: key => { state.sort = key; recompute(); render(); },
    onJump: date => { const i = timeline.steps.findIndex(s => s.date === date); if (i >= 0) setStep(i); },
    onDirection: d => { state.direction = d; recompute(); render(); }
  });
}

/** Label culling depends only on the camera and the node set (regions only exist zoomed in). */
function relabel() {
  let viewport;
  try { viewport = deck?.isInitialized ? deck.getViewports()[0] : undefined; } catch { viewport = undefined; }
  const shown = isRegional() ? nodes : nodes.filter(n => !n.region);
  labels = visibleLabels(shown, viewport, camera.zoom);
  $('modeBadge').hidden = !isRegional() || !rarcs.length;
}

/* ---------- actions ---------- */
function toggleImposer(iso3: string) {
  if (!state.hidden.delete(iso3)) state.hidden.add(iso3);
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
    const stop = nowIndex(timeline.steps);
    if (timeline.index >= stop) setStep(0);
    playTimer = window.setInterval(() => (timeline.index >= stop ? setPlaying(false) : setStep(timeline.index + 1)), timeline.delayMs);
  }
  renderTimelineBar();
}

function setDelay(ms: number) {
  timeline.delayMs = ms;
  if (timeline.playing) setPlaying(true);
}

function setMotion(on: boolean) {
  if (!on) frozenAt = clock();
  motion = on;
  deck.setProps({_animate: on});
  render();
}

function setFocus(iso3: string | null) {
  state.focus = state.focus === iso3 ? null : iso3;
  state.highlight = null;
  recompute();
  render();
  if (mode === 'globe' && state.focus) flyTo(state.focus);
}

/** Move the camera programmatically (deck only reports user-driven changes through onViewStateChange). */
function setCamera(next: Partial<CameraState>, transitionMs = 0) {
  camera = {...camera, ...next};
  const interpolator = mode === 'map' ? new FlyToInterpolator({speed: 2}) : new LinearInterpolator(['longitude', 'latitude', 'zoom']);
  deck.setProps({
    initialViewState: transitionMs ? {...camera, transitionDuration: transitionMs, transitionInterpolator: interpolator} : {...camera}
  });
  relabel();
  render();
}

/**
 * Rotate the globe so the focused country faces the viewer with the earth upright:
 * the view latitude is pulled toward the equator so the poles stay at the top/bottom
 * rather than tipping toward the camera, while the country stays well inside the disc.
 */
function flyTo(iso3: string) {
  const e = ds.entityByIso.get(iso3);
  if (!e) return;
  const uprightLat = Math.max(-30, Math.min(30, e.lat * 0.5));
  setCamera({longitude: e.lon, latitude: uprightLat, zoom: continentZoom(iso3)}, 900);
}

/** A zoom that frames the country's continent: wide countries ~2.9, small ones ~3.2. */
function continentZoom(iso3: string): number {
  const nums = new Set(ds.entities.filter(x => (iso3 === 'EUN' ? x.eu : x.iso3 === iso3)).map(x => x.num));
  let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
  const visit = (c: unknown) => {
    if (typeof (c as number[])[0] === 'number') {
      const [lon, lat] = c as [number, number];
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon); minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    } else for (const child of c as unknown[]) visit(child);
  };
  for (const f of ds.countries.features) if (nums.has(String(f.id)) && f.geometry.type !== 'GeometryCollection') visit(f.geometry.coordinates);
  const span = Math.max(1, Math.min(180, maxLon - minLon), (maxLat - minLat) * 1.4);
  return Math.max(2.2, Math.min(3.2, Math.log2(360 / span) + 0.3));
}

/** Zoom at which the full 360° of the flat map exactly spans the viewport (no wrap, no gaps). */
const fitZoom = () => Math.log2(window.innerWidth / 512);
const isZen = () => document.body.classList.contains('zen');
/**
 * Flat-map zoom floor: never show more than one copy of the world at rest, or a
 * wide screen sees a second Asia with arcs arriving from off the far edge. Zen
 * fits the world exactly; the normal view also keeps its own minimum.
 */
const mapMinZoom = () => Math.max(fitZoom(), isZen() ? 0.5 : (VIEW_MODES.map.camera.minZoom as number));
/** Camera patch that applies the floor and lifts the current zoom up to it. */
const zoomFloor = (): Partial<CameraState> => {
  const z = mapMinZoom();
  return {minZoom: z, zoom: Math.max(camera.zoom, z)};
};

function setZen(on: boolean) {
  document.body.classList.toggle('zen', on);
  ($('zenExit') as HTMLButtonElement).hidden = !on;
  ($('zenCredit') as HTMLDivElement).hidden = !on;
  hideTooltip();
  if (mode !== 'map') return;
  // Zen centres the world at exactly one copy; leaving it just re-applies the floor.
  const z = mapMinZoom();
  if (on) setCamera({longitude: 10, latitude: 18, zoom: z, minZoom: z}, 600);
  else setCamera(zoomFloor());
}

function setFeedCollapsed(collapsed: boolean) {
  document.body.classList.toggle('feed-collapsed', collapsed);
  const btn = $('feedToggle');
  btn.setAttribute('aria-expanded', String(!collapsed));
  btn.title = collapsed ? 'Expand panel' : 'Collapse panel';
  try { localStorage.setItem('feedCollapsed', String(collapsed)); } catch { /* private mode */ }
}

/* ---------- layers ---------- */
function layers() {
  const m = VIEW_MODES[mode];
  const dim = (a: {actionIds: string[]}) => (!state.highlight || a.actionIds.includes(state.highlight) ? 1 : 0.12);
  const color = (a: {imposer: string; actionIds: string[]}, alpha: number) => withAlpha(imposerColor(a.imposer), Math.round(alpha * 255 * dim(a)));
  // Width encodes dollars of imports covered (log scale: $100M → 1px, $10B → ~3px, $300B → 5px);
  // pairs without trade data fall back to rate.
  const width = (a: {tradeUsd?: number; rate: number}) =>
    a.tradeUsd !== undefined ? 0.7 + Math.max(0, Math.min(4.3, Math.log10(Math.max(a.tradeUsd, 1e7) / 1e8) * 1.25)) : 1 + Math.min(3, a.rate / 25);
  const trig = [state.highlight];

  // Zoomed in, pairs with regional data are drawn to provinces/states instead of the capital.
  const regional = isRegional();
  const regionalPairs = new Set(regional ? rarcs.map(a => `${a.imposer}>${a.target}`) : []);
  const countryArcs = arcs.filter(a => !regionalPairs.has(a.id));
  const shownRegional = regional ? rarcs : [];
  const regionsInvolved = new Set(shownRegional.map(a => a.region));
  const shownNodes = regional ? nodes : nodes.filter(n => !n.region);

  type AnyArc = LiveArc | LiveRegionalArc;
  // On the flat map every target exists in each repeated world copy, so an arc
  // could bow east or west. Picking the geographically shorter way splits a
  // bundle at the source's antipode (US→Thailand east, US→Vietnam west). Instead
  // both ends are taken from the world copy centred on the view, so the arc
  // joins the two points the viewer is actually looking at: with one world on
  // screen no arc leaves the edges, and a bundle to one region always takes the
  // same side. The globe needs none of this.
  // Which world copy (…, -1, 0, 1, …) holds the point the view-centred fold picks.
  const copyOf = (lon: number) => Math.round((lon - camera.longitude) / 360);
  // Worlds to shift the target by so both ends sit in the same copy.
  const copyShift = (a: AnyArc) => (m.wrapLongitude ? copyOf(a.from[0]) - copyOf(a.to[0]) : 0);
  const arcPair = (id: string, data: AnyArc[]) => {
    // Only rebuild target positions when some arc actually changes copy, not on every pan.
    const copyKey = data.map(copyShift).join('');
    const common = {
      ...m.arc,
      data,
      getSourcePosition: (a: AnyArc) => a.from,
      getTargetPosition: (a: AnyArc): [number, number] => [a.to[0] + 360 * copyShift(a), a.to[1]],
      widthUnits: 'pixels' as const,
      updateTriggers: {getSourceColor: trig, getTargetColor: trig, getTargetPosition: [copyKey]}
    };
    return [
      new ArcLayer<AnyArc>({
        ...common,
        id: `base-${id}`,
        getSourceColor: a => color(a, 0.16),
        getTargetColor: a => color(a, 0.16),
        getWidth: width,
        pickable: true,
        parameters: {cullMode: 'none'}
      }),
      new FlowArcLayer<AnyArc>({
        ...common,
        id: `flow-${id}`,
        getSourceColor: a => color(a, 0.95),
        getTargetColor: a => color(a, 0.95),
        getWidth: a => width(a) + 0.8,
        getPhase: a => hash(a.id),
        getDensity: a => 1 + Math.min(3, Math.floor(a.rate / 25)),
        getSpeed: 0.22,
        tail: 0.3,
        clock,
        pickable: false,
        parameters: {cullMode: 'none', blendColorOperation: 'add', blendColorSrcFactor: 'src-alpha', blendColorDstFactor: 'one', blendAlphaOperation: 'add', blendAlphaSrcFactor: 'one', blendAlphaDstFactor: 'one'}
      })
    ];
  };

  return [
    m.ocean ? oceanLayer() : null,
    countriesLayer(ds, {involved, focus: state.focus, wrapLongitude: m.wrapLongitude, onClick: setFocus}),
    camera.zoom >= ADMIN1_ZOOM ? admin1Layer(ds, {involved: regionsInvolved, emphasis: Math.min(1, (camera.zoom - ADMIN1_ZOOM) / (REGIONAL_ZOOM - ADMIN1_ZOOM))}) : null,
    ...arcPair('arcs', countryArcs),
    ...arcPair('rarcs', shownRegional),
    ...nodeLayers(shownNodes, labels, camera.zoom)
  ];
}

function render() {
  deck.setProps({layers: layers()});
}

function makeDeck() {
  const m = VIEW_MODES[mode];
  camera = {...m.camera};
  if (mode === 'map') camera = {...camera, ...zoomFloor()};
  deck = new Deck({
    parent: $('map') as HTMLDivElement,
    views: m.makeView(),
    initialViewState: camera,
    controller: {inertia: 250},
    layers: [],
    _animate: motion,
    style: {background: rgbCss(COLORS.ocean)},
    onViewStateChange: ({viewState}) => { camera = viewState as CameraState; relabel(); render(); },
    onHover: (info: PickingInfo) => showTooltip(info, ds, state.date),
    onClick: (info: PickingInfo) => { if (!info.object) setFocus(null); },
    getCursor: ({isHovering}) => (isHovering ? 'pointer' : 'grab'),
    onLoad: () => { relabel(); render(); }
  });
  if (import.meta.env.DEV) Object.assign(window, {__deck: deck, __setCamera: setCamera});
}

/* ---------- boot ---------- */
async function main() {
  ds = await loadDataset();
  renderFreshness($('freshness'), ds.meta);
  const earliest = ds.actions.map(a => a.effective).sort()[0] ?? today();
  upcoming = scheduledChanges(ds.actions, today());
  timeline.steps = buildSteps(earliest, today(), upcoming);
  timeline.index = nowIndex(timeline.steps);
  recompute();
  makeDeck();
  render();

  const viewToggle = $('viewToggle') as HTMLInputElement;
  viewToggle.addEventListener('change', () => {
    mode = viewToggle.checked ? 'globe' : 'map';
    hideTooltip();
    deck.finalize();
    makeDeck();
    render();
  });
  const motionToggle = $('motionToggle') as HTMLInputElement;
  motionToggle.checked = motion;
  motionToggle.addEventListener('change', () => setMotion(motionToggle.checked));
  $('map').addEventListener('mouseleave', hideTooltip);
  $('zenToggle').addEventListener('click', () => setZen(true));
  $('zenExit').addEventListener('click', () => setZen(false));
  $('feedToggle').addEventListener('click', () => setFeedCollapsed(!document.body.classList.contains('feed-collapsed')));
  $('zenCredit').querySelector('[data-year]')!.textContent = String(new Date().getUTCFullYear());
  // Deck resizes its own canvas; we only need to act when the floor moves the camera.
  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      if (mode !== 'map') return;
      const patch = zoomFloor();
      if (patch.minZoom !== camera.minZoom || patch.zoom !== camera.zoom) setCamera(patch);
    });
  });
  try { if (localStorage.getItem('feedCollapsed') === 'true') setFeedCollapsed(true); } catch { /* ignore */ }

  window.addEventListener('keydown', e => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === ' ') { e.preventDefault(); setPlaying(!timeline.playing); }
    else if (e.key === 'ArrowLeft') setStep(timeline.index - 1);
    else if (e.key === 'ArrowRight') setStep(timeline.index + 1);
    else if (e.key === 'z' || e.key === 'Z') setZen(!isZen());
    else if (e.key === 'Escape') { if (isZen()) setZen(false); else if (state.focus) setFocus(null); }
  });
}

main().catch(err => {
  console.error(err);
  $('feed').innerHTML = `<div class="empty">Failed to load data: ${err.message}</div>`;
});

// A second Deck on the same canvas is worse than a reload.
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
