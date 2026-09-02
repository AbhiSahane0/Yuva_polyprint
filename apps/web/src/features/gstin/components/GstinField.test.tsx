import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { GstinField } from './GstinField';

/**
 * What matters here is the free half.
 *
 * The lookup costs a credit per call, so the thing worth pinning is that the
 * button cannot be pressed until the offline check says the number could exist
 * — and that the offline check itself reaches the screen. No request is made in
 * any of these, which is the point.
 */

/** A minimal host so the field behaves as it does inside a real form. */
function Host({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return (
    <QueryClientProvider client={client}>
      <GstinField
        registration={{
          name: 'gstNumber',
          onChange: async (event: { target: { value: string } }) => {
            setValue(event.target.value.toUpperCase());
          },
          onBlur: async () => {},
          ref: () => {},
        }}
        value={value}
      />
    </QueryClientProvider>
  );
}

const verifyButton = () => screen.getByRole('button', { name: /verify/i });

/** Types a whole GSTIN in, the way a paste from an email would arrive. */
function enter(value: string) {
  fireEvent.change(screen.getByLabelText(/gst number/i), { target: { value } });
}

describe('GstinField', () => {
  it('leaves an empty box alone', async () => {
    render(<Host />);

    // Registration is not compulsory below the turnover threshold, so blank is
    // a legitimate answer and must not read as an error.
    expect(screen.queryByText(/typo|15 characters|not the shape/i)).not.toBeInTheDocument();
    expect(verifyButton()).toBeDisabled();
  });

  it('will not spend a credit on a GSTIN with a typo', async () => {
    render(<Host />);

    // The placeholder that used to sit in the PDF template — reads like a
    // GSTIN, is not one.
    enter('27ABCDE1234F1Z5');

    expect(await screen.findByText(/last character does not match/i)).toBeInTheDocument();
    expect(verifyButton()).toBeDisabled();
  });

  it('names the likeliest cause when the shape is wrong', async () => {
    render(<Host />);

    // A '1' typed as 'I' where the PAN's letters belong.
    enter('27A1GPH5992Q1ZD');

    expect(await screen.findByText(/0 typed as O, or a 1 typed as I/i)).toBeInTheDocument();
    expect(verifyButton()).toBeDisabled();
  });

  it('rejects an impossible state code', async () => {
    render(<Host />);

    enter('40AIGPH5992Q1ZD');

    expect(await screen.findByText(/not a GST state code/i)).toBeInTheDocument();
    expect(verifyButton()).toBeDisabled();
  });

  it('offers the lookup once the number could exist', async () => {
    render(<Host />);

    // The works' own GSTIN.
    enter('27AIGPH5992Q1ZD');

    expect(await screen.findByText(/format looks right/i)).toBeInTheDocument();
    expect(verifyButton()).toBeEnabled();
  });

  it('accepts one typed in lower case', async () => {
    render(<Host />);

    enter('27aigph5992q1zd');

    expect(await screen.findByText(/format looks right/i)).toBeInTheDocument();
    expect(verifyButton()).toBeEnabled();
  });
});
