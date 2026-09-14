import {ScatterplotLayer, TextLayer} from '@deck.gl/layers';
import type {Viewport} from '@deck.gl/core';
import type {Endpoint} from '../data/types';
import {imposerColor, NEUTRAL_COLOR, withAlpha} from '../data/palette';

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
    const w = d.name.length * 6.6 + 8, h = 14;
    const box = {x0: x - w / 2, x1: x + w / 2, y0: y - 13 - h, y1: y - 13 + 4};
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
      getSize: 10.5,
      sizeUnits: 'pixels',
      getColor: [196, 204, 224, 220],
      getPixelOffset: [0, -13],
      fontFamily: '"IBM Plex Mono", "SF Mono", Menlo, monospace',
      fontWeight: 500,
      characterSet: 'auto',
      outlineWidth: 2,
      outlineColor: [9, 13, 26, 230],
      fontSettings: {sdf: true},
      pickable: false
    })
  ];
}
