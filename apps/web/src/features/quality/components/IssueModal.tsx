import { useEffect, useMemo, useState } from 'react';
import {
  formatNumber,
  ISSUE_SEVERITIES,
  ISSUE_SEVERITY_LABELS,
  ISSUE_STATUS_LABELS,
  ISSUE_STATUSES,
  type CreateIssueInput,
  type IssueSeverity,
  type IssueStatus,
  type QualityIssue,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Field, Input, NumberInput, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useEmployees } from '@/features/employees/api/employee-api';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useIssueTargets, useRaiseIssue, useUpdateIssue } from '../api/quality-api';

/**
 * **Raising an issue, and closing it.**
 *
 * One dialog for both, because they are the same handful of facts seen at two
 * moments — and a separate "close" dialog would be a second place for the
 * severity and the rejected weight to be edited.
 *
 * The rejected weight is the field to be careful about, and the hint says so:
 * it is **finished film that cannot be sent**, not what the machine lost. The
 * machine's loss is already on the stage, and typing it again here would take
 * it off the godown a second time.
 */
export function IssueModal({
  issue,
  open,
  onClose,
}: {
  issue: QualityIssue | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: targets } = useIssueTargets();
  /* Everyone, including those not on shift — an issue can be owned by
     somebody who is off today. */
  const { data: people } = useEmployees({});
  const raise = useRaiseIssue();
  const update = useUpdateIssue();

  const [cardId, setCardId] = useState('');
  const [stageId, setStageId] = useState('');
  const [severity, setSeverity] = useState<IssueSeverity>('MEDIUM');
  const [status, setStatus] = useState<IssueStatus>('OPEN');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [rejectedKg, setRejectedKg] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [resolution, setResolution] = useState('');

  useEffect(() => {
    if (!open) return;
    setCardId(issue?.cardId ?? '');
    setStageId(issue?.stageId ?? '');
    setSeverity(issue?.severity ?? 'MEDIUM');
    setStatus(issue?.status ?? 'OPEN');
    setTitle(issue?.title ?? '');
    setDetail(issue?.detail ?? '');
    setRejectedKg(issue?.rejectedKg ? String(issue.rejectedKg) : '');
    setResponsibleId(issue?.responsibleId ?? '');
    setResolution(issue?.resolution ?? '');
  }, [open, issue]);

  const card = useMemo(
    () => (targets ?? []).find((target) => target.cardId === cardId) ?? null,
    [targets, cardId],
  );

  /* Closing it needs a note. Said before the button is pressed, not after. */
  const closing = status === 'RESOLVED' && issue?.status !== 'RESOLVED';
  const canSave =
    title.trim().length >= 3 &&
    (issue ? true : cardId) &&
    (!closing || resolution.trim().length >= 3);

  async function save() {
    try {
      if (issue) {
        await update.mutateAsync({
          id: issue.id,
          input: {
            severity,
            status,
            title: title.trim(),
            detail,
            rejectedKg: Number(rejectedKg) || 0,
            responsibleId: responsibleId || null,
            resolution,
          },
        });
        toast.success(closing ? `Issue ${issue.number} closed` : `Issue ${issue.number} updated`);
      } else {
        const input: CreateIssueInput = {
          productionOrderId: cardId,
          stageId: stageId || null,
          severity,
          title: title.trim(),
          detail,
          rejectedKg: Number(rejectedKg) || 0,
          responsibleId: responsibleId || null,
        };
        const saved = await raise.mutateAsync(input);
        toast.success(`Issue ${saved.number} raised`);
      }
      onClose();
    } catch (caught) {
      toast.error(caught instanceof ApiClientError ? caught.message : 'Could not save the issue');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={issue ? `Issue ${issue.number}` : 'Log an issue'}
      description={
        issue
          ? `${issue.jobName} · raised by ${issue.raisedBy || 'the works'}`
          : 'Something found wrong with a run — at the machine or at the checking table.'
      }
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!canSave}
            loading={raise.isPending || update.isPending}
            onClick={() => void save()}
          >
            {issue ? (closing ? 'Close the issue' : 'Save') : 'Log it'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {issue ? null : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Production run" htmlFor="issue-card">
              <Select
                id="issue-card"
                value={cardId}
                onChange={(event) => {
                  setCardId(event.target.value);
                  setStageId('');
                }}
              >
                <option value="">Choose a card…</option>
                {(targets ?? []).map((target) => (
                  <option key={target.cardId} value={target.cardId}>
                    #{target.cardNumber} · {target.jobName} ({target.customerName})
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Found at"
              htmlFor="issue-stage"
              hint="Leave blank if it was found off the machine"
            >
              <Select
                id="issue-stage"
                value={stageId}
                onChange={(event) => setStageId(event.target.value)}
                disabled={!card}
              >
                <option value="">Checking table</option>
                {(card?.stages ?? []).map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        <Field label="What is wrong" htmlFor="issue-title">
          <Input
            id="issue-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Delamination on the edge"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="How bad" htmlFor="issue-severity">
            <Select
              id="issue-severity"
              value={severity}
              onChange={(event) => setSeverity(event.target.value as IssueSeverity)}
            >
              {ISSUE_SEVERITIES.map((value) => (
                <option key={value} value={value}>
                  {ISSUE_SEVERITY_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>

          {issue ? (
            <Field label="Where it has got to" htmlFor="issue-status">
              <Select
                id="issue-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as IssueStatus)}
              >
                {ISSUE_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {ISSUE_STATUS_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field
            label="Rejected"
            htmlFor="issue-rejected"
            hint="Finished film that cannot be sent — not what the machine lost"
          >
            <NumberInput
              id="issue-rejected"
              value={rejectedKg}
              onChange={(event) => setRejectedKg(event.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Answerable for it"
          htmlFor="issue-owner"
          hint="An issue nobody owns is one nobody closes"
        >
          <Select
            id="issue-owner"
            value={responsibleId}
            onChange={(event) => setResponsibleId(event.target.value)}
          >
            <option value="">Nobody yet</option>
            {(people?.items ?? [])
              .filter((person) => person.isActive || person.id === responsibleId)
              .map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                  {person.roleName ? ` — ${person.roleName}` : ''}
                </option>
              ))}
          </Select>
        </Field>

        <Field label="Detail" htmlFor="issue-detail">
          <Textarea
            id="issue-detail"
            rows={2}
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            placeholder="Third and fourth reel only, outer edge, about 15 mm in"
          />
        </Field>

        {issue ? (
          <Field
            label="What was done"
            htmlFor="issue-resolution"
            hint="Required to close it. The same defect turns up again in March."
          >
            <Textarea
              id="issue-resolution"
              rows={2}
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
              placeholder="Adhesive coat raised to 3 gsm and the two reels re-laminated"
            />
          </Field>
        ) : null}

        {issue && issue.rejectedKg > 0 ? (
          <p className="text-warning-800 text-sm">
            {formatNumber(issue.rejectedKg, 3)} kg is counted out of what the godown can send. Put
            it back to 0 if the film turns out to be fine after all.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
