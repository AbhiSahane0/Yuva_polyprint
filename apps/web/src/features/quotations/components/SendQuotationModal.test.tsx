import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { QuotationSummary } from '@yuva/shared';

/**
 * Where the send dialog gets its recipients, and why it takes two sources.
 *
 * A quotation snapshots the address and number it was issued against, so the
 * printed page never changes under the customer's feet. That is right for the
 * document and wrong for this dialog: quotation #128 was written before anyone
 * had A S Agro's email, so its snapshot is blank forever — and the office went
 * on typing an address that was already on the customer record.
 *
 * The rule is therefore snapshot first, customer record for the gaps. An
 * address typed onto a quotation was a decision about that document and must
 * not be replaced by the company's general one; a blank is not a decision.
 */
const quotationDetail = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const customerDetail = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock('../api/quotation-api', () => ({
  useQuotation: () => ({ data: quotationDetail.current }),
  useQuotationEmails: () => ({ data: [] }),
  useSendQuotation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/features/customers/api/customer-api', () => ({
  useCustomer: () => ({ data: customerDetail.current }),
}));

const { SendQuotationModal } = await import('./SendQuotationModal');

const summary = { id: 'q1', number: 128, customerName: 'A S Agro' } as QuotationSummary;

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SendQuotationModal quotation={summary} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

const chips = () =>
  [...document.querySelectorAll('span')].map((node) => node.textContent?.trim() ?? '');

beforeEach(() => {
  quotationDetail.current = {};
  customerDetail.current = {};
});

describe('SendQuotationModal recipients', () => {
  it('uses the customer record when the quotation carries nothing', async () => {
    // Exactly quotation #128: saved against A S Agro before either was known.
    quotationDetail.current = { customerId: 'c1', email: '', mobile: '' };
    customerDetail.current = { email: 'cloudabhi123@gmail.com', mobile: '8485071067' };
    show();

    await waitFor(() => expect(chips()).toContain('cloudabhi123@gmail.com'));
    expect(chips()).toContain('+91 84850 71067');
  });

  it('keeps an address typed onto the quotation itself', async () => {
    /*
     * A particular buyer at the company, chosen for this document. Replacing it
     * with the company's general address would quietly send the quotation to
     * somebody the office did not pick.
     */
    quotationDetail.current = { customerId: 'c1', email: 'buyer@asagro.com', mobile: '9096444471' };
    customerDetail.current = { email: 'office@asagro.com', mobile: '8485071067' };
    show();

    await waitFor(() => expect(chips()).toContain('buyer@asagro.com'));
    expect(chips()).not.toContain('office@asagro.com');
    expect(chips()).toContain('+91 90964 44471');
    expect(chips()).not.toContain('+91 84850 71067');
  });

  it('treats the importer’s NA as nothing on either side', async () => {
    quotationDetail.current = { customerId: 'c1', email: 'NA', mobile: 'NA' };
    customerDetail.current = { email: 'cloudabhi123@gmail.com', mobile: '8485071067' };
    show();

    await waitFor(() => expect(chips()).toContain('cloudabhi123@gmail.com'));
  });

  it('says so when neither has anything, rather than looking broken', async () => {
    quotationDetail.current = { customerId: 'c1', email: '', mobile: '' };
    customerDetail.current = { email: 'NA', mobile: 'NA' };
    show();

    await waitFor(() => expect(screen.getByText(/This customer has no saved email/)).toBeTruthy());
    expect(screen.getByText(/This customer has no saved mobile/)).toBeTruthy();
  });

  it('does not offer a landline sitting in the mobile field', async () => {
    // One imported row holds a pair of landlines in a single cell.
    quotationDetail.current = { customerId: 'c1', email: '', mobile: '' };
    customerDetail.current = { email: '', mobile: '222394, 222044' };
    show();

    await waitFor(() => expect(screen.getByText(/This customer has no saved mobile/)).toBeTruthy());
  });
});
