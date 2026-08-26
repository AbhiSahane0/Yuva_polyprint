import { useState } from 'react';
import { KeyRound, Pencil, Plus, ShieldCheck, UserPlus, Users as UsersIcon } from 'lucide-react';
import { MODULE_LABELS, type User } from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/features/auth/auth-store';
import { useUpdateUser, useUsers } from '../api/user-api';
import { UserFormModal } from '../components/UserFormModal';
import { ResetPasswordModal } from '../components/ResetPasswordModal';

function AccessSummary({ user }: { user: User }) {
  if (user.isAdmin) return <span className="text-ink-500 text-sm">Everything</span>;
  if (user.modules.length === 0) {
    return <span className="text-ink-400 text-sm">No sections yet</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {user.modules.map((module) => (
        <Badge key={module} tone="neutral">
          {MODULE_LABELS[module]}
        </Badge>
      ))}
    </div>
  );
}

export default function UsersPage() {
  const { data: users, isPending, isError, error, refetch } = useUsers();
  const me = useAuthStore((state) => state.user);
  const updateUser = useUpdateUser();

  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);

  function toggleActive(user: User) {
    updateUser.mutate(
      { id: user.id, isActive: !user.isActive },
      {
        onSuccess: () =>
          toast.success(
            user.isActive ? `${user.displayName} deactivated` : `${user.displayName} restored`,
          ),
        onError: (cause) =>
          toast.error(cause instanceof ApiClientError ? cause.message : 'Something went wrong.'),
      },
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-ink-900 text-xl font-bold sm:text-2xl">Users</h1>
          <p className="text-ink-500 mt-1 text-sm">
            Who can sign in, and which sections each of them sees.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          Add user
        </Button>
      </header>

      <section className="border-ink-200 mt-5 overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-[var(--shadow-card)]">
        {isError ? (
          <EmptyState
            title="Could not load users"
            description={error instanceof Error ? error.message : 'Something went wrong.'}
            action={
              <Button variant="secondary" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        ) : isPending ? (
          <LoadingState label="Loading users…" />
        ) : users.length === 0 ? (
          <EmptyState
            icon={<UsersIcon className="size-8" />}
            title="No users yet"
            action={
              <Button onClick={() => setCreating(true)}>
                <UserPlus className="size-4" />
                Add the first user
              </Button>
            }
          />
        ) : (
          <ul className="divide-ink-100 divide-y">
            {users.map((user) => (
              <li
                key={user.id}
                className={
                  'flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ' +
                  (user.isActive ? '' : 'bg-ink-50/60')
                }
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-ink-900 text-sm font-semibold">{user.displayName}</span>
                    {user.isAdmin ? (
                      <Badge tone="brand">
                        <ShieldCheck className="mr-1 inline size-3" />
                        Admin
                      </Badge>
                    ) : null}
                    {user.isActive ? null : <Badge tone="warning">Deactivated</Badge>}
                    {me?.id === user.id ? <Badge tone="neutral">You</Badge> : null}
                  </div>
                  <p className="text-ink-500 mt-0.5 text-sm">
                    {user.username}
                    {user.lastLoginAt
                      ? ` · last signed in ${new Date(user.lastLoginAt).toLocaleDateString('en-IN')}`
                      : ' · never signed in'}
                  </p>
                  <div className="mt-2">
                    <AccessSummary user={user} />
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setEditing(user)}>
                    <Pencil className="size-4" />
                    Edit
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setResetting(user)}>
                    <KeyRound className="size-4" />
                    Password
                  </Button>
                  {/* Deactivation, not deletion: rates and quotations record who
                      entered them, and deleting the person makes that ambiguous. */}
                  {me?.id === user.id ? null : (
                    <Button
                      variant={user.isActive ? 'ghost' : 'secondary'}
                      size="sm"
                      onClick={() => toggleActive(user)}
                    >
                      {user.isActive ? 'Deactivate' : 'Restore'}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <UserFormModal open={creating} user={null} onClose={() => setCreating(false)} />
      <UserFormModal open={editing !== null} user={editing} onClose={() => setEditing(null)} />
      <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />
    </div>
  );
}
