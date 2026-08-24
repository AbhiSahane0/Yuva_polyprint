import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('application shell', () => {
  it('renders the navigation without crashing', () => {
    render(<App />);

    // Routes are lazy-loaded, so assert on the shell itself rather than on
    // page content that has not resolved yet.
    expect(screen.getAllByText('Yuva Polyprint').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /customers/i })).toBeInTheDocument();
  });
});
