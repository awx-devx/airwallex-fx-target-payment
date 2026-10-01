/**
 * WCAG 2 contrast ratio for two opaque hex colours (`#rrggbb`).
 * Used by the tokens showcase so the listed ratios stay computed, not copied.
 */

const HEX = /^#([\da-f]{6})$/i;

function parseHex(color: string): [number, number, number] {
  const match = HEX.exec(color.trim());
  if (!match?.[1]) throw new Error(`Expected #rrggbb, got ${color}`);
  const hex = match[1];
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  const [r, g, b] = parseHex(color);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground: string, background: string): number {
  const fg = luminance(foreground);
  const bg = luminance(background);
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

export function formatContrast(ratio: number): string {
  return `${ratio.toFixed(2)}:1`;
}

/** Body text minimum from docs/05 §9. Labels may sit below it. */
export const BODY_CONTRAST = 4.5;
