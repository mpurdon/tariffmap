import {ArcLayer, ScatterplotLayer, type ArcLayerProps, type ScatterplotLayerProps} from '@deck.gl/layers';
import type {ShaderModule} from '@luma.gl/shadertools';
import type {RGB} from '../data/palette';

/*
 * Import bans get their own, angrier treatment than tariffs: where a tariff arc
 * carries smooth comets, a ban arc is a strobing hazard line — fast marching
 * bars over a throbbing glow with a ragged, crackling edge — and the country it
 * hits is ringed by expanding shockwaves.
 */

/** Alarm red, deliberately outside the imposer palette so a ban never reads as "just another tariff". */
export const BAN_COLOR: RGB = [255, 48, 40];

const uniformBlock = /* glsl */ `\
uniform banUniforms {
  float time;
  float barPx;
} ban;
`;

type BanProps = {time: number; barPx: number};

const banUniforms = {
  name: 'ban',
  vs: uniformBlock,
  fs: uniformBlock,
  uniformTypes: {time: 'f32', barPx: 'f32'}
} as const satisfies ShaderModule<BanProps>;

/** Pulse that spikes twice in quick succession then rests — a racing heartbeat. */
const heartbeat = /* glsl */ `
  float beat(float t) {
    float p = fract(t * 1.4);
    return exp(-pow((p - 0.08) * 22.0, 2.0)) + 0.7 * exp(-pow((p - 0.26) * 22.0, 2.0));
  }
`;

export type BanArcLayerProps<D> = ArcLayerProps<D> & {
  /** Animation clock in seconds, read on every draw. */
  clock?: () => number;
  /** Hazard bar spacing in screen pixels; 0 draws the throbbing glow instead. */
  barPx?: number;
};

export class BanArcLayer<D> extends ArcLayer<D, BanArcLayerProps<D>> {
  static override layerName = 'BanArcLayer';
  static override defaultProps = {
    ...ArcLayer.defaultProps,
    clock: {type: 'function', value: () => 0},
    barPx: {type: 'number', value: 0}
  };

  override getShaders() {
    const shaders = super.getShaders();
    shaders.inject = {
      ...shaders.inject,
      // Screen length of the arc, so bars and tears are spaced in pixels: a short
      // arc zoomed out gets a few clean bars instead of dozens of sub-pixel ones.
      'vs:#decl': /* glsl */ `
        out float vLenPx;
      `,
      'vs:#main-end': /* glsl */ `
        vec4 a = project_common_position_to_clipspace(vec4(project_position(instanceSourcePositions, instanceSourcePositions64Low), 1.0));
        vec4 b = project_common_position_to_clipspace(vec4(project_position(instanceTargetPositions, instanceTargetPositions64Low), 1.0));
        // Chord length in CSS pixels, padded for the arc's bow.
        vec2 ndc = a.xy / a.w - b.xy / b.w;
        vLenPx = 1.15 * length(ndc * 0.5 * project.viewportSize) / project.devicePixelRatio;
      `,
      'fs:#decl': /* glsl */ `
        in float vLenPx;
        ${heartbeat}
      `,
      'fs:DECKGL_FILTER_COLOR': /* glsl */ `
        float u = geometry.uv.x;
        float px = u * vLenPx;
        float t = ban.time;
        // Irregular flicker, like a failing neon tube.
        float crackle = 0.5 + 0.5 * sin(t * 37.0 + px * 0.35) * sin(t * 23.0 - px * 0.2);
        if (ban.barPx > 0.5) {
          // Hazard bars racing toward the target at ~2 bars a second.
          float s = fract(px / ban.barPx - t * 2.2);
          float bar = smoothstep(0.0, 0.05, s) * (1.0 - smoothstep(0.42, 0.47, s));
          // Hazard tape: hot red bars on a near-black band, the bar's leading edge white-hot.
          float hot = smoothstep(0.3, 0.45, s) * bar;
          color.rgb = mix(vec3(0.16, 0.0, 0.0), mix(color.rgb, vec3(1.0, 0.85, 0.7), hot * 0.6), bar);
          color.a *= mix(0.6, 1.0, bar) * (0.8 + 0.2 * crackle);
        } else {
          // Glow whose edge is torn and re-torn every frame instead of smooth.
          float jag = 0.35 + 0.45 * fract(sin(floor(px / 6.0) * 12.9898 + floor(t * 18.0) * 78.233) * 43758.5453);
          float edge = 1.0 - smoothstep(jag, jag + 0.2, abs(geometry.uv.y));
          color.a *= edge * (0.35 + 0.65 * beat(t)) * (0.7 + 0.3 * crackle);
        }
      `
    };
    shaders.modules = [...shaders.modules, banUniforms];
    return shaders;
  }

  override draw(params: any) {
    const {clock, barPx} = this.props as Required<BanArcLayerProps<D>>;
    this.setShaderModuleProps({ban: {time: clock(), barPx}});
    super.draw(params);
  }
}

export type BanRingLayerProps<D> = ScatterplotLayerProps<D> & {clock?: () => number};

/** Shockwaves expanding out of each banned country, timed to the arcs' heartbeat. */
export class BanRingLayer<D> extends ScatterplotLayer<D, BanRingLayerProps<D>> {
  static override layerName = 'BanRingLayer';
  static override defaultProps = {
    ...ScatterplotLayer.defaultProps,
    clock: {type: 'function', value: () => 0}
  };

  override getShaders() {
    const shaders = super.getShaders();
    shaders.inject = {
      ...shaders.inject,
      'fs:DECKGL_FILTER_COLOR': /* glsl */ `
        float r = length(geometry.uv);
        float k = 0.0;
        for (int i = 0; i < 3; i++) {
          float p = fract(ban.time * 0.7 + float(i) / 3.0);
          k += exp(-pow((r - p) * 10.0, 2.0)) * (1.0 - p) * (1.0 - p);
        }
        color.a *= min(1.0, k * 1.6);
      `
    };
    shaders.modules = [...shaders.modules, banUniforms];
    return shaders;
  }

  override draw(params: any) {
    const {clock} = this.props as Required<BanRingLayerProps<D>>;
    this.setShaderModuleProps({ban: {time: clock(), barPx: 0}});
    super.draw(params);
  }
}
