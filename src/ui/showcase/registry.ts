import type { Showcase } from '@/ui/showcase/types';
import { actionShowcases } from '@/ui/primitives/showcase/actions';
import { feedbackShowcases } from '@/ui/primitives/showcase/feedback';
import { fieldShowcases } from '@/ui/primitives/showcase/fields';
import { fileShowcases } from '@/ui/primitives/showcase/files';
import { layoutShowcases } from '@/ui/primitives/showcase/layout';
import { overlayShowcases } from '@/ui/primitives/showcase/overlays';
import { pickerShowcases } from '@/ui/primitives/showcase/pickers';
import { statusShowcases } from '@/ui/primitives/showcase/status';
import { tokensShowcase } from '@/ui/tokens/showcase';

/** Each component adds its showcase export to this list. */
export const showcases: Showcase[] = [
  tokensShowcase,
  ...actionShowcases,
  ...fieldShowcases,
  ...pickerShowcases,
  ...statusShowcases,
  ...overlayShowcases,
  ...layoutShowcases,
  ...feedbackShowcases,
  ...fileShowcases,
];
