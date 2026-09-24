/**
 * **What a lamination row is actually about.**
 *
 * The works has two laminators and runs one of them. It also has jobs with two
 * lamination rows, and the two facts look connected on a screen that says
 * "Lamination 1" and "Lamination 2" — as though the job went on one machine and
 * then the other.
 *
 * It does not. **A laminator bonds two films at a time**, so a three-ply
 * laminate has to go through twice: PET to MET PET, then that to the LDPE. Both
 * passes run on whichever machine the works uses. The number is the pass, not
 * the machine.
 *
 * So the rows name the films they bond, which is the thing the number was being
 * mistaken for.
 */
export interface LaminationLabel {
  /** The heading: "Lamination", or "Lamination 2" where there is more than one. */
  title: string;
  /** What this pass bonds — "PET 12µm + MET PET 12µm". Empty when unknown. */
  bonds: string;
}

/**
 * `plies` is the structure outermost first, as the job was priced.
 *
 * Pass 1 bonds the first two. Every pass after it bonds what came off the
 * machine to the next ply down, which is why it reads as an addition rather
 * than a pair.
 *
 * A card whose structure the system does not know — an order typed over the
 * phone — gets the number and nothing else, rather than a guess at which films
 * are involved.
 */
export function laminationLabel(input: {
  /** 1-based. */
  pass: number;
  totalPasses: number;
  plies: string[];
}): LaminationLabel {
  const { pass, totalPasses, plies } = input;

  /* One pass is not "pass 1 of 1" — it is just lamination, and numbering it is
     what invited the question in the first place. */
  const title = totalPasses > 1 ? `Lamination ${pass}` : 'Lamination';

  if (pass < 1 || plies.length < pass + 1) return { title, bonds: '' };

  const bonds = pass === 1 ? `${plies[0]} + ${plies[1]}` : `+ ${plies[pass]}`;

  return { title, bonds };
}
