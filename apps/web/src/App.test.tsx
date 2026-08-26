import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { User } from '@yuva/shared';
import App from './App';
import { useAuthStore } from '@/features/auth/auth-store';

/*
 * The app now begins at a login screen. Rendering the shell requires a session,
 * so these tests put one in the store directly rather than driving the form —
 * what is being checked here is that the shell composes and that access
 * decides what appears in it, not the sign-in round trip.
 */
function signInAs(overrides: Partial<User> = {}) {
  useAuthStore.setState({
    token: 'test-token',
    ready: true,
    user: {
      id: 'u1',
      username: 'tester',
      displayName: 'Test User',
      isAdmin: false,
      isActive: true,
      modules: ['customers'],
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
      ...overrides,
    },
  });
}

describe('application shell', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, user: null, ready: true });
  });

  it('asks an anonymous visitor to sign in', async () => {
    render(<App />);

    expect(await screen.findByText('Sign in to continue')).toBeInTheDocument();
    // No shell for a stranger.
    expect(screen.queryByRole('link', { name: /customers/i })).not.toBeInTheDocument();
  });

  it('renders the shell once signed in', async () => {
    signInAs();
    render(<App />);

    expect(await screen.findByRole('link', { name: /customers/i })).toBeInTheDocument();
    // The brand is the mark plus the word beside it, not one run of text.
    expect(screen.getAllByRole('img', { name: 'Yuva' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Polyprint').length).toBeGreaterThan(0);
    expect(screen.getByText('Test User')).toBeInTheDocument();
  });

  it('shows only the sections a user has been given', async () => {
    signInAs({ modules: ['rates'] });
    render(<App />);

    expect(await screen.findByRole('link', { name: /rates/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /customers/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /quotations/i })).not.toBeInTheDocument();
    // User management is never offered to a non-admin.
    expect(screen.queryByRole('link', { name: /users/i })).not.toBeInTheDocument();
  });

  it('gives an admin every section plus user management', async () => {
    signInAs({ isAdmin: true, modules: [] });
    render(<App />);

    expect(await screen.findByRole('link', { name: /customers/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /quotations/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /rates/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /users/i })).toBeInTheDocument();
  });
});
