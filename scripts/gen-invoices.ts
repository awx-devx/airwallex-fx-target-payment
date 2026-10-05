import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateSnapshot } from '@/mocks/generators/snapshot';
import type { ProfileName } from '@/mocks/generators/profiles';
import { PROFILE_NAMES } from '@/mocks/generators/profiles';
import { textPdf } from './generate/pdf';

/**
 * DEMO-ONLY: writes truth JSON and a one-page text PDF. Playwright templates and scanned images are not rendered.
 * PROD: real vendor documents only.
 */

function flag(name: string): string | boolean | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const next = process.argv[index + 1];
  if (!next || next.startsWith('--')) return true;
  return next;
}

async function main(): Promise<number> {
  const profileName = String(flag('profile') ?? 'extraction');
  if (!PROFILE_NAMES.includes(profileName as ProfileName)) {
    process.stderr.write(`Unknown profile ${profileName}\n`);
    return 1;
  }
  const seed = Number(flag('seed') ?? 1);
  const out = path.resolve(
    process.cwd(),
    String(flag('out') ?? 'generated/invoices'),
  );
  const snapshot = generateSnapshot({
    seed,
    profile: profileName as ProfileName,
  });
  await mkdir(out, { recursive: true });
  for (const invoice of snapshot.invoices) {
    const base = path.join(out, `${invoice.invoiceNumber}-${invoice.index}`);
    await writeFile(
      `${base}.truth.json`,
      `${JSON.stringify(invoice, null, 2)}\n`,
    );
    await writeFile(
      `${base}.pdf`,
      textPdf([
        invoice.vendor.name,
        invoice.invoiceNumber,
        `${invoice.currency} ${invoice.total}`,
        `Issued ${invoice.issueDate}`,
        `Due ${invoice.dueDate}`,
        invoice.template,
        invoice.variant,
      ]),
    );
  }
  process.stdout.write(
    `Wrote ${snapshot.invoices.length} invoices to ${out}\n`,
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'gen:invoices failed'}\n`,
    );
    process.exit(1);
  },
);
