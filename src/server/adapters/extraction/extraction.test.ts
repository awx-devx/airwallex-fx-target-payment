import { readEinvoice } from '@/server/adapters/extraction/einvoice';
import { mergeExtraction } from '@/server/adapters/extraction/merge';
import { parsePaymentQr } from '@/server/adapters/extraction/qr';
import { boxesFor, type TextItemBox } from '@/server/adapters/extraction/textLayer';
import { ibanChecksumOk, validateExtraction } from '@/server/adapters/extraction/validators';
import { taken } from '@/server/adapters/extraction/fields';
import type { ExtractedBill } from '@/contracts/extraction';
import { checkBill } from '@/server/domain/billChecks';
import { describe, expect, it } from 'vitest';

const TODAY = '2026-10-05';

describe('extraction validators', () => {
  it('accepts a valid IBAN and rejects a bad checksum', () => {
    expect(ibanChecksumOk('DE89370400440532013000')).toBe(true);
    expect(ibanChecksumOk('DE00370400440532013000')).toBe(false);
  });

  it('downgrades a bad amount, an overdue due date, and the home currency', () => {
    const bill = validateExtraction(sample(), { homeCurrency: 'USD', today: TODAY, duplicate: false });
    expect(bill.amountDue.confidence).toBe('low');
    expect(bill.amountDue.reasons?.join(' ')).toMatch(/subtotal/);
    expect(bill.warnings.map((warning) => warning.code)).toContain('OVERDUE');
    expect(bill.warnings.map((warning) => warning.code)).toContain('HOME_CURRENCY');
  });

  it('stores an ISO country code when the model returns the English name', () => {
    const bill = validateExtraction(
      {
        ...sample(),
        vendorCountry: taken('Germany', 'llm'),
        bank: { ...sample().bank, bankCountry: taken('United Kingdom', 'llm') },
      },
      { homeCurrency: 'USD', today: TODAY, duplicate: false },
    );
    expect(bill.vendorCountry.value).toBe('DE');
    expect(bill.vendorCountry.confidence).toBe('high');
    expect(bill.bank.bankCountry?.value).toBe('GB');
  });

  it('flags a duplicate invoice', () => {
    const bill = validateExtraction(
      {
        ...sample(),
        currency: taken('EUR', 'llm'),
        amountDue: taken('250000.00', 'llm'),
        subtotal: taken('210084.03', 'llm'),
        tax: taken('39915.97', 'llm'),
        dueDate: taken('2026-10-28', 'llm'),
      },
      { homeCurrency: 'USD', today: TODAY, duplicate: true },
    );
    expect(bill.amountDue.confidence).toBe('high');
    expect(bill.warnings.map((warning) => warning.code)).toContain('DUPLICATE');
  });

  it('keeps the QR IBAN when the model disagrees', () => {
    const llm = sample();
    const merged = mergeExtraction(llm, {
      qr: { iban: taken('DE89370400440532013000', 'qr') },
    });
    expect(merged.bank.iban?.value).toBe('DE89370400440532013000');
    expect(merged.bank.iban?.confidence).toBe('medium');
    expect(merged.warnings.map((warning) => warning.code)).toContain('CONFLICT');
  });
});

