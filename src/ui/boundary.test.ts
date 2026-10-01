import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');

async function lint(filePath: string, code: string) {
  const eslint = new ESLint({ cwd: root });
  const [result] = await eslint.lintText(code, {
    filePath: path.join(root, filePath),
  });
  return (
    result?.messages.filter(
      (message) => message.ruleId === 'no-restricted-imports',
    ) ?? []
  );
}

describe('src/ui import boundary', () => {
  it('rejects server, feature, mock, and data-library imports', async () => {
    const file = 'src/ui/primitives/example.tsx';
    for (const source of [
      '@/server/domain/stateMachine',
      '@/features/bills/useBills',
      '@/mocks/fixtures',
      '../../server/clock',
      'zustand',
      '@tanstack/react-query',
    ]) {
      const messages = await lint(file, `import x from '${source}';\n`);
      expect(messages, source).not.toHaveLength(0);
    }
  });

  it('rejects a higher UI layer', async () => {
    const messages = await lint(
      'src/ui/primitives/example.tsx',
      `import { Price } from '@/ui/trading/price';\n`,
    );
    expect(messages).not.toHaveLength(0);
  });

  it('allows contracts and a fixture importing mocks', async () => {
    const contracts = await lint(
      'src/ui/primitives/example.tsx',
      `import type { BillSummary } from '@/contracts/bill';\nexport type { BillSummary };\n`,
    );
    expect(contracts).toHaveLength(0);
    const fixture = await lint(
      'src/ui/primitives/example.fixtures.ts',
      `import { bills } from '@/mocks/fixtures';\nexport const fixtureBills = bills;\n`,
    );
    expect(fixture).toHaveLength(0);
    const fixtureServer = await lint(
      'src/ui/primitives/example.fixtures.ts',
      `import x from '@/server/domain/stateMachine';\n`,
    );
    expect(fixtureServer).not.toHaveLength(0);
  });
});
