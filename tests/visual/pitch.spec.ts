import { expect, test } from '@playwright/test';

const FRAMES = [
  ['chart/scenario-hit', 'target-hit'],
  ['patterns/positions-panel', 'positions'],
  ['primitives/empty', 'empty'],
  ['primitives/toast', 'toasts'],
] as const;

test('pitch frames', async ({ page }) => {
  test.skip(process.env.PITCH_SHOTS !== '1', 'Run with PITCH_SHOTS=1 to write docs/pitch');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dev/ui-kit');
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('switch', { name: 'Freeze time' }).click();
  await page.getByRole('button', { name: '1440' }).click();
  await expect(page.locator('[data-freeze-time="true"]')).toBeVisible();

  for (const [anchor, name] of FRAMES) {
    const section = page.locator(`[data-kit-anchor="${anchor}"]`);
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();
    await section.screenshot({ path: `docs/pitch/${name}.png` });
  }
});