describe('deterministic readers', () => {
  it('reads a Factur-X style invoice', () => {
    const read = readEinvoice(`<?xml version="1.0"?>
      <rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
        <rsm:ExchangedDocument>
          <ram:ID>KM-2026-0147</ram:ID>
          <ram:IssueDateTime><udt:DateTimeString format="102">20260928</udt:DateTimeString></ram:IssueDateTime>
        </rsm:ExchangedDocument>
        <rsm:SupplyChainTradeTransaction>
          <ram:ApplicableHeaderTradeAgreement>
            <ram:SellerTradeParty><ram:Name>Kessler Maschinenbau GmbH</ram:Name></ram:SellerTradeParty>
          </ram:ApplicableHeaderTradeAgreement>
          <ram:ApplicableHeaderTradeSettlement>
            <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
            <ram:SpecifiedTradeSettlementPaymentMeans>
              <ram:PayeePartyCreditorFinancialAccount><ram:IBANID>DE89370400440532013000</ram:IBANID></ram:PayeePartyCreditorFinancialAccount>
            </ram:SpecifiedTradeSettlementPaymentMeans>
            <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
              <ram:GrandTotalAmount>250000.00</ram:GrandTotalAmount>
            </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
          </ram:ApplicableHeaderTradeSettlement>
        </rsm:SupplyChainTradeTransaction>
      </rsm:CrossIndustryInvoice>`);
    expect(read?.vendorName?.value).toBe('Kessler Maschinenbau GmbH');
    expect(read?.invoiceNumber?.value).toBe('KM-2026-0147');
    expect(read?.currency?.value).toBe('EUR');
    expect(read?.amountDue?.value).toBe('250000.00');
    expect(read?.issueDate?.value).toBe('2026-09-28');
    expect(read?.iban?.source).toBe('xml');
  });

  it('reads an EPC GiroCode', () => {
    const payment = parsePaymentQr(
      ['BCD', '002', '1', 'SCT', 'COBADEFFXXX', 'Kessler', 'DE89370400440532013000', 'EUR250000.00', '', '', 'INV-1'].join('\n'),
    );
    expect(payment?.iban?.value).toBe('DE89370400440532013000');
    expect(payment?.currency?.value).toBe('EUR');
    expect(payment?.amount?.value).toBe('250000.00');
    expect(payment?.reference?.value).toBe('INV-1');
  });

  it('turns evidence into a page box', () => {
    const items: TextItemBox[] = [
      { page: 1, text: 'Invoice', x: 0.1, y: 0.1, w: 0.2, h: 0.02 },
      { page: 1, text: 'KM-2026-0147', x: 0.4, y: 0.1, w: 0.2, h: 0.02 },
    ];
    const boxes = boxesFor(
      { value: 'KM-2026-0147', confidence: 'high', source: 'llm', evidence: { page: 1, text: 'KM-2026-0147' } },
      items,
    );
    expect(boxes?.[0]?.x).toBe(0.4);
  });
});

describe('bill checks', () => {
  it('flags home currency, an amount outside the FX band, and a past due date', () => {
    const home = checkBill({
      billCurrency: 'USD',
      homeCurrency: 'USD',
      amount: '10',
      dueDate: '2026-10-01',
      today: TODAY,
    });
    expect(home.flags.routeUnsupported).toBe(true);
    expect(home.flags.overdue).toBe(true);

    const large = checkBill({
      billCurrency: 'USD',
      homeCurrency: 'USD',
      amount: '6000000',
      dueDate: '2026-12-01',
      today: TODAY,
    });
    expect(large.flags.amountLimit).toBe(true);

    const kes = checkBill({
      billCurrency: 'KES',
      homeCurrency: 'USD',
      amount: '100.50',
      dueDate: '2026-12-01',
      today: TODAY,
    });
    expect(kes.issues.map((issue) => issue.message).join(' ')).toMatch(/decimal/);
  });
});

function sample(): ExtractedBill {
  return {
    documentType: 'invoice',
    vendorName: taken('Kessler', 'llm'),
    vendorCountry: taken('DE', 'llm'),
    invoiceNumber: taken('KM-1', 'llm'),
    currency: taken('USD', 'llm'),
    amountDue: taken('10.00', 'llm'),
    subtotal: taken('8.00', 'llm'),
    tax: taken('1.00', 'llm'),
    issueDate: taken('2026-09-01', 'llm'),
    dueDate: taken('2026-09-15', 'llm'),
    bank: { iban: taken('DE00370400440532013000', 'llm') },
    warnings: [],
    meta: {
      extractor: 'mock',
      promptVersion: '1',
      escalated: false,
      pages: 1,
      textLayer: false,
      ms: 0,
    },
  };
}
