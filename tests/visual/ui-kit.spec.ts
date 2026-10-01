import { expect, test } from '@playwright/test';

test('screenshots every ui-kit anchor with time frozen', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/dev/ui-kit');
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('switch', { name: 'Freeze time' }).click();
  await expect(page.locator('[data-freeze-time="true"]')).toBeVisible();

  const anchors = await page
    .locator('[data-kit-anchor]')
    .evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute('data-kit-anchor'))
        .filter((id): id is string => Boolean(id)),
    );
  expect(anchors.length).toBeGreaterThan(0);

  for (const anchor of anchors) {
    await page.goto(`/dev/ui-kit#${anchor}`);
    await expect(page.locator('[data-freeze-time="true"]')).toBeVisible();
    const section = page.locator(`[data-kit-anchor="${anchor}"]`);
    await section.scrollIntoViewIfNeeded();
    const box = await section.boundingBox();
    if (anchor.startsWith('patterns/') && box && box.height + 80 > 900) {
      await page.setViewportSize({
        width: 1600,
        height: Math.min(8000, Math.ceil(box.height + 160)),
      });
      await section.scrollIntoViewIfNeeded();
    }
    await expect(section).toHaveScreenshot(`ui-kit-${anchor}.png`);
    await page.setViewportSize({ width: 1600, height: 900 });
  }
});
