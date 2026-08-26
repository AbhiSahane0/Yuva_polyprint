import { describe, expect, it } from 'vitest';
import type { Quotation } from '@yuva/shared';
import { buildQuotationEmail, defaultSubject } from './quotation-email.js';

/** Only the fields the email actually reads. */
function quotation(overrides: Partial<Quotation> = {}): Quotation {
  return {
    number: 121,
    date: '2026-08-25',
    customerName: 'Gulve Patil Food Products',
    grandWithGst: 210040,
    totalAdvance: 156940,
    items: [{}, {}],
    ...overrides,
  } as unknown as Quotation;
}

describe('quotation email', () => {
  it('names the customer and the document', () => {
    const { text, html } = buildQuotationEmail(quotation(), '');

    expect(text).toContain('Dear Gulve Patil Food Products,');
    expect(html).toContain('Gulve Patil Food Products');
    expect(text).toContain('Quotation no: 121');
    expect(defaultSubject(quotation())).toContain('#121');
  });

  it('carries the totals the customer will check first', () => {
    const { text } = buildQuotationEmail(quotation(), '');

    expect(text).toContain('2,10,040');
    expect(text).toContain('1,56,940');
  });

  it('counts items in words that read correctly for one', () => {
    expect(buildQuotationEmail(quotation({ items: [{}] as never }), '').text).toContain('1 job');
    expect(buildQuotationEmail(quotation(), '').text).toContain('2 jobs');
  });

  it('uses a default line when no message is written', () => {
    const { text, html } = buildQuotationEmail(quotation(), '   ');

    expect(text).toContain('Please find our quotation attached.');
    expect(html).toContain('Please find our quotation attached.');
  });

  it('keeps the sender’s own message', () => {
    const { text, html } = buildQuotationEmail(quotation(), 'Rates hold for 15 days.');

    expect(text).toContain('Rates hold for 15 days.');
    expect(html).toContain('Rates hold for 15 days.');
  });

  it('turns blank lines into paragraphs and single breaks into <br>', () => {
    const { html } = buildQuotationEmail(quotation(), 'First para.\n\nSecond para.\nSame para.');

    expect(html).toContain('First para.');
    expect(html).toContain('Second para.<br/>Same para.');
  });

  /*
   * The customer name comes from imported spreadsheet data and the message is
   * typed by a user; neither is trusted. A company really can be called
   * "Smith & Sons", and that must not break the markup, let alone inject it.
   */
  it('escapes the customer name', () => {
    const { html } = buildQuotationEmail(
      quotation({ customerName: '<script>alert(1)</script> & Sons' }),
      '',
    );

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp; Sons');
  });

  it('escapes the message', () => {
    const { html } = buildQuotationEmail(quotation(), 'Call <b>now</b> & ask for "Anand"');

    expect(html).not.toContain('<b>now</b>');
    expect(html).toContain('&lt;b&gt;now&lt;/b&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;Anand&quot;');
  });

  it('produces a plain-text alternative alongside the html', () => {
    const { text, html } = buildQuotationEmail(quotation(), 'Note');

    // Some clients only render text; it must stand on its own.
    expect(text).not.toContain('<');
    expect(html).toContain('<html>');
    expect(text).toContain('Yuva Polyprint & Packaging Industries');
  });
});
