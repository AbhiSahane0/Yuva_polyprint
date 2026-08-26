import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { Field, Input } from '@/components/ui/Field';
import { ApiClientError } from '@/lib/api-client';
import { useLogin } from '../api/auth-api';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const signIn = useLogin();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    signIn.mutate(
      { username, password },
      {
        onError: (cause) => {
          setError(
            cause instanceof ApiClientError
              ? cause.message
              : 'Could not reach the server. Check your connection and try again.',
          );
        },
      },
    );
  }

  return (
    <div className="bg-ink-50 flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {/* The letterhead's own arrangement: the mark, then the company name
              beneath it — so the login screen looks like the quotations the
              office sends out. */}
          <Logo className="mx-auto mb-3 h-11" />
          <h1 className="text-ink-900 text-lg font-bold">Polyprint &amp; Packaging</h1>
          <p className="text-ink-500 mt-1 text-sm">Sign in to continue</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="border-ink-200 flex flex-col gap-4 rounded-[var(--radius-lg)] border bg-white p-5 shadow-[var(--shadow-card)]"
        >
          <Field label="Username" htmlFor="username">
            <Input
              id="username"
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              // The office signs in on a shared desktop every morning; landing
              // in the first box saves a click every time.
              autoFocus
              required
            />
          </Field>

          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>

          {error ? (
            <p
              role="alert"
              className="bg-danger-50 text-danger-700 rounded-[var(--radius-md)] px-3 py-2 text-sm"
            >
              {error}
            </p>
          ) : null}

          <Button type="submit" loading={signIn.isPending} className="w-full">
            Sign in
          </Button>
        </form>

        <p className="text-ink-400 mt-4 text-center text-sm">
          Forgotten your password? Ask an administrator to reset it.
        </p>
      </div>
    </div>
  );
}
