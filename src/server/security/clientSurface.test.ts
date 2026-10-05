import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../../..');
const SECRET =
  /AIRWALLEX_API_KEY|AIRWALLEX_CLIENT_ID|AIRWALLEX_WEBHOOK_SECRET|ANTHROPIC_API_KEY|MONGODB_URI|REDIS_URL|REDIS_PASSWORD/;

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('client surface', () => {
  it('keeps secrets out of the browser code', () => {
    const hits: string[] = [];
    for (const file of [
      ...filesUnder(path.join(root, 'src/features')),
      ...filesUnder(path.join(root, 'src/ui')),
    ]) {
      const text = readFileSync(file, 'utf8');
      if (SECRET.test(text)) hits.push(path.relative(root, file));
    }
    expect(hits).toEqual([]);
  });

  it('exposes only the data-source flag to the browser', () => {
    const found = new Set<string>();
    for (const file of filesUnder(path.join(root, 'src'))) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g))
        found.add(match[0]);
    }
    expect([...found]).toEqual(['NEXT_PUBLIC_DATA_SOURCE']);
  });
});
