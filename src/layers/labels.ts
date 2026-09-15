import {ScatterplotLayer, TextLayer} from '@deck.gl/layers';
import type {Viewport} from '@deck.gl/core';
import type {Endpoint} from '../data/types';
import {imposerColor, NEUTRAL_COLOR, withAlpha} from '../data/palette';
import {COLORS} from './basemap';

/** Label metrics shared by the culling boxes and the TextLayer so they can't drift apart. */
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
let lastLabels: NodeDatum[] = [];
export function visibleLabels(nodes: NodeDatum[], viewport: Viewport | undefined, zoom: number): NodeDatum[] {
  if (!viewport) return nodes;
  const ranked = nodes
    .filter(d => d.imposes || d.weight >= 25 || zoom > 2.6)
    .sort((a, b) => (Number(b.imposes) - Number(a.imposes)) || b.weight - a.weight);
  const placed: {x0: number; x1: number; y0: number; y1: number}[] = [];
  const out: NodeDatum[] = [];
  for (const d of ranked) {
    const [x, y] = viewport.project([d.lon, d.lat]);
    const w = d.name.length * LABEL_PX * LABEL_ADVANCE + 2 * LABEL_PAD, cy = y - LABEL_LIFT;
    const box = {x0: x - w / 2, x1: x + w / 2, y0: cy - LABEL_PX / 2 - LABEL_PAD, y1: cy + LABEL_PX / 2 + LABEL_PAD};
    if (placed.some(p => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) continue;
    placed.push(box);
    out.push(d);
  }
  // Same labels as last time → same array, so TextLayer sees no data change.
  if (out.length === lastLabels.length && out.every((d, i) => d === lastLabels[i])) return lastLabels;
  return (lastLabels = out);
}

const nodeRgb = (d: NodeDatum) => (d.imposes ? imposerColor(d.iso3) : NEUTRAL_COLOR);

export function nodeLayers(nodes: NodeDatum[], labels: NodeDatum[], zoom: number) {
  const scale = Math.max(0.6, Math.min(1.6, zoom / 2.2));
  return [
    new ScatterplotLayer<NodeDatum>({
      id: 'node-glow',
      data: nodes,
      getPosition: d => [d.lon, d.lat],
      radiusUnits: 'pixels',
      getRadius: d => (6 + Math.min(14, d.weight / 40)) * scale,
      getFillColor: d => withAlpha(nodeRgb(d), 40),
      pickable: false,
      updateTriggers: {getRadius: [zoom]}
    }),
    new ScatterplotLayer<NodeDatum>({
      id: 'node-core',
      data: nodes,
      getPosition: d => [d.lon, d.lat],
      radiusUnits: 'pixels',
      getRadius: 2.2 * scale,
      getFillColor: d => withAlpha(nodeRgb(d), 255),
      pickable: true,
      updateTriggers: {getRadius: [zoom]}
    }),
    new TextLayer<NodeDatum>({
      id: 'node-labels',
      data: labels,
      getPosition: d => [d.lon, d.lat],
      getText: d => d.name.toUpperCase(),
      getSize: LABEL_PX,
      sizeUnits: 'pixels',
      getColor: [226, 232, 246, 255],
      getPixelOffset: [0, -LABEL_LIFT],
      fontFamily: '"IBM Plex Mono", "SF Mono", Menlo, monospace',
      fontWeight: 600,
      characterSet: 'auto',
      outlineWidth: 4,
      outlineColor: COLORS.ocean,
      // Oversized SDF atlas so glyphs stay smooth at 12px instead of ragged.
      fontSettings: {sdf: true, fontSize: 128, buffer: 12, radius: 16, cutoff: 0.22, smoothing: 0.06},
      // Arcs are raised above the map; skip the depth test so labels always sit on top of them.
      parameters: {depthCompare: 'always'},
      pickable: false
    })
  ];
}
