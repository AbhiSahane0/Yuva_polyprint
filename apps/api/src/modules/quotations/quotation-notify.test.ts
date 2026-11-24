import { describe, expect, it } from 'vitest';
import type { PublicQuotationResponse, Quotation } from '@yuva/shared';
import {
  acceptanceAlertSubject,
  acceptanceWhatsAppToOffice,
  acceptedTemplateVariables,
  customerWhatsAppNumber,
  buildAcceptanceAlertEmail,
  buildCustomerConfirmationEmail,
  quotationTemplateVariables,
  quotationWhatsApp,
} from './quotation-notify.js';

/**
 * What goes out when a customer answers.
 *
 * The messages themselves are prose and not worth asserting line by line.
 * What is worth pinning is the part each one has a job to do: that the works
 * is told to act, that the customer is not told their refusal was welcome,
 * that a WhatsApp body fits in a template, and that the template variables
 * match the numbering submitted to Meta.
 */

const QUOTATION = {
  number: 124,
  customerName: 'A S Agro',
  items: [{}, {}],
} as unknown as Quotation;

const ACCEPTED: PublicQuotationResponse = {
  decision: 'ACCEPTED',
  personName: 'Sunil Kale',
  personRole: 'Purchase',
  note: 'Please start the cylinders this week.',
  respondedAt: '2026-11-24T09:00:00.000Z',
};

const DECLINED: PublicQuotationResponse = {
  ...ACCEPTED,
  decision: 'DECLINED',
  note: 'Rate is above our budget.',
};

describe('telling the works', () => {
  it('says what happened in the subject, where it will be read', () => {
    expect(acceptanceAlertSubject(QUOTATION, ACCEPTED)).toContain('ACCEPTED');
    expect(acceptanceAlertSubject(QUOTATION, ACCEPTED)).toContain('#124');
    expect(acceptanceAlertSubject(QUOTATION, DECLINED)).toContain('declined');
  });

  /*
   * The single most important sentence in this feature. An acceptance that
   * nobody acts on is a job nobody starts, and the whole reason accepting
   * does not create the order itself is that a stranger with a link should
   * not be able to. So the message has to ask for the act.
   */
  it('tells the office that nothing has been created yet', () => {
    const { text, html } = buildAcceptanceAlertEmail(QUOTATION, ACCEPTED, 184646);

    expect(text).toContain('Nothing has been created in the system yet');
    expect(html).toContain('Nothing has been created in the system yet');
  });

  it('carries who, when and how much', () => {
    const { text } = buildAcceptanceAlertEmail(QUOTATION, ACCEPTED, 184646);

    expect(text).toContain('Sunil Kale (Purchase)');
    expect(text).toContain('1,84,646');
    expect(text).toContain('Please start the cylinders this week.');
  });

  it('says a refusal is already recorded, because nothing is owed on it', () => {
    const { text } = buildAcceptanceAlertEmail(QUOTATION, DECLINED, 184646);

    expect(text).toContain('marked lost');
    expect(text).toContain('Rate is above our budget.');
  });

  it('does not put the works’ name in an escape sequence', () => {
    const { html } = buildAcceptanceAlertEmail(
      { ...QUOTATION, customerName: 'Smith & Sons <Foods>' } as Quotation,
      ACCEPTED,
      1000,
    );

    expect(html).not.toContain('<Foods>');
    expect(html).toContain('&amp; Sons');
  });
});

describe('the one-line version for a phone', () => {
  it('fits inside Meta’s limit for a template body', () => {
    const body = acceptanceWhatsAppToOffice(QUOTATION, ACCEPTED, 184646);
    expect(body.length).toBeLessThan(1024);
  });

  it('says the number, the customer and the money, in that order', () => {
    const body = acceptanceWhatsAppToOffice(QUOTATION, ACCEPTED, 184646);

    expect(body).toContain('#124');
    expect(body).toContain('A S Agro');
    expect(body).toContain('1,84,646');
    expect(body).toContain('Confirm it');
  });

  it('puts the link in the message that sends a quotation', () => {
    const url = 'https://quotations.example.com/q/' + 'a'.repeat(64);
    const body = quotationWhatsApp(QUOTATION, 184646, url);

    expect(body).toContain(url);
    expect(body).toContain('#124');
    expect(body.length).toBeLessThan(1024);
  });
});

describe('thanking the customer', () => {
  it('confirms what they agreed to, and what happens next', () => {
    const { text } = buildCustomerConfirmationEmail(QUOTATION, ACCEPTED, 184646);

    expect(text).toContain('#124');
    expect(text).toContain('Sunil Kale');
    expect(text).toContain('1,84,646');
    expect(text).toContain('schedule and the advance');
  });
});

/*
 * Numbered as Meta numbers them. A variable added to the submitted template
 * and not to this map comes out blank in the customer's message, and Twilio
 * does not complain — which is why `docs/whatsapp-templates.md` lists the
 * same table and why these are pinned.
 */
describe('the approved templates', () => {
  it('fills the quotation template in the documented order', () => {
    const url = 'https://quotations.example.com/q/abc';
    expect(quotationTemplateVariables(QUOTATION, 184646, url)).toEqual({
      '1': '124',
      '2': 'Rs. 1,84,646 incl. GST',
      '3': url,
    });
  });

  it('fills the acceptance template in the documented order', () => {
    expect(acceptedTemplateVariables(QUOTATION, ACCEPTED, 184646)).toEqual({
      '1': '124',
      '2': 'A S Agro',
      '3': 'Rs. 1,84,646 incl. GST',
      '4': 'Sunil Kale',
    });
  });
});

/*
 * The bug this exists to stop: a quotation snapshots the mobile the way it
 * came off the office's spreadsheet. The first acceptance on this system was
 * against a quotation carrying `9890605665`, which Twilio refuses with 21211
 * — so the customer's confirmation would have gone nowhere, silently, on the
 * one message that tells them their order is in.
 */
describe('the number a confirmation is addressed to', () => {
  it('adds the country code the office does not type', () => {
    expect(customerWhatsAppNumber({ mobile: '9890605665' })).toBe('+919890605665');
  });

  it('leaves a number that is already right alone', () => {
    expect(customerWhatsAppNumber({ mobile: '+919890605665' })).toBe('+919890605665');
  });

  /* No message beats a failed one: these cannot receive WhatsApp, and a
     message addressed to them is a line in a log nobody reads. */
  it('sends nothing to a blank, a placeholder or a landline', () => {
    expect(customerWhatsAppNumber({ mobile: '' })).toBeNull();
    expect(customerWhatsAppNumber({ mobile: 'NA' })).toBeNull();
    expect(customerWhatsAppNumber({ mobile: '02425 223344' })).toBeNull();
  });
});
