import { useEffect, useMemo, useState } from 'react';
import {
  MATERIAL_CATEGORY_LABELS,
  convertQuantity,
  purchaseUnitsFor,
  receiveStockSchema,
  unitLabel,
  type MaterialCategory,
} from '@yuva/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, NumberInput } from '@/components/ui/Field';
import { Combobox } from '@/components/ui/Combobox';
import { useMaterials } from '@/features/rates/api/rate-api';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useReceiveStock } from '../api/inventory-api';

/** Today, in the yyyy-mm-dd the date input and the schema both want. */
function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

const CATEGORIES: MaterialCategory[] = ['FILM', 'INK', 'ADHESIVE', 'SOLVENT', 'CONSUMABLE'];

/**
 * A delivery arriving.
 *
 * Two things make this more than a form. The material is a **combobox, not a
 * dropdown** — a film the works has not bought before is an ordinary event, and
 * the alternative is the office unable to book in a delivery until somebody
 * with the rates module adds it, which leaves the stock wrong until then. And
 * the quantity carries **the unit on the delivery note**: film is bought by the
 * tonne and stocked by the kilogram, and typing 2,000 where the note says 2 is
 * a thousand-fold error nothing on screen would question.
 */
export function ReceiveStockModal({
  open,
  onClose,
  materialId,
}: {
  open: boolean;
  onClose: () => void;
  /** Fixed when opened from a material's own page. */
  materialId?: string;
}) {
  const { data: materials } = useMaterials();
  const receive = useReceiveStock();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<MaterialCategory>('FILM');
  const [newUnit, setNewUnit] = useState('KG');
  const [unit, setUnit] = useState('');
  const [batchCode, setBatchCode] = useState('');
  const [quantity, setQuantity] = useState('');
  const [rate, setRate] = useState('');
  const [location, setLocation] = useState('');
  /* The reel that arrived. Off the delivery note — nothing downstream can work
     a width out, and a film without one cannot be told from any other width. */
  const [widthMm, setWidthMm] = useState('');
  const [micron, setMicron] = useState('');
  const [receivedOn, setReceivedOn] = useState(today());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => (materials ?? []).map((material) => material.name), [materials]);

  /** The catalogue entry this name matches, case-insensitively. */
  const matched = useMemo(
    () => (materials ?? []).find((m) => m.name.toLowerCase() === name.trim().toLowerCase()) ?? null,
    [materials, name],
  );

  /** Nothing on the list answers to this name, so it would be created. */
  const isNew = name.trim().length > 0 && matched === null;
  const stockUnit = matched?.unit ?? newUnit;
  const units = useMemo(() => purchaseUnitsFor(stockUnit), [stockUnit]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const fixed = (materials ?? []).find((m) => m.id === materialId);
    setName(fixed?.name ?? '');
    setCategory('FILM');
    setNewUnit('KG');
    setUnit(fixed?.unit ?? '');
    setBatchCode('');
    setQuantity('');
    setRate('');
    setLocation('');
    setWidthMm('');
    setMicron('');
    setReceivedOn(today());
    setReference('');
    setNotes('');
  }, [open, materialId, materials]);

  // The unit follows the material until somebody chooses otherwise, so picking
  // a solvent does not leave KG selected against something stocked in litres.
  useEffect(() => {
    if (!units.includes(unit.toUpperCase())) setUnit(units[0] ?? '');
  }, [units, unit]);

  /*
   * What will actually go into stock, when that differs from what was typed.
   *
   * Shown while typing rather than after saving: a tonne mistyped as a kilogram
   * is only obvious next to the figure it produces.
   */
  const converted =
    quantity.trim() && unit && unit.toUpperCase() !== stockUnit.toUpperCase()
      ? convertQuantity(Number(quantity), unit, stockUnit)
      : null;

  async function onSubmit() {
    setError(null);

    const payload = {
      materialId: matched?.id ?? null,
      newMaterial: isNew ? { name: name.trim(), category, unit: newUnit } : null,
      unit,
      batchCode,
      quantity,
      location,
      widthMm: widthMm === '' ? null : Number(widthMm),
      micron: micron === '' ? null : Number(micron),
      receivedOn,
      ratePerUnit: rate,
      reference,
      notes,
    };

    // Checked against the same schema the server uses, so the office is told
    // which field is wrong rather than "Validation failed".
    const parsed = receiveStockSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the details and try again.');
      return;
    }

    try {
      const batch = await receive.mutateAsync(parsed.data);
      toast.success(
        `Received ${batch.initialQuantity} ${batch.unit} of ${batch.materialName}` +
          (batch.purchaseUnit
            ? ` (${batch.purchaseQuantity} ${unitLabel(batch.purchaseUnit)})`
            : ''),
      );
      onClose();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : 'Could not record the delivery.');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Receive material"
      description="Records the delivery and opens a batch for it."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={receive.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} loading={receive.isPending}>
            Receive
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Material"
          htmlFor="materialName"
          hint={
            isNew
              ? 'Not on the rates list — it will be added, ready to be priced under Rates.'
              : 'Pick one, or type a name that is not on the list.'
          }
        >
          <Combobox
            id="materialName"
            options={options}
            value={name}
            registration={{
              name: 'materialName',
              onChange: async (event: { target: { value: string } }) => setName(event.target.value),
              onBlur: async () => {},
              ref: () => {},
            }}
            onPick={(picked) => setName(picked)}
            placeholder="PET 12µm, or a new material"
          />
        </Field>

        {/*
         * Only for something being created. An existing material's category and
         * unit are settled facts that belong on the Rates screen, not questions
         * to re-ask on every delivery.
         */}
        {isNew ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" htmlFor="newCategory">
              <Select
                id="newCategory"
                value={category}
                onChange={(event) => setCategory(event.target.value as MaterialCategory)}
              >
                {CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {MATERIAL_CATEGORY_LABELS[option]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Stocked in" htmlFor="newUnit" hint="The unit its rate will be quoted in">
              <Select
                id="newUnit"
                value={newUnit}
                onChange={(event) => setNewUnit(event.target.value)}
              >
                <option value="KG">Kilograms (KG)</option>
                <option value="L">Litres (L)</option>
                <option value="PCS">Pieces (PCS)</option>
              </Select>
            </Field>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Batch or lot" htmlFor="batchCode" hint="From the delivery note">
            <Input
              id="batchCode"
              value={batchCode}
              onChange={(event) => setBatchCode(event.target.value)}
              placeholder="PET-2026-081"
            />
          </Field>
          <Field label="Received on" htmlFor="receivedOn">
            <Input
              id="receivedOn"
              type="date"
              value={receivedOn}
              onChange={(event) => setReceivedOn(event.target.value)}
            />
          </Field>
        </div>

        {/*
         * The reel. Only worth asking for a film — ink and adhesive do not
         * come on one — and worth asking every time it is, because a job
         * needing 650 mm cannot run on a 340 mm reel however many kilograms
         * are behind it. The works' own stock register is kept this way.
         */}
        {(isNew ? category === 'FILM' : matched?.category === 'FILM') ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Reel width (mm)" htmlFor="widthMm" hint="What it runs at">
              <NumberInput
                id="widthMm"
                value={widthMm}
                onChange={(event) => setWidthMm(event.target.value)}
                placeholder="650"
              />
            </Field>
            <Field label="Micron" htmlFor="micron" hint="The gauge of this delivery">
              <NumberInput
                id="micron"
                value={micron}
                onChange={(event) => setMicron(event.target.value)}
                placeholder="12"
              />
            </Field>
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field
              label="Quantity"
              htmlFor="quantity"
              hint={
                converted !== null
                  ? `Goes into stock as ${converted} ${stockUnit}`
                  : `As it appears on the note`
              }
            >
              <NumberInput
                id="quantity"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </Field>
          </div>
          <Field label="Unit" htmlFor="unit">
            <Select
              id="unit"
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              disabled={units.length === 1}
            >
              {units.map((option) => (
                <option key={option} value={option}>
                  {unitLabel(option)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label={`Rate paid${unit ? ` per ${unitLabel(unit)}` : ''}`}
            htmlFor="ratePerUnit"
            hint="Optional — today's rate is used if blank"
          >
            <NumberInput
              id="ratePerUnit"
              value={rate}
              onChange={(event) => setRate(event.target.value)}
              placeholder="Rs."
            />
          </Field>
          <Field label="Location" htmlFor="location" hint="Where it is stored">
            <Input
              id="location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Warehouse A"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Reference" htmlFor="reference" hint="PO or invoice number">
            <Input
              id="reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="PO-4471"
            />
          </Field>
          <Field label="Notes" htmlFor="notes">
            <Input
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional"
            />
          </Field>
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
