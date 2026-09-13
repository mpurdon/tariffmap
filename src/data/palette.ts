/** Categorical palette (validated for CVD on the dark map surface). Fixed slot order — never cycled. */
export const IMPOSER_COLORS: Record<string, [number, number, number]> = {
  USA: [57, 135, 229],   // blue
  CHN: [217, 89, 38],    // orange
  CAN: [25, 158, 112],   // aqua
  EUN: [201, 133, 0],    // yellow
  MEX: [213, 81, 129],   // magenta
  IND: [144, 133, 233]   // violet
};
export const OTHER_COLOR: [number, number, number] = [150, 156, 170];
/** Nodes that only receive tariffs. */
export const NEUTRAL_COLOR: [number, number, number] = [230, 236, 250];

export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

export const rgbCss = (c: RGB | RGBA) => `rgb(${c[0]} ${c[1]} ${c[2]})`;
export const withAlpha = (c: RGB, alpha: number): RGBA => [c[0], c[1], c[2], alpha];

export function imposerColor(iso3: string): RGB {
  return IMPOSER_COLORS[iso3] ?? OTHER_COLOR;
}
export const imposerCss = (iso3: string) => rgbCss(imposerColor(iso3));
