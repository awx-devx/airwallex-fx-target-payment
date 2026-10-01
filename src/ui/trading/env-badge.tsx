import { Badge } from '@/ui/primitives/badge';

const LABEL = {
  SANDBOX: 'SANDBOX',
  PRODUCTION: 'PRODUCTION',
  DEMO: 'DEMO · SIMULATED MARKET',
} as const;

export function EnvBadge({ env }: { env: keyof typeof LABEL }) {
  return (
    <Badge tone={env === 'PRODUCTION' ? 'neutral' : 'orange'} appearance="outline">
      {LABEL[env]}
    </Badge>
  );
}
