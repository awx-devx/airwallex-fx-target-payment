import type { ChartMarkerKind } from '@/contracts/chart';

export interface PlotMarker {
  time: number;
  kind: ChartMarkerKind;
  price: number;
  text: string;
}

const TEXT: Record<ChartMarkerKind, string> = {
  ARMED: '',
  NEAR_MISS: '',
  TARGET_HIT: '',
  EXECUTED: '✓',
  AUTOSETTLE: '⚡',
  // DEMO-ONLY: simulation flags exist only for the Simulate run.
  // PROD: the chart has no simulation markers.
  SIM_START: 'SIM',
  SIM_END: 'SIM',
};

export function markerText(kind: ChartMarkerKind): string {
  return TEXT[kind];
}

/** Collapse markers whose times land within `gapPx` of each other. */
export function clusterMarkers(
  markers: readonly PlotMarker[],
  xOf: (time: number) => number | null,
  gapPx = 14,
): PlotMarker[] {
  const sorted = [...markers].sort((left, right) => left.time - right.time);
  const groups: PlotMarker[][] = [];
  for (const marker of sorted) {
    const x = xOf(marker.time);
    const group = groups[groups.length - 1];
    const previous = group?.[0];
    const previousX = previous ? xOf(previous.time) : null;
    if (
      group &&
      previous &&
      x !== null &&
      previousX !== null &&
      Math.abs(x - previousX) <= gapPx
    ) {
      group.push(marker);
    } else {
      groups.push([marker]);
    }
  }
  return groups.map((group) => {
    const top = group[group.length - 1] ?? group[0];
    if (!top) return top;
    if (group.length === 1) return { ...top, text: top.text || markerText(top.kind) };
    return { ...top, text: String(group.length) };
  });
}
