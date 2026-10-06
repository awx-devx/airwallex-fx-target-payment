import { describe, expect, it } from 'vitest';
import { dateLabelRows, labelAnchor } from '@/ui/chart/primitives/overlays';

describe('date labels', () => {
  it('stacks the due caption when the lines are closer than the wider label', () => {
    const rows = dateLabelRows(800, 812, 120, 90, true);
    expect(rows.deadlineY).toBe(14);
    expect(rows.dueY).toBe(28);
  });

  it('keeps both captions on one row when the dates are far apart', () => {
    const rows = dateLabelRows(200, 500, 120, 90, true);
    expect(rows.deadlineY).toBe(14);
    expect(rows.dueY).toBe(14);
  });

  it('places a caption to the left of its line when the right side would leave the pane', () => {
    const place = labelAnchor(900, 120, 940, 14);
    expect(place.x).toBe(900 - 120 - 6);
    expect(place.y).toBe(14);
  });

  it('places a caption to the right when it fits', () => {
    expect(labelAnchor(100, 80, 940, 14).x).toBe(106);
  });
});
