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
import { chartPartShowcases } from '@/ui/chart/showcase/parts';
import { chartScenarioShowcases } from '@/ui/chart/showcase/scenarios';
import { bookShowcases } from '@/ui/trading/showcase/books';
import { marketShowcases } from '@/ui/trading/showcase/market';
import { statusShowcases as tradingStatusShowcases } from '@/ui/trading/showcase/status';

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
  ...marketShowcases,
  ...bookShowcases,
  ...tradingStatusShowcases,
  ...chartPartShowcases,
  ...chartScenarioShowcases,
];
