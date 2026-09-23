import { operatorChoices, type EmployeeOnFloor, type ProductionStageRow } from '@yuva/shared';
import { Select } from '@/components/ui/Field';

/**
 * **Who ran this stage** — a dropdown instead of a box somebody types into.
 *
 * The typing is what this replaces, and the reason is in the works' own job
 * sheets: fourteen of them hold "Operator 1", "Printing operator 2", "Printing
 * operattor 2", "helper l" and "office 1" as though they were five different
 * roles. Nothing can be totalled per person from that.
 *
 * The people whose role belongs to this stage's process come first, under a
 * heading, and everybody else is still there underneath. **Nobody is hidden**:
 * the day the slitting man covers the press is exactly the day worth recording,
 * and a list that cannot say so gets the wrong name picked instead.
 */
export function OperatorSelect({
  id,
  stage,
  people,
  disabled,
  onPick,
}: {
  id: string;
  stage: ProductionStageRow;
  people: EmployeeOnFloor[];
  disabled: boolean;
  onPick: (operatorId: string | null) => void;
}) {
  const { suggested, others } = operatorChoices(people, stage.stage, stage.operatorId);

  /*
   * A stage whose operator was typed before this module existed, or typed by
   * somebody covering who is not on the books. The name is kept and shown
   * rather than silently dropped — it is a record of who ran a job.
   */
  const typedName = !stage.operatorId && stage.operator ? stage.operator : null;

  return (
    <Select
      id={id}
      value={stage.operatorId ?? ''}
      disabled={disabled}
      onChange={(event) => onPick(event.target.value || null)}
    >
      <option value="">{typedName ? `${typedName} (typed)` : '— who ran it —'}</option>

      {suggested.length > 0 ? (
        <optgroup label="On this machine">
          {suggested.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
              {person.isActive ? '' : ' (left)'}
            </option>
          ))}
        </optgroup>
      ) : null}

      {others.length > 0 ? (
        <optgroup label={suggested.length > 0 ? 'Anyone else' : 'The works'}>
          {others.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name} — {person.roleName}
              {person.isActive ? '' : ' (left)'}
            </option>
          ))}
        </optgroup>
      ) : null}
    </Select>
  );
}
