import { useEffect, useState } from 'react';
import { SPECIAL_COLOUR_GUIDES, formatRs } from '@yuva/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, NumberInput } from '@/components/ui/Field';
import { ApiClientError } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { useCreateSpecialColour } from '../api/costing-api';

/**
 * Adding a colour the works has just bought a tin of.
 *
 * Special colours are not a fixed list. Cyan, magenta, yellow and black are on
 * every press; everything after that is one customer's brand — a Pantone, a
 * metallic, an opaque white — and only becomes the works' business when
 * somebody orders it. So it is created from the quotation screen, where the
 * need actually arises, rather than sending the office to the rate catalogue
 * in the middle of pricing a job.
 *
 * It IS a material. This writes a real ink row with a real rate, which the
 * Rates screen then owns like every other price.
 */
export function SpecialColourModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Selects the new colour on the line that asked for it. */
  onCreated: (name: string) => void;
}) {
  const create = useCreateSpecialColour();
  const [name, setName] = useState('');
  const [laydown, setLaydown] = useState('');
  const [solids, setSolids] = useState('');
  const [rate, setRate] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setLaydown('');
    setSolids('');
    setRate('');
    setError(null);
  }, [open]);

  async function submit() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return setError('Give the colour a name — the one on the tin');
    if (!(Number(laydown) > 0)) return setError('How much it lays down decides most of its cost');
    if (!(Number(solids) > 0)) return setError('Without the solids share the ink is under-costed');
    if (!(Number(rate) > 0)) {
      return setError('A colour with no rate costs nothing, which is never true');
    }

    try {
      const created = await create.mutateAsync({
        name: trimmed,
        laydownGsm: Number(laydown),
        solidsPercent: Number(solids),
        ratePerKg: Number(rate),
      });
      toast.success(`${created.name} added and priced`);
      onCreated(created.name);
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError || caught instanceof Error
          ? caught.message
          : 'Could not add that colour',
      );
    }
  }

  /** Two thirds of the price is the wet weight, so it is worth showing. */
  const wetPerKgDry = Number(solids) > 0 ? 100 / Number(solids) : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a special colour"
      description="A Pantone, a metallic, an opaque white — anything past the four process colours."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={create.isPending}>
            Add and use it
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field
          label="Name"
          htmlFor="sc-name"
          hint="What the tin says — 'Pantone 485 C', 'Opaque White'"
        >
          <Input id="sc-name" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Laydown" htmlFor="sc-laydown" hint="dry g/m²">
            <NumberInput
              id="sc-laydown"
              value={laydown}
              onChange={(event) => setLaydown(event.target.value)}
            />
          </Field>
          <Field label="Solids" htmlFor="sc-solids" hint="% of the tin that stays">
            <NumberInput
              id="sc-solids"
              value={solids}
              onChange={(event) => setSolids(event.target.value)}
            />
          </Field>
          <Field label="Rate" htmlFor="sc-rate" hint="Rs per kg, as bought">
            <NumberInput
              id="sc-rate"
              value={rate}
              onChange={(event) => setRate(event.target.value)}
            />
          </Field>
        </div>

        {/*
          Starting points, not stored figures. Somebody entering their first
          spot colour has no idea whether 0.25 or 2.5 is the right order of
          magnitude, and the tin does not say grams per square metre.
        */}
        <div>
          <p className="text-ink-500 mb-1.5 text-xs">
            Not sure? Start from one of these and correct it once you have run the job.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SPECIAL_COLOUR_GUIDES.map((guide) => (
              <button
                key={guide.label}
                type="button"
                onClick={() => {
                  setLaydown(String(guide.laydownGsm));
                  setSolids(String(guide.solidsPercent));
                }}
                className="border-ink-200 text-ink-600 hover:bg-ink-50 cursor-pointer rounded-full border px-3 py-1.5 text-xs"
              >
                {guide.label}
                <span className="text-ink-400 ml-1.5">
                  {guide.laydownGsm} gsm · {guide.solidsPercent}%
                </span>
              </button>
            ))}
          </div>
        </div>

        {wetPerKgDry > 0 && Number(rate) > 0 ? (
          <p className="border-ink-200 bg-ink-25 text-ink-600 rounded-[var(--radius-md)] border px-3 py-2 text-xs">
            At {solids}% solids the works buys{' '}
            <strong className="text-ink-800">{wetPerKgDry.toFixed(1)} kg</strong> of liquid for
            every kilogram that stays on the film — so this colour effectively costs{' '}
            <strong className="text-ink-800">{formatRs(wetPerKgDry * Number(rate), 0)}</strong> a
            dry kilogram, before solvent.
          </p>
        ) : null}

        {error ? <p className="text-danger-600 text-sm">{error}</p> : null}
      </div>
    </Modal>
  );
}
