/**
 * Live extraction smoke. The full template × variant gate needs the B9.7
 * invoice files. Until those exist, a set key runs one known invoice through
 * the real pipeline. Without a key, the command exits without calling the API.
 */
import { D } from '@/contracts/money';
import { billExtractor, runPipeline } from '@/server/adapters/extraction';
import { parseEnv } from '@/server/env';

const key = process.env.ANTHROPIC_API_KEY?.trim();
if (!key) {
  process.stdout.write(
    'B4.2b benchmark unchecked: ANTHROPIC_API_KEY is not set. The pipeline is covered by the mock extractor.\n',
  );
  process.exit(0);
}

const lines = [
  'Invoice',
  'Kessler Maschinenbau GmbH',
  'Berlin, Germany',
  'Invoice number: KM-2026-0147',
  'Issue date: 28 Sep 2026',
  'Due date: 28 Oct 2026',
  'Subtotal EUR 210084.03',
  'VAT 19% EUR 39915.97',
  'Amount due EUR 250000.00',
  'IBAN: DE89 3704 0044 0532 0130 00',
  'BIC: COBADEFFXXX',
];

const truth = {
  vendorName: 'Kessler Maschinenbau GmbH',
  vendorCountry: 'DE',
  invoiceNumber: 'KM-2026-0147',
  currency: 'EUR',
  amountDue: '250000.00',
  issueDate: '2026-09-28',
  dueDate: '2026-10-28',
  iban: 'DE89370400440532013000',
};

async function main() {
  const env = parseEnv(process.env);
  const started = Date.now();
  const result = await runPipeline({
    bytes: simplePdf(lines),
    mime: 'application/pdf',
    maxPages: env.EXTRACTION_MAX_PAGES,
    homeCurrency: env.HOME_CURRENCY,
    today: '2026-10-05',
    duplicate: false,
    escalate: false,
    extractor: billExtractor(env, 'extraction-smoke', () => Date.now()),
    startedAtMs: started,
    nowMs: () => Date.now(),
  });
  const got = {
    vendorName: result.vendorName.value,
    vendorCountry: result.vendorCountry.value,
    invoiceNumber: result.invoiceNumber.value,
    currency: result.currency.value,
    amountDue: result.amountDue.value,
    issueDate: result.issueDate.value,
    dueDate: result.dueDate.value,
    iban: result.bank.iban?.value ?? null,
    model: result.meta.model,
    ms: result.meta.ms,
    inputTokens: result.meta.inputTokens,
    outputTokens: result.meta.outputTokens,
    amountConfidence: result.amountDue.confidence,
    warnings: result.warnings.map((warning) => warning.code),
  };
  const misses = Object.entries(truth).filter(([field, expected]) => !same(field, got[field as keyof typeof truth], expected));
  process.stdout.write(
    `${JSON.stringify({ model: got.model, ms: got.ms, inputTokens: got.inputTokens, outputTokens: got.outputTokens, misses, got }, null, 2)}\n`,
  );
  process.stdout.write(
    'Full extraction-profile gates stay unchecked until the B9.7 invoice files exist.\n',
  );
  if (misses.length > 0) process.exit(1);
}

function same(field: string, actual: string | null | undefined, expected: string): boolean {
  if (field === 'amountDue' && actual) {
    try {
      return D(actual).eq(expected);
    } catch {
      return false;
    }
  }
  if (field === 'iban') return (actual ?? '').replaceAll(/\s+/g, '') === expected;
  return actual === expected;
}

function simplePdf(rows: string[]): Uint8Array {
  const stream = ['BT', '/F1 12 Tf', '48 740 Td', '16 TL', ...rows.flatMap((row) => [`(${row}) Tj`, 'T*']), 'ET'].join(
    '\n',
  );
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
    `4 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body));
    body += object;
  }
  const xref = Buffer.byteLength(body);
  let table = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    table += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  body += `${table}trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
