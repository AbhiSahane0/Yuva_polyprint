import { describe, expect, it } from 'vitest';
import { sendQuotationSchema } from './quotation.js';

/**
 * What a send carries, and what it refuses to carry.
 *
 * The numbers are normalised here rather than in the caller so the stored
 * number is the same shape however it was typed. A history that recorded
 * `9545390337`, `+91 95453 90337` and `09545390337` as three different
 * recipients would make "did we send this to him" unanswerable.
 */
const base = { to: ['buyer@company.com'], subject: 'Quotation #124' };

describe('sendQuotationSchema', () => {
  it('still needs an email address', () => {
    // WhatsApp is an addition to the email, not a replacement: the PDF is the
    // deliverable and email is what carries it today.
    const result = sendQuotationSchema.safeParse({
      to: [],
      subject: 'Quotation #124',
      whatsappTo: ['9545390337'],
    });
    expect(result.success).toBe(false);
  });

  it('sends with no numbers at all', () => {
    const result = sendQuotationSchema.parse(base);
    expect(result.whatsappTo).toEqual([]);
  });

  it('stores every number the same way, whatever was typed', () => {
    const result = sendQuotationSchema.parse({
      ...base,
      whatsappTo: ['9545390337', '+91 77200 46005', '09096444471'],
    });
    expect(result.whatsappTo).toEqual(['+919545390337', '+917720046005', '+919096444471']);
  });

  it('does not record the same number twice', () => {
    const result = sendQuotationSchema.parse({
      ...base,
      whatsappTo: ['9545390337', '+919545390337', '09545390337'],
    });
    expect(result.whatsappTo).toEqual(['+919545390337']);
  });

  it('rejects a landline rather than dropping it', () => {
    /*
     * Dropping it would leave the office believing a message was addressed to a
     * number that can never receive one. The error is the point.
     */
    const result = sendQuotationSchema.safeParse({ ...base, whatsappTo: ['222394'] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('ten-digit Indian mobile');
  });

  it('refuses an unreasonable number of recipients', () => {
    const many = Array.from({ length: 11 }, (_, i) => `98765${String(43210 + i).padStart(5, '0')}`);
    expect(sendQuotationSchema.safeParse({ ...base, whatsappTo: many }).success).toBe(false);
  });
});
