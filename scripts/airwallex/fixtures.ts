import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { redactAirwallex } from '@/server/adapters/airwallex/redact';

export const FIXTURE_DIR = path.resolve(
  process.cwd(),
  'src/server/adapters/airwallex/__fixtures__',
);

export class FixtureLog {
  async save(name: string, body: unknown, meta: Record<string, unknown> = {}): Promise<void> {
    await mkdir(FIXTURE_DIR, { recursive: true });
    const payload = redactAirwallex({ ...meta, body });
    await writeFile(
      path.join(FIXTURE_DIR, `${name}.json`),
      `${JSON.stringify(payload, null, 2)}\n`,
    );
  }
}
