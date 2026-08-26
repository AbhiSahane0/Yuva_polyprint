import { useEffect, useState } from 'react';
import type { User } from '@yuva/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useResetPassword } from '../api/user-api';

export function ResetPasswordModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reset = useResetPassword();

  useEffect(() => {
    setPassword('');
    setError(null);
  }, [user]);

  function onSubmit() {
    if (!user) return;
    setError(null);
    reset.mutate(
      { id: user.id, password },
      {
        onSuccess: () => {
          toast.success(`Password changed for ${user.displayName}`);
          onClose();
        },
        onError: (cause) =>
          setError(cause instanceof ApiClientError ? cause.message : 'Something went wrong.'),
      },
    );
  }

  return (
    <Modal
      open={user !== null}
      onClose={onClose}
      title={user ? `Reset password for ${user.displayName}` : 'Reset password'}
      description="Tell them the new password yourself. It is not shown again after you save."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={reset.isPending}>
            Set password
          </Button>
        </>
      }
    >
      <Field label="New password" htmlFor="resetPassword" hint="At least 8 characters">
        {/* Deliberately visible: the admin has to read it out to the person. */}
        <Input
          id="resetPassword"
          type="text"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          autoFocus
        />
      </Field>
      <p className="text-ink-500 mt-3 text-sm">
        Signing them out everywhere is part of this — they will need the new password on every
        device.
      </p>
      {error ? (
        <p
          role="alert"
          className="bg-danger-50 text-danger-700 mt-3 rounded-[var(--radius-md)] px-3 py-2 text-sm"
        >
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
