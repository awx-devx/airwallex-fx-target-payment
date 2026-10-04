export const PROMPT_VERSION = '2';

export const EXTRACTION_PROMPT = `Extract the payable invoice from this document.

Rules:
- Extract the amount due (the balance due after any payments), not the subtotal.
- Resolve ambiguous dates using the vendor's country. If a date is still ambiguous, return null, confidence low, and put both candidates in reason.
- Never guess. Return null with a reason instead of inventing a value.
- For every field, return evidence: a verbatim snippet copied from the document, and the page number (1-based).
- Classify the document as invoice, credit_note, receipt, statement, quote, or other.
- Currency is an ISO 4217 code. vendorCountry and bankCountry are ISO 3166-1 alpha-2 codes (DE, not Germany). Dates are YYYY-MM-DD. Amounts are decimal strings in major units.
- Bank localBankCode is a sort code, IFSC, BSB, or routing number when one is printed.`;
