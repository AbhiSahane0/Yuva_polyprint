import type { ReactNode } from 'react';
import { MACHINE_KIND_LABELS, formatNumber, formatRs, type CostingBreakdown } from '@yuva/shared';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';

/**
 * Every figure behind the rate, in the order it was worked out.
 *
 * A rate nobody can explain is a rate nobody can defend across a table. The
 * office is asked "why is it 251?" by customers who have three other quotations
 * in front of them, and the answer has to be a chain of arithmetic rather than
 * a shrug — so this shows the working, not a summary of it.
 */
export function CostingBreakdownModal({
  breakdown,
  onClose,
}: {
  breakdown: CostingBreakdown | null;
  onClose: () => void;
}) {
  if (!breakdown) return null;
  const b = breakdown;

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`How ${formatRs(b.ratePerKg, 2)} a kilogram was worked out`}
      description={`${formatNumber(b.orderQtyKg, 0)} kg ordered · ${formatNumber(b.consumedKg, 0)} kg consumed after ${formatNumber(b.wastageKg, 0)} kg of wastage`}
    >
      <div className="space-y-5 text-sm">
        <Block title="The laminate">
          <Table
            head={['Ply', 'µ', 'Density', 'GSM', 'Share', 'kg', 'Metres', 'Rate', 'Cost']}
            rows={b.layers.map((layer) => [
              layer.name,
              formatNumber(layer.micron, 0),
              formatNumber(layer.density, 3),
              formatNumber(layer.gsm, 2),
              `${formatNumber(layer.shareOfGsm * 100, 1)}%`,
              formatNumber(layer.quantityKg, 2),
              formatNumber(layer.metres, 0),
              formatRs(layer.ratePerKg, 2),
              formatRs(layer.cost, 2),
            ])}
          />
          <Note>
            Total {formatNumber(b.totalGsm, 2)} GSM — film {formatNumber(b.substrateGsm, 2)}, ink{' '}
            {formatNumber(b.inkGsm, 2)}, adhesive {formatNumber(b.adhesiveGsm, 2)}. A kilogram is
            shared out in those proportions, and each ply&apos;s metres are its weight over the{' '}
            {formatNumber(b.webWidthMm, 0)} mm web.
          </Note>
        </Block>

        <Block title="Ink, bought wet">
          <Table
            head={['Colour', 'Laydown', 'Solids', 'Dry kg', 'Bought kg', 'Ink', 'Solvent', 'Cost']}
            rows={b.colours.map((colour) => [
              colour.name,
              `${formatNumber(colour.laydownGsm, 2)} gsm`,
              `${formatNumber(colour.solidsPercent, 1)}%`,
              formatNumber(colour.dryKg, 3),
              formatNumber(colour.wetKg, 3),
              formatRs(colour.inkCost, 2),
              formatRs(colour.solventCost, 2),
              formatRs(colour.cost, 2),
            ])}
          />
          <Note>
            Only the solids stay on the film. Everything else evaporates, so the works buys{' '}
            <strong>100 ÷ solids</strong> kilograms of liquid for every kilogram laid down, and
            thins it with solvent on top.
          </Note>
        </Block>

        <Block title="Adhesive, as a diluted batch">
          <Table
            head={['Ratio', 'Solids', 'Batch kg', 'Adhesive', 'Ethyl acetate', 'Hardener', 'Cost']}
            rows={[
              [
                b.adhesiveDetail.ratio,
                `${formatNumber(b.adhesiveDetail.batchSolidsPercent, 0)}%`,
                formatNumber(b.adhesiveDetail.batchKg, 2),
                formatNumber(b.adhesiveDetail.adhesiveKg, 2),
                formatNumber(b.adhesiveDetail.ethylAcetateKg, 2),
                formatNumber(b.adhesiveDetail.hardenerKg, 2),
                formatRs(b.adhesiveDetail.cost, 2),
              ],
            ]}
          />
          <Note>
            Spread over the {formatNumber(b.substrateGsm, 2)} GSM of film, not over the whole
            laminate — adhesive does not stick to itself or to the ink.
          </Note>
        </Block>

        <Block title="Machines, and the people on them">
          <Table
            head={['Stage', 'Metres', 'Speed', 'Running', 'Setup', 'Power', 'Wages']}
            rows={b.processes.map((process) => [
              `${process.machine} (${MACHINE_KIND_LABELS[process.kind]})`,
              formatNumber(process.metres, 0),
              `${formatNumber(process.speedMPerMin, 0)} m/min`,
              `${formatNumber(process.runMinutes, 0)} min`,
              `${formatNumber(process.setupMinutes, 0)} min`,
              formatRs(process.electricityCost, 2),
              formatRs(process.labourCost, 2),
            ])}
          />
          <Note>
            {formatNumber(b.totalMachineMinutes, 0)} machine-minutes in all. Power and wages are
            both charged on the setup as well as the run — the machine is switched on and somebody
            is standing at it.
          </Note>
        </Block>

        <Block title="What it adds up to">
          <dl className="divide-ink-100 divide-y">
            <Line label="Film" value={b.filmCost} />
            <Line label="Ink and solvent" value={b.inkCost} />
            <Line label="Adhesive" value={b.adhesiveCost} />
            <Line label="Materials" value={b.materialCost} strong />
            <Line label="Wages" value={b.labourCost} />
            <Line label="Electricity" value={b.electricityCost} />
            <Line label="Transport" value={b.transportCost} />
            <Line label="Packing" value={b.packingCost} />
            <Line label="Sundries" value={b.otherCost} />
            <Line label="Bank EMI, over the machine time" value={b.emiCost} />
            <Line label="Cost before margin" value={b.costBeforeMargin} strong />
            <Line
              label={`Margin, ${formatNumber(b.marginPercent, 1)}% on ${
                b.marginBasis === 'MATERIAL_ONLY' ? 'materials' : 'the whole cost'
              }`}
              value={b.marginAmount}
            />
            <Line label="Total" value={b.totalCost} strong />
          </dl>
        </Block>

        <Block title="And per kilogram">
          <dl className="divide-ink-100 divide-y">
            <Line
              label={`Over ${formatNumber(b.orderQtyKg, 0)} kg ordered`}
              value={b.baseRatePerKg}
              decimals={2}
            />
            {b.stationSurchargePerKg > 0 ? (
              <Line label="Extra printing stations" value={b.stationSurchargePerKg} decimals={2} />
            ) : null}
            {b.pouchMakingPerKg > 0 ? (
              <Line label="Pouch making" value={b.pouchMakingPerKg} decimals={2} />
            ) : null}
            <Line label="Rate per kilogram" value={b.ratePerKg} decimals={2} strong />
          </dl>
          <Note>
            Divided by what was <strong>ordered</strong>, not by what was consumed — the wastage is
            already inside the cost, so dividing by the consumed weight would charge for it and then
            give it back. A piece weighs {formatNumber(b.pieceWeightG, 2)} g, so a kilogram is{' '}
            {formatNumber(b.piecesPerKg, 1)} of them at {formatRs(b.ratePerPiece, 2)} each. The
            margin is {formatNumber(b.marginOnRatePercent, 2)}% of the rate.
          </Note>
        </Block>
      </div>
    </Modal>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-ink-900 mb-2 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-ink-500 mt-2 text-xs">{children}</p>;
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    /* Its own scroller, so a wide table never scrolls the dialog sideways. */
    <div className="border-ink-200 overflow-x-auto rounded-[var(--radius-md)] border">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-ink-200 bg-ink-25 text-ink-500 border-b text-left">
            {head.map((cell, index) => (
              <th key={cell} className={cn('px-2.5 py-2 font-semibold', index > 0 && 'text-right')}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-ink-100 border-b last:border-0">
              {row.map((cell, index) => (
                <td
                  key={index}
                  className={cn(
                    'px-2.5 py-1.5 tabular-nums',
                    index === 0 ? 'text-ink-800 font-medium' : 'text-ink-600 text-right',
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Line({
  label,
  value,
  strong,
  decimals = 0,
}: {
  label: string;
  value: number;
  strong?: boolean;
  decimals?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <dt className={cn('text-sm', strong ? 'text-ink-900 font-semibold' : 'text-ink-600')}>
        {label}
      </dt>
      <dd
        className={cn(
          'text-sm tabular-nums',
          strong ? 'text-ink-900 font-semibold' : 'text-ink-700',
        )}
      >
        {formatRs(value, decimals)}
      </dd>
    </div>
  );
}
