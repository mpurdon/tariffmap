import {ScatterplotLayer} from '@deck.gl/layers';
import type {Endpoint} from '../data/types';
import {imposerColor, NEUTRAL_COLOR, withAlpha} from '../data/palette';

/** Label metrics shared by the culling boxes and the DOM labels (styles.css .map-label) so they can't drift apart. */
const LABEL_PX = 12;
/** Pixels the label centre sits above its node. */
const LABEL_LIFT = 14;
/** Monospace advance width, in ems. */
const LABEL_ADVANCE = 0.62;
const LABEL_PAD = 4;

export interface NodeDatum extends Pick<Endpoint, 'iso3' | 'name' | 'lon' | 'lat'> {
  /** Anchor place name (capital for countries and regions). */
  capital: string;
  /** Region id when this node is a state/province. */
  region?: string;
  /** Total headline-rate weight, used for glow size. */
  weight: number;
  imposes: boolean;
}

/**
 * Greedy screen-space label culling: higher-priority labels (imposers, heavily
 * targeted countries) win; anything whose box overlaps a placed label is dropped.
 */
/** Screen placement for labels: the view's size and where a node lands on it. */
export interface LabelView {
  width: number;
  height: number;
  project: (d: Pick<NodeDatum, 'lon' | 'lat'>) => number[];
  /** False for points on the far side of the globe. */
  facing: (d: Pick<NodeDatum, 'lon' | 'lat'>) => boolean;
}

export function visibleLabels(nodes: NodeDatum[], view: LabelView | undefined, zoom: number): NodeDatum[] {
  if (!view) return [];
  const ranked = nodes
    .filter(d => (d.imposes || d.weight >= 25 || zoom > 2.6) && view.facing(d))
    .sort((a, b) => (Number(b.imposes) - Number(a.imposes)) || b.weight - a.weight);
  const placed: {x0: number; x1: number; y0: number; y1: number}[] = [];
  const out: NodeDatum[] = [];
  for (const d of ranked) {
    const [x, y] = view.project(d);
    if (x < -40 || y < -20 || x > view.width + 40 || y > view.height + 40) continue;
    const w = d.name.length * LABEL_PX * LABEL_ADVANCE + 2 * LABEL_PAD, cy = y - LABEL_LIFT;
    const box = {x0: x - w / 2, x1: x + w / 2, y0: cy - LABEL_PX / 2 - LABEL_PAD, y1: cy + LABEL_PX / 2 + LABEL_PAD};
    if (placed.some(p => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) continue;
    placed.push(box);
    out.push(d);
  }
  return out;
}

const nodeRgb = (d: NodeDatum) => (d.imposes ? imposerColor(d.iso3) : NEUTRAL_COLOR);

export function nodeLayers(nodes: NodeDatum[], zoom: number) {
  const scale = Math.max(0.6, Math.min(1.6, zoom / 2.2));
  return [
    new ScatterplotLayer<NodeDatum>({
      id: 'node-glow',
      data: nodes,
      getPosition: d => [d.lon, d.lat],
      radiusUnits: 'pixels',
      // Zoom scales radii through a uniform; per-node radii only change with the data.
      radiusScale: scale,
      getRadius: d => 6 + Math.min(14, d.weight / 40),
      getFillColor: d => withAlpha(nodeRgb(d), 40),
      pickable: false
    }),
    new ScatterplotLayer<NodeDatum>({
      id: 'node-core',
      data: nodes,
      getPosition: d => [d.lon, d.lat],
      radiusUnits: 'pixels',
      radiusScale: scale,
      getRadius: 2.2,
      getFillColor: d => withAlpha(nodeRgb(d), 255),
      pickable: true
    })
  ];
}

/**
 * Country/region names as HTML text over the canvas. WebGL SDF text is soft at
 * 12px (no hinting, an outline stretched from a texture); the browser renders
 * DOM text crisp at any pixel density. Nodes are reused by name, and only
 * their transforms change as the camera moves.
 */
export class LabelOverlay {
  private els = new Map<string, HTMLDivElement>();
  constructor(private root: HTMLElement) {}

  update(labels: NodeDatum[], view: LabelView | undefined) {
    const seen = new Set<string>();
    if (view) {
      for (const d of labels) {
        const key = d.region ?? d.iso3;
        seen.add(key);
        let el = this.els.get(key);
        if (!el) {
          el = document.createElement('div');
          el.className = 'map-label';
          el.textContent = d.name.toUpperCase();
          this.root.appendChild(el);
          this.els.set(key, el);
        }
        const [x, y] = view.project(d);
        el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y - LABEL_LIFT)}px) translate(-50%, -50%)`;
      }
    }
    for (const [key, el] of this.els) if (!seen.has(key)) { el.remove(); this.els.delete(key); }
  }
}
