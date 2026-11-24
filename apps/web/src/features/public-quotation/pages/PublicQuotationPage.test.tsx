import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PublicQuotation } from '@yuva/shared';
import { ApiClientError } from '@/lib/api-client';

/**
 * **The page a customer sees, and the only one in this app that is not ours.**
 *
 * What is pinned here is what the customer can and cannot do: answer once,
 * say who they are, and give a reason for a refusal. The figures on the page
 * come from the server's projection, which has its own tests — these cover
 * the page's own behaviour around them.
 */

const view = vi.hoisted(() => ({
  current: null as PublicQuotation | null,
  error: null as unknown,
}));
const respond = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock('../api/public-quotation-api', () => ({
  usePublicQuotation: () => ({
    data: view.current,
    isLoading: false,
    error: view.error,
    refetch: vi.fn(),
  }),
  useRespondToQuotation: () => ({ mutate: respond.mutate, isPending: false }),
  fetchPublicQuotationPdf: vi.fn(),
}));

const { default: PublicQuotationPage } = await import('./PublicQuotationPage');

const QUOTATION: PublicQuotation = {
  number: 124,
  version: 1,
  date: '2026-11-24',
  customerName: 'A S Agro',
  title: 'Besan range',
  items: [
    {
      position: 1,
      jobName: 'Lokratna Besan 500gm',
      description: 'Standup pouch',
      widthMm: 170,
      heightMm: 240,
      micron: 82,
      colours: 4,
      quantityKg: 500,
      ratePerKg: 240,
      quantityPouches: 20000,
      ratePerPouch: 6,
      totalAmount: 120000,
      pricingBasis: 'PER_KG',
      cylinderCost: 36480,
    },
  ],
  materialSubtotal: 120000,
  cylinderSubtotal: 36480,
  grandSubtotal: 156480,
  grandWithGst: 184646,
  gstPercent: 18,
  totalAdvance: 120480,
  terms: ['Quotation valid for 15 days.'],
  notes: '',
  expiresAt: '2026-12-14T06:30:00.000Z',
  response: null,
};

function show() {
  render(
    <MemoryRouter initialEntries={['/q/' + 'a'.repeat(64)]}>
      <Routes>
        <Route path="/q/:token" element={<PublicQuotationPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  view.current = QUOTATION;
  view.error = null;
  respond.mutate.mockReset();
});

describe('what the customer reads', () => {
  it('names the quotation and who it is for', () => {
    show();

    expect(screen.getByText('#124')).toBeTruthy();
    expect(screen.getByText(/A S Agro/)).toBeTruthy();
    expect(screen.getByText('Lokratna Besan 500gm')).toBeTruthy();
  });

  it('shows the total and the advance, which are what they check first', () => {
    show();

    expect(screen.getAllByText('Rs. 1,84,646').length).toBeGreaterThan(0);
    expect(screen.getByText('Rs. 1,20,480')).toBeTruthy();
  });

  /* A link that will not open has one state, whatever the reason: the
     customer's next step is the same in all of them. */
  it('explains itself when the link will not open', () => {
    view.current = null;
    view.error = new ApiClientError('This quotation link has expired.', 'NOT_FOUND', 404);
    show();

    expect(screen.getByText('This link will not open')).toBeTruthy();
    expect(screen.getByText(/has expired/)).toBeTruthy();
  });
});

describe('answering it', () => {
  it('asks who they are before it will take an acceptance', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /Accept this quotation/ }));

    expect(screen.getByLabelText(/Your name/)).toBeTruthy();
  });

  it('sends the acceptance with the name they typed', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /Accept this quotation/ }));
    fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: 'Sunil Kale' } });
    fireEvent.change(screen.getByLabelText(/Your role/), { target: { value: 'Purchase' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm acceptance' }));

    expect(respond.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: 'ACCEPTED',
        personName: 'Sunil Kale',
        personRole: 'Purchase',
      }),
      expect.anything(),
    );
  });

  it('takes a refusal down the other path', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /Not this time/ }));
    fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: 'Sunil Kale' } });
    fireEvent.change(screen.getByLabelText(/Why not/), {
      target: { value: 'Rate is above our budget.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send our answer' }));

    expect(respond.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'DECLINED', note: 'Rate is above our budget.' }),
      expect.anything(),
    );
  });

  /*
   * Two people at one company open the same forwarded mail. The second must
   * see what their colleague did rather than a fresh pair of buttons — and
   * the one who accepted must see their own acceptance when they come back to
   * check that it went through.
   */
  it('shows the answer already given instead of the buttons', () => {
    view.current = {
      ...QUOTATION,
      response: {
        decision: 'ACCEPTED',
        personName: 'Sunil Kale',
        personRole: 'Purchase',
        note: 'Please start the cylinders.',
        respondedAt: '2026-11-24T09:00:00.000Z',
      },
    };
    show();

    expect(screen.getByText('This quotation has been accepted')).toBeTruthy();
    expect(screen.getByText(/Sunil Kale/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Accept this quotation/ })).toBeNull();
  });

  it('says so when they turned it down', () => {
    view.current = {
      ...QUOTATION,
      response: {
        decision: 'DECLINED',
        personName: 'Sunil Kale',
        personRole: '',
        note: 'Too dear.',
        respondedAt: '2026-11-24T09:00:00.000Z',
      },
    };
    show();

    expect(screen.getByText('This quotation was declined')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Accept this quotation/ })).toBeNull();
  });
});
