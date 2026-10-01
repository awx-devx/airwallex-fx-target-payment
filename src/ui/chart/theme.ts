export interface ChartColors {
  fg1: string;
  fg2: string;
  fg3: string;
  line1: string;
  line2: string;
  line3: string;
  orange: string;
  orange300: string;
  orangeWash: string;
  up: string;
  down: string;
  warn: string;
  info: string;
  bg0: string;
}

export function readChartColors(element: Element = document.documentElement): ChartColors {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    fg1: token('--fg-1'),
    fg2: token('--fg-2'),
    fg3: token('--fg-3'),
    line1: token('--line-1'),
    line2: token('--line-2'),
    line3: token('--line-3'),
    orange: token('--orange-500'),
    orange300: token('--orange-300'),
    orangeWash: token('--orange-wash'),
    up: token('--up'),
    down: token('--down'),
    warn: token('--warn'),
    info: token('--info'),
    bg0: token('--bg-0'),
  };
}

/** Apply an alpha to a hex token. Other color strings are returned unchanged. */
export function withAlpha(color: string, alpha: number): string {
  const hex = /^#([\da-f]{6})$/i.exec(color.trim());
  if (!hex?.[1]) return color;
  const value = hex[1];
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
