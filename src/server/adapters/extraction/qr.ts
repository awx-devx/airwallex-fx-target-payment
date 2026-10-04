import type { ExtractedField } from '@/contracts/extraction';
import { taken } from '@/server/adapters/extraction/fields';

export interface QrPayment {
  iban?: ExtractedField;
  bic?: ExtractedField;
  accountName?: ExtractedField;
  amount?: ExtractedField;
  currency?: ExtractedField;
  reference?: ExtractedField;
}

/** EPC069-12 (SEPA GiroCode) and Swiss QR-bill payloads. Image bytes are decoded separately. */
export function parsePaymentQr(payload: string): QrPayment | undefined {
  const text = payload.replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
  if (text.startsWith('BCD')) return parseEpc(text);
  if (text.startsWith('SPC')) return parseSwiss(text);
  return undefined;
}

export async function decodeQrImages(pages: Uint8Array[]): Promise<string[]> {
  if (pages.length === 0) return [];
  const { readBarcodes } = await import('zxing-wasm/reader');
  const texts: string[] = [];
  for (const page of pages) {
    const results = await readBarcodes(page, { formats: ['QRCode'], tryHarder: true });
    for (const result of results) {
      if (result.text) texts.push(result.text);
    }
  }
  return texts;
}

function parseEpc(payload: string): QrPayment | undefined {
  const lines = payload.split('\n');
  if (lines[3] !== 'SCT') return undefined;
  const amount = lines[7] ?? '';
  const currency = amount.slice(0, 3);
  const major = amount.slice(3);
  return compact({
    bic: field(lines[4]),
    accountName: field(lines[5]),
    iban: field(lines[6]?.replaceAll(/\s+/g, '')),
    currency: field(currency),
    amount: field(major),
    reference: field(lines[10] || lines[9]),
  });
}

function parseSwiss(payload: string): QrPayment | undefined {
  const lines = payload.split('\n').map((line) => line.trim());
  const iban = lines.find((line) => /^[A-Z]{2}\d{2}[A-Z0-9]{10,}$/.test(line.replaceAll(/\s+/g, '')));
  const currencyIndex = lines.findIndex((line) => line === 'CHF' || line === 'EUR');
  const amount = currencyIndex > 0 ? lines[currencyIndex - 1] : undefined;
  const name = lines[5];
  return compact({
    iban: field(iban?.replaceAll(/\s+/g, '')),
    accountName: field(name),
    currency: field(currencyIndex >= 0 ? lines[currencyIndex] : undefined),
    amount: field(amount && /^\d+(\.\d+)?$/.test(amount) ? amount : undefined),
    reference: field(lines.find((line, index) => index > currencyIndex && line.length > 10 && /^\d+$/.test(line))),
  });
}

function field(value: string | undefined): ExtractedField | undefined {
  if (!value || value.trim().length === 0) return undefined;
  return taken(value.trim(), 'qr');
}

function compact(payment: QrPayment): QrPayment {
  return Object.fromEntries(Object.entries(payment).filter(([, value]) => value)) as QrPayment;
}
