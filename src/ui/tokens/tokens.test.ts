import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BODY_CONTRAST,
  contrastRatio,
  formatContrast,
} from '@/ui/tokens/contrast';
import { BG_1, FG_1, SWATCHES } from '@/ui/tokens/swatches';

const css = readFileSync(
  path.resolve(import.meta.dirname, 'tokens.css'),
  'utf8',
);

describe('tokens.css', () => {
  it('defines every showcase swatch', () => {
    for (const swatch of SWATCHES) {
      expect(css, swatch.name).toContain(`${swatch.name}: ${swatch.value};`);
    }
  });

  it('defines the glow pulse and the number-tween duration', () => {
    expect(css).toContain('@keyframes glow-pulse');
    expect(css).toContain('--dur-tween: 300ms;');
    expect(css).toContain('.glow-pulse-strong');
  });
});

describe('contrastRatio', () => {
  it('matches the black-on-white reference and the body-text bar', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(formatContrast(21)).toBe('21.00:1');
    expect(contrastRatio(FG_1, BG_1)).toBeGreaterThanOrEqual(BODY_CONTRAST);
    expect(contrastRatio('#a6a6b3', BG_1)).toBeGreaterThanOrEqual(
      BODY_CONTRAST,
    );
    expect(contrastRatio('#6b6b78', BG_1)).toBeLessThan(BODY_CONTRAST);
    expect(contrastRatio('#45454f', BG_1)).toBeLessThan(BODY_CONTRAST);
  });

  it('rejects a non-hex colour', () => {
    expect(() => contrastRatio('red', '#000000')).toThrow(/#rrggbb/);
  });
});
