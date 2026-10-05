import type { BillState } from '@/contracts/bill';
import { BILL_STATES } from '@/contracts/bill';
import { SystemClock } from '@/server/adapters/clock';
import { connectMongo, disconnectMongo } from '@/server/db/connection';
import { syncAllIndexes } from '@/server/db/indexes';
import { EnvError, parseEnv } from '@/server/env';
import { seedGenerated } from '@/server/services/seed';
import { PROFILE_NAMES, type ProfileName } from '@/mocks/generators/profiles';

function flag(name: string): string | boolean | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const next = process.argv[index + 1];
  if (!next || next.startsWith('--')) return true;
  return next;
}

async function main(): Promise<number> {
  const profileName = String(flag('profile') ?? 'mixed');
  if (!PROFILE_NAMES.includes(profileName as ProfileName)) {
    process.stderr.write(`Unknown profile ${profileName}\n`);
    return 1;
  }
  if (flag('via')) {
    process.stderr.write(
      'seed:generate uses the direct path. Upload seeding is not wired.\n',
    );
    return 1;
  }
  if (flag('due-in')) {
    process.stderr.write('seed:generate uses the profile due dates.\n');
    return 1;
  }
  const gateway = flag('gateway');
  if (gateway === 'airwallex') {
    process.stderr.write(
      'Sandbox lifecycle ids wait for credentials. Use --gateway mock.\n',
    );
    return 1;
  }
  try {
    const env = parseEnv(process.env);
    await connectMongo(env.MONGODB_URI);
    await syncAllIndexes(env.RATE_TICKS_TTL_DAYS);
    const states =
      typeof flag('states') === 'string'
        ? String(flag('states')).split(',')
        : undefined;
    if (states?.some((state) => !BILL_STATES.includes(state as BillState))) {
      process.stderr.write('Unknown bill state\n');
      return 1;
    }
    const result = await seedGenerated({
      env,
      clock: new SystemClock(),
      profile: profileName as ProfileName,
      ...(typeof flag('seed') === 'string'
        ? { seed: Number(flag('seed')) }
        : {}),
      ...(typeof flag('count') === 'string'
        ? { count: Number(flag('count')) }
        : {}),
      ...(typeof flag('currencies') === 'string'
        ? { currencies: String(flag('currencies')).split(',') }
        : {}),
      ...(states ? { states: states as BillState[] } : {}),
      dryRun: flag('dry-run') === true,
    });
    process.stdout.write(
      `${result.batchId} created ${result.created}, skipped ${result.skipped}\n${result.plan
        .map(
          (bill) =>
            `${bill.seedKey} ${bill.state} ${bill.currency} ${bill.amount}`,
        )
        .join('\n')}\n`,
    );
    return 0;
  } catch (error) {
    if (error instanceof EnvError) process.stderr.write(`${error.message}\n`);
    else
      process.stderr.write(
        `${error instanceof Error ? error.message : 'seed:generate failed'}\n`,
      );
    return 1;
  } finally {
    await disconnectMongo();
  }
}

main().then(
  (code) => process.exit(code),
  () => process.exit(1),
);
