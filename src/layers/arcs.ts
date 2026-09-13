import {ArcLayer, type ArcLayerProps} from '@deck.gl/layers';
import type {ShaderModule} from '@luma.gl/shadertools';
import type {Arc} from '../data/types';

/*
 * FlowArcLayer — ArcLayer with "comet" particles travelling source→target.
 *
 * The stock arc vertex shader already exports `uv.x` = 0 at the source and 1 at
 * the target. In the fragment shader we place `density` comet heads along the
 * arc, moving with `time`, and fade each fragment by its distance behind the
 * nearest head. A per-arc phase offset keeps the arcs from pulsing in unison.
 */

const uniformBlock = /* glsl */ `\
uniform flowUniforms {
  float time;
  float tail;
  float headGlow;
} flow;
`;

type FlowProps = {time: number; tail: number; headGlow: number};

const flowUniforms = {
  name: 'flow',
  vs: uniformBlock,
  fs: uniformBlock,
  uniformTypes: {time: 'f32', tail: 'f32', headGlow: 'f32'}
} as const satisfies ShaderModule<FlowProps>;

export type FlowArcLayerProps<D = Arc> = ArcLayerProps<D> & {
  /** Seconds; advance every frame. */
  time?: number;
  /** Tail length as a fraction of the spacing between comets (0..1). */
  tail?: number;
  /** Extra brightness at the comet head. */
  headGlow?: number;
  getPhase?: (d: D) => number;
  /** Comets per arc. */
  getDensity?: (d: D) => number;
  /** Arc-lengths per second. */
  getSpeed?: (d: D) => number;
};

export class FlowArcLayer<D = Arc> extends ArcLayer<D, FlowArcLayerProps<D>> {
  static override layerName = 'FlowArcLayer';
  static override defaultProps = {
    ...ArcLayer.defaultProps,
    time: {type: 'number', value: 0},
    tail: {type: 'number', value: 0.35},
    headGlow: {type: 'number', value: 1.6},
    getPhase: {type: 'accessor', value: 0},
    getDensity: {type: 'accessor', value: 2},
    getSpeed: {type: 'accessor', value: 0.25}
  };

  override getShaders() {
    const shaders = super.getShaders();
    shaders.inject = {
      ...shaders.inject,
      'vs:#decl': /* glsl */ `
        in float instancePhase;
        in float instanceDensity;
        in float instanceSpeed;
        out float vPhase;
        out float vDensity;
        out float vSpeed;
      `,
      'vs:#main-end': /* glsl */ `
        vPhase = instancePhase;
        vDensity = instanceDensity;
        vSpeed = instanceSpeed;
      `,
      'fs:#decl': /* glsl */ `
        in float vPhase;
        in float vDensity;
        in float vSpeed;
      `,
      'fs:DECKGL_FILTER_COLOR': /* glsl */ `
        // Distance (in comet-spacings) behind the nearest head, 0 = at the head.
        float head = flow.time * vSpeed + vPhase;
        float d = fract((head - geometry.uv.x) * vDensity);
        float body = exp(-d / max(flow.tail, 0.01)) * (1.0 - smoothstep(0.85, 1.0, d));
        float glow = 1.0 + flow.headGlow * exp(-d * 40.0);
        color.rgb *= glow;
        color.a *= body;
      `
    };
    shaders.modules = [...shaders.modules, flowUniforms];
    return shaders;
  }

  override initializeState() {
    super.initializeState();
    this.getAttributeManager()!.addInstanced({
      instancePhase: {size: 1, accessor: 'getPhase'},
      instanceDensity: {size: 1, accessor: 'getDensity'},
      instanceSpeed: {size: 1, accessor: 'getSpeed'}
    });
  }

  override draw(params: any) {
    const {time, tail, headGlow} = this.props as Required<FlowArcLayerProps<D>>;
    this.setShaderModuleProps({flow: {time, tail, headGlow}});
    super.draw(params);
  }
}
