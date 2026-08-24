import { AlertTriangle } from 'lucide-react';
import type { Customer } from '@yuva/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import { useDeleteCustomer } from '../api/customer-api';

interface Props {
  customer: Customer | null;
  onClose: () => void;
}

export function DeleteCustomerDialog({ customer, onClose }: Props) {
  const deleteCustomer = useDeleteCustomer();

  async function onConfirm() {
    if (!customer) return;
    try {
      const result = await deleteCustomer.mutateAsync(customer.id);
      toast.success(
        result.releasedJobs > 0
          ? `${customer.companyName} deleted — ${result.releasedJobs} job(s) now need a customer`
          : `${customer.companyName} deleted`,
      );
      onClose();
    } catch {
      toast.error('Could not delete the customer');
    }
  }

  return (
    <Modal
      open={customer !== null}
      onClose={onClose}
      title="Delete customer"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={deleteCustomer.isPending}
            onClick={onConfirm}
          >
            Delete
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <div className="bg-danger-50 text-danger-600 flex size-9 shrink-0 items-center justify-center rounded-full">
          <AlertTriangle className="size-5" />
        </div>
        <div className="text-sm">
          <p className="text-ink-800">
            Delete <span className="font-semibold">{customer?.companyName}</span>? This cannot be
            undone.
          </p>

          {customer && customer.jobCount > 0 ? (
            <p className="text-ink-600 bg-warning-50 mt-3 rounded-[var(--radius-md)] px-3 py-2">
              This customer has{' '}
              <span className="font-semibold">
                {customer.jobCount} job{customer.jobCount === 1 ? '' : 's'}
              </span>
              . The jobs are kept, but they will be flagged as needing a customer so they can be
              reassigned.
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
