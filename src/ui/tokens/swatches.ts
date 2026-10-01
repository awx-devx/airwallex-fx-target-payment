/** Opaque and translucent tokens shown on the kit. Values match tokens.css. */

export type SwatchKind = 'surface' | 'text' | 'accent' | 'semantic';

export interface Swatch {
  name: string;
  value: string;
  kind: SwatchKind;
}

export const SWATCHES: readonly Swatch[] = [
  { name: '--bg-0', value: '#07070a', kind: 'surface' },
  { name: '--bg-1', value: '#0c0c11', kind: 'surface' },
  { name: '--bg-2', value: '#121219', kind: 'surface' },
  { name: '--bg-3', value: '#1a1a23', kind: 'surface' },
  { name: '--bg-overlay', value: 'rgba(7, 7, 10, 0.72)', kind: 'surface' },
  { name: '--line-1', value: 'rgba(255, 255, 255, 0.06)', kind: 'surface' },
  { name: '--line-2', value: 'rgba(255, 255, 255, 0.1)', kind: 'surface' },
  { name: '--line-3', value: 'rgba(255, 255, 255, 0.16)', kind: 'surface' },
  { name: '--fg-1', value: '#f4f4f6', kind: 'text' },
  { name: '--fg-2', value: '#a6a6b3', kind: 'text' },
  { name: '--fg-3', value: '#6b6b78', kind: 'text' },
  { name: '--fg-4', value: '#45454f', kind: 'text' },
  { name: '--orange-300', value: '#ffb27a', kind: 'accent' },
  { name: '--orange-400', value: '#ff914d', kind: 'accent' },
  { name: '--orange-500', value: '#ff6a1a', kind: 'accent' },
  { name: '--orange-600', value: '#e5520a', kind: 'accent' },
  { name: '--orange-glow', value: 'rgba(255, 106, 26, 0.45)', kind: 'accent' },
  { name: '--orange-wash', value: 'rgba(255, 106, 26, 0.08)', kind: 'accent' },
  { name: '--up', value: '#2bd9a0', kind: 'semantic' },
  { name: '--up-wash', value: 'rgba(43, 217, 160, 0.1)', kind: 'semantic' },
  { name: '--down', value: '#ff4d6a', kind: 'semantic' },
  { name: '--down-wash', value: 'rgba(255, 77, 106, 0.1)', kind: 'semantic' },
  { name: '--warn', value: '#ffc24b', kind: 'semantic' },
  { name: '--warn-wash', value: 'rgba(255, 194, 75, 0.1)', kind: 'semantic' },
  { name: '--info', value: '#6ea8ff', kind: 'semantic' },
  { name: '--muted', value: '#6b6b78', kind: 'semantic' },
];

export const BG_1 = '#0c0c11';
export const FG_1 = '#f4f4f6';

export function swatchValue(name: string): string {
  const swatch = SWATCHES.find((item) => item.name === name);
  if (!swatch) throw new Error(`Unknown swatch: ${name}`);
  return swatch.value;
}
