import { CURRENCIES } from '@/contracts/currencies';
import type { ExtractedField, HighlightBox } from '@/contracts/extraction';

export interface TextItemBox {
  page: number;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextCandidates {
  ibans: string[];
  bics: string[];
  ifscs: string[];
  sortCodes: string[];
  currencies: string[];
}

const CURRENCY_CODES = new Set(CURRENCIES.map((currency) => currency.code));
const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;
const BIC = /\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g;
const IFSC = /\b[A-Z]{4}0[A-Z0-9]{6}\b/g;
const SORT = /\b\d{2}-?\d{2}-?\d{2}\b/g;

export function textCandidates(items: readonly TextItemBox[]): TextCandidates {
  const blob = items.map((item) => item.text).join(' ');
  return {
    ibans: unique(blob.match(IBAN) ?? []),
    bics: unique(blob.match(BIC) ?? []),
    ifscs: unique(blob.match(IFSC) ?? []),
    sortCodes: unique((blob.match(SORT) ?? []).map((code) => code.replaceAll('-', ''))),
    currencies: unique(
      blob
        .split(/[^A-Z]+/)
        .filter((token) => CURRENCY_CODES.has(token)),
    ),
  };
}

/**
 * Text-layer candidates cross-check the model. They do not replace a value.
 * A disagreement lowers confidence and records the reason.
 */
export function crossCheck(field: ExtractedField | undefined, candidates: readonly string[], label: string): ExtractedField | undefined {
  if (!field?.value || candidates.length === 0) return field;
  const value = field.value.replaceAll(/[\s-]/g, '').toUpperCase();
  if (candidates.some((candidate) => candidate.replaceAll(/[\s-]/g, '').toUpperCase() === value)) return field;
  return {
    ...field,
    confidence: field.confidence === 'high' ? 'medium' : field.confidence,
    reasons: [...(field.reasons ?? []), `text layer shows a different ${label}`],
  };
}

/** Fuzzy-match evidence against the text items on its page. Coordinates stay page-relative, 0..1. */
export function boxesFor(field: ExtractedField | undefined, items: readonly TextItemBox[]): HighlightBox[] | undefined {
  const evidence = field?.evidence;
  if (!evidence || evidence.text.trim().length === 0) return undefined;
  const needle = normalise(evidence.text);
  const pageItems = items.filter((item) => item.page === evidence.page && item.text.trim().length > 0);
  const hits = pageItems.filter((item) => needle.includes(normalise(item.text)) || normalise(item.text).includes(needle));
  if (hits.length === 0) {
    const window = sliding(pageItems, needle);
    if (!window) return undefined;
    return [union(window)];
  }
  return [union(hits)];
}

function sliding(items: readonly TextItemBox[], needle: string): TextItemBox[] | undefined {
  for (let start = 0; start < items.length; start += 1) {
    let combined = '';
    const window: TextItemBox[] = [];
    for (let index = start; index < items.length && index < start + 8; index += 1) {
      const item = items[index];
      if (!item || item.page !== items[start]?.page) break;
      window.push(item);
      combined = normalise(`${combined} ${item.text}`);
      if (combined.includes(needle)) return window;
    }
  }
  return undefined;
}

function union(items: readonly TextItemBox[]): HighlightBox {
  const page = items[0]?.page ?? 1;
  const x = Math.min(...items.map((item) => item.x));
  const y = Math.min(...items.map((item) => item.y));
  const right = Math.max(...items.map((item) => item.x + item.w));
  const bottom = Math.max(...items.map((item) => item.y + item.h));
  return clamp({ page, x, y, w: right - x, h: bottom - y });
}

function clamp(box: HighlightBox): HighlightBox {
  const x = clampUnit(box.x);
  const y = clampUnit(box.y);
  return {
    page: box.page,
    x,
    y,
    w: clampUnit(Math.min(box.w, 1 - x)),
    h: clampUnit(Math.min(box.h, 1 - y)),
  };
}

function clampUnit(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalise(value: string): string {
  return value.toLowerCase().replaceAll(/[\s,]+/g, '');
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
