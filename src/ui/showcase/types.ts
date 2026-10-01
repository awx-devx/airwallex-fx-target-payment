import type { ReactNode } from 'react';

export const KIT_GROUPS = [
  {
    id: 'tokens',
    title: 'Tokens',
    description: 'Colour, type, spacing, and motion.',
  },
  {
    id: 'primitives',
    title: 'Primitives',
    description: 'Buttons, inputs, overlays, and feedback.',
  },
  {
    id: 'trading',
    title: 'Trading',
    description: 'Prices, positions, and ticket controls.',
  },
  {
    id: 'chart',
    title: 'Chart',
    description: 'The rate chart and its overlay primitives.',
  },
  {
    id: 'patterns',
    title: 'Patterns',
    description: 'Composed terminal surfaces.',
  },
] as const;

export type KitGroupId = (typeof KIT_GROUPS)[number]['id'];

export interface ShowcaseSection {
  id: string;
  title: string;
  description?: string;
  render: () => ReactNode;
}

/** One component's block on /dev/ui-kit. Sections become deep-link anchors. */
export interface Showcase {
  id: string;
  group: KitGroupId;
  title: string;
  description?: string;
  importPath?: string;
  sections: ShowcaseSection[];
}

export function kitAnchor(group: string, id?: string): string {
  return id ? `${group}/${id}` : group;
}
