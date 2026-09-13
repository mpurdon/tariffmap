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

export function imposerColor(iso3: string): [number, number, number] {
  return IMPOSER_COLORS[iso3] ?? OTHER_COLOR;
}
export function imposerCss(iso3: string): string {
  const [r, g, b] = imposerColor(iso3);
  return `rgb(${r} ${g} ${b})`;
}
