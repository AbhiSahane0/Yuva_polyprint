import { useEffect, useState } from 'react';
import {
  MATERIAL_CATEGORY_LABELS,
  type CreateMaterialInput,
  type Material,
  type MaterialCategory,
} from '@yuva/shared';
import { Button } from '@/components/ui/Button';
import { Field, Input, NumberInput, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/lib/toast';
import { ApiClientError } from '@/lib/api-client';
import { useCreateMaterial, useUpdateMaterial } from '../api/rate-api';

const CATEGORIES: MaterialCategory[] = ['FILM', 'INK', 'ADHESIVE', 'SOLVENT', 'CONSUMABLE'];

/**
 * Adding a material, and the figures a rate is worked out from.
 *
 * The price list held only prices. Everything the costing multiplies a price by
 * — a film's density, an ink's solids and laydown — was seeded once and then
 * unreachable, so a film the works started buying could not be added at all
 * without going to the database. W/O Poly, which is on every page of the
 * client's own workbook, was simply missing.
 *
 * Only the fields that mean something for the category are shown. Density on an
 * ink, or a laydown on a film, is a box nobody can answer.
 */
export function MaterialModal({
  open,
  material,
  onClose,
}: {
  open: boolean;
  /** Null adds a new one. */
  material: Material | null;
  onClose: () => void;
}) {
  const create = useCreateMaterial();
  const update = useUpdateMaterial();

  const [form, setForm] = useState({
    name: '',
    category: 'FILM' as MaterialCategory,
    unit: 'KG',
    density: '',
    solidsPercent: '',
    laydownGsm: '',
    inkKind: '' as '' | 'PROCESS' | 'SPECIAL',
    isActive: true,
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: material?.name ?? '',
      category: material?.category ?? 'FILM',
      unit: material?.unit ?? 'KG',
      density: material?.density != null ? String(material.density) : '',
      solidsPercent: material?.solidsPercent != null ? String(material.solidsPercent) : '',
      laydownGsm: material?.laydownGsm != null ? String(material.laydownGsm) : '',
      inkKind: material?.inkKind ?? '',
      isActive: material?.isActive ?? true,
    });
  }, [open, material]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const isFilm = form.category === 'FILM';
  const isInk = form.category === 'INK';
  const takesSolids = isInk || form.category === 'ADHESIVE';

  /** Blank means "not recorded", which is not the same as zero. */
  const optional = (value: string): number | null => (value.trim() === '' ? null : Number(value));

  const pending = create.isPending || update.isPending;

  async function onSave() {
    if (form.name.trim().length < 2) {
      toast.error('Give the material a name');
      return;
    }

    const input: CreateMaterialInput = {
      name: form.name.trim(),
      category: form.category,
      unit: form.unit.trim() || 'KG',
      density: isFilm ? optional(form.density) : null,
      solidsPercent: takesSolids ? optional(form.solidsPercent) : null,
      laydownGsm: isInk ? optional(form.laydownGsm) : null,
      inkKind: isInk && form.inkKind !== '' ? form.inkKind : null,
      isActive: form.isActive,
      sortOrder: material?.sortOrder ?? 50,
    };

    try {
      if (material) await update.mutateAsync({ id: material.id, input });
      else await create.mutateAsync(input);
      toast.success(material ? `${input.name} updated` : `${input.name} added`);
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not save the material');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={material ? material.name : 'Add a material'}
      description={
        material
          ? 'The figures the costing works this material’s cost out from. Its price is on the list behind.'
          : 'A new row on the price list. Its rate is typed on the list itself, once it is here.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void onSave()} loading={pending}>
            {material ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Name" htmlFor="material-name">
            <Input
              id="material-name"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              placeholder="W/O Poly 110µm"
            />
          </Field>
        </div>

        <Field label="Kind" htmlFor="material-category">
          <Select
            id="material-category"
            value={form.category}
            onChange={(event) => set('category', event.target.value as MaterialCategory)}
            /* Moving a priced film into Ink would strip the density it is
               costed on, so the kind is settled when it is created. */
            disabled={material !== null}
          >
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {MATERIAL_CATEGORY_LABELS[category]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Sold by" htmlFor="material-unit" hint="KG, L, or whatever the invoice says">
          <Input
            id="material-unit"
            value={form.unit}
            onChange={(event) => set('unit', event.target.value.toUpperCase())}
            maxLength={8}
          />
        </Field>

        {isFilm ? (
          <div className="sm:col-span-2">
            <Field
              label="Density"
              htmlFor="material-density"
              hint="Grams per cubic centimetre — PET 1.4, poly 0.94, BOPP 0.91, foil 2.71. This is what turns a micron into a weight, so it decides how many pouches come out of a kilogram."
            >
              <NumberInput
                id="material-density"
                value={form.density}
                onChange={(event) => set('density', event.target.value)}
                placeholder="0.94"
              />
            </Field>
          </div>
        ) : null}

        {takesSolids ? (
          <Field
            label="Solids %"
            htmlFor="material-solids"
            hint="How much of the tin stays on the film. The rest evaporates and still has to be bought."
          >
            <NumberInput
              id="material-solids"
              value={form.solidsPercent}
              onChange={(event) => set('solidsPercent', event.target.value)}
              placeholder="23"
            />
          </Field>
        ) : null}

        {isInk ? (
          <Field
            label="Laydown g/m²"
            htmlFor="material-laydown"
            hint="Dry ink this colour lays. A process colour is about 0.13; an opaque white is 1.8."
          >
            <NumberInput
              id="material-laydown"
              value={form.laydownGsm}
              onChange={(event) => set('laydownGsm', event.target.value)}
              placeholder="0.13"
            />
          </Field>
        ) : null}

        {isInk ? (
          <Field
            label="Process or special"
            htmlFor="material-inkkind"
            hint="Cyan, magenta, yellow and black are on every press; everything else is one customer’s brand."
          >
            <Select
              id="material-inkkind"
              value={form.inkKind}
              onChange={(event) => set('inkKind', event.target.value as '' | 'PROCESS' | 'SPECIAL')}
            >
              <option value="">— not set —</option>
              <option value="PROCESS">Process</option>
              <option value="SPECIAL">Special</option>
            </Select>
          </Field>
        ) : null}

        <label className="text-ink-700 flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => set('isActive', event.target.checked)}
            className="accent-brand-600 size-4 cursor-pointer"
          />
          On the price list
          <span className="text-ink-400 text-xs">
            — turn off for something the works has stopped buying. Quotations already made keep it.
          </span>
        </label>
      </div>
    </Modal>
  );
}
