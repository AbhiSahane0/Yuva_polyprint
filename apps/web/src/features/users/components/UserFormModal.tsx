import { useEffect, useState } from 'react';
import {
  APP_MODULES,
  MODULE_LABELS,
  MODULE_SECTIONS,
  type AppModule,
  type User,
} from '@yuva/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useCreateUser, useUpdateUser } from '../api/user-api';

/**
 * Create a user, or edit one.
 *
 * The password box only appears when creating. Changing someone's password
 * later is a separate, deliberate action — folding it into the same form as
 * "rename this person" invites resetting a password by accident.
 */
export function UserFormModal({
  open,
  user,
  onClose,
}: {
  open: boolean;
  user: User | null;
  onClose: () => void;
}) {
  const isEdit = user !== null;
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [modules, setModules] = useState<AppModule[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setUsername(user?.username ?? '');
    setDisplayName(user?.displayName ?? '');
    setIsAdmin(user?.isAdmin ?? false);
    setModules(user?.modules ?? []);
    setPassword('');
    setError(null);
  }, [open, user]);

  function toggleModule(module: AppModule) {
    setModules((current) =>
      current.includes(module) ? current.filter((m) => m !== module) : [...current, module],
    );
  }

  function onSubmit() {
    setError(null);
    const done = (message: string) => {
      toast.success(message);
      onClose();
    };
    const fail = (cause: unknown) =>
      setError(cause instanceof ApiClientError ? cause.message : 'Something went wrong.');

    if (isEdit) {
      updateUser.mutate(
        { id: user.id, displayName, isAdmin, modules },
        { onSuccess: () => done(`${displayName} updated`), onError: fail },
      );
    } else {
      createUser.mutate(
        { username, password, displayName, isAdmin, modules },
        { onSuccess: () => done(`${displayName} can now sign in`), onError: fail },
      );
    }
  }

  const pending = createUser.isPending || updateUser.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${user.displayName}` : 'Add user'}
      description={
        isEdit ? 'Change their name or what they can see.' : 'They can sign in as soon as you save.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={pending}>
            {isEdit ? 'Save changes' : 'Create user'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" htmlFor="displayName" hint="Shown in the app, e.g. Anand Hase">
          <Input
            id="displayName"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="off"
          />
        </Field>

        {isEdit ? null : (
          <>
            <Field
              label="Username"
              htmlFor="newUsername"
              hint="What they type to sign in. Lower case, no spaces."
            >
              <Input
                id="newUsername"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>

            <Field label="Password" htmlFor="newPassword" hint="At least 8 characters">
              <Input
                id="newPassword"
                type="text"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
              />
            </Field>
          </>
        )}

        <div className="border-ink-200 rounded-[var(--radius-md)] border p-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              aria-label="Administrator"
              checked={isAdmin}
              onChange={(event) => setIsAdmin(event.target.checked)}
              className="accent-brand-600 mt-0.5 size-4 cursor-pointer"
            />
            <span>
              <span className="text-ink-800 block text-sm font-medium">Administrator</span>
              <span className="text-ink-500 block text-sm">
                Sees everything and can manage users. Section ticks below do not apply.
              </span>
            </span>
          </label>
        </div>

        <div>
          <p className="text-ink-700 mb-1 text-sm font-medium">Sections they can open</p>
          <p className="text-ink-500 mb-2 text-sm">
            {isAdmin
              ? 'An administrator already sees every section.'
              : 'Anything left unticked is hidden from them.'}
          </p>
          <div className="flex flex-col gap-1">
            {APP_MODULES.map((module) => (
              <label
                key={module}
                className={
                  'flex items-start gap-3 rounded-[var(--radius-md)] px-2 py-1.5 text-sm ' +
                  (isAdmin ? 'text-ink-400' : 'text-ink-800 hover:bg-ink-50 cursor-pointer')
                }
              >
                <input
                  type="checkbox"
                  aria-label={MODULE_LABELS[module]}
                  disabled={isAdmin}
                  checked={isAdmin || modules.includes(module)}
                  onChange={() => toggleModule(module)}
                  className="accent-brand-600 mt-0.5 size-4 shrink-0 disabled:cursor-not-allowed"
                />
                <span className="min-w-0">
                  {MODULE_LABELS[module]}
                  {/*
                    What the tick actually turns on.

                    Several of these cover more than one screen — Designs
                    belongs with the customer whose artwork it is, Quality is
                    the same stage as Production — and the owner was left to
                    find that out by unticking one and seeing what vanished.
                  */}
                  {MODULE_SECTIONS[module] !== MODULE_LABELS[module] ? (
                    <span className="text-ink-400 block text-xs">{MODULE_SECTIONS[module]}</span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="bg-danger-50 text-danger-700 rounded-[var(--radius-md)] px-3 py-2 text-sm"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
