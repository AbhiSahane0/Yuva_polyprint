import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('application shell', () => {
  it('renders without crashing', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});
