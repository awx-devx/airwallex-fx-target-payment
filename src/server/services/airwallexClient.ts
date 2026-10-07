import { getAirwallexClient } from '@/server/adapters/airwallex/client';
import type { AirwallexClient } from '@/server/adapters/airwallex/client';
import type { Env } from '@/server/env';
import { ServiceError } from '@/server/services/errors';

export function requireAirwallex(env: Env): AirwallexClient {
  if (!env.AIRWALLEX_CLIENT_ID || !env.AIRWALLEX_API_KEY) {
    throw new ServiceError(
      'AIRWALLEX_CONFIG',
      'Airwallex credentials are not set',
      503,
    );
  }
  return getAirwallexClient(env);
}
