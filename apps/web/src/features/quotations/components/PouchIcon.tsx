import { useEffect, useId, useState } from 'react';
import { POUCH_TYPE_LABELS, type JobKind, type PouchType } from '@yuva/shared';

/**
 * The pouches this works produces, drawn as products rather than diagrams.
 *
 * An outline told the office nothing the dropdown had not already told them.
 * What they recognise is the object: a laminate with a sheen on it, a printed
 * panel, a gusset that makes it stand. So each construction is drawn filled —
 * film gradient, label band, folds, contact shadow — and given its own colour,
 * so a grid of them reads as a product range instead of a legend.
 *
 * Colours are fixed rather than themed. These stand in for photographs, and a
 * photograph does not invert in dark mode; the card around them carries the
 * selection state instead.
 */

/** One accent per construction, so the grid is scannable by colour alone. */
const ACCENTS: Record<PouchType | 'ROLL', [string, string]> = {
  STANDUP: ['#e8863c', '#c9662a'],
  STANDUP_ZIPPER: ['#4c9d6b', '#357a50'],
  ZIPPER: ['#4a7fb5', '#33608f'],
  SPOUT: ['#8b6bb1', '#6b4f8e'],
  CENTRE_SEAL: ['#c9524e', '#a63b39'],
  THREE_SIDE_SEAL: ['#3f9ca6', '#2b7b84'],
  OTHER: ['#98a2b3', '#7a8496'],
  ROLL: ['#5b7a99', '#425c75'],
};

const FILM_LIGHT = '#f7f9fb';
const FILM_MID = '#e4e9ef';
const FILM_EDGE = '#c6cedb';
const FOLD = '#aab4c4';
const SEAL_BAND = '#dbe1e9';

interface ArtProps {
  /** Unique per render, so two icons on one page cannot share a gradient. */
  uid: string;
  accent: [string, string];
}

/** The film sheen: bright near the edges, falling away across the middle. */
function FilmGradients({ uid, accent }: ArtProps) {
  return (
    <defs>
      <linearGradient id={`${uid}-film`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={FILM_EDGE} />
        <stop offset="14%" stopColor={FILM_LIGHT} />
        <stop offset="46%" stopColor={FILM_MID} />
        <stop offset="72%" stopColor={FILM_LIGHT} />
        <stop offset="100%" stopColor={FILM_EDGE} />
      </linearGradient>
      <linearGradient id={`${uid}-label`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={accent[1]} />
        <stop offset="35%" stopColor={accent[0]} />
        <stop offset="100%" stopColor={accent[1]} />
      </linearGradient>
      <linearGradient id={`${uid}-seal`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#c9d2dd" />
        <stop offset="30%" stopColor={SEAL_BAND} />
        <stop offset="100%" stopColor="#c9d2dd" />
      </linearGradient>
    </defs>
  );
}

/** Two ruled lines standing in for whatever is printed on the panel. */
function LabelText({ y }: { y: number }) {
  return (
    <g fill="#fff" opacity={0.82}>
      <rect x="34" y={y} width="32" height="3.4" rx="1.7" />
      <rect x="40" y={y + 7} width="20" height="2.6" rx="1.3" opacity={0.72} />
    </g>
  );
}

/** The soft contact shadow that stops a pouch floating on the card. */
function Ground({ cy = 122, rx = 26 }: { cy?: number; rx?: number }) {
  return <ellipse cx="50" cy={cy} rx={rx} ry="3.6" fill="#0f172a" opacity={0.1} />;
}

/* ------------------------------------------------------------------ shapes */

function Standup({ uid, accent, zipper }: ArtProps & { zipper?: boolean }) {
  return (
    <>
      <FilmGradients uid={uid} accent={accent} />
      <Ground />
      {/* Body: the sides bow outward the way a filled pouch does. */}
      <path
        d="M25 20 C20 48 20 82 25 104 Q50 117 75 104 C80 82 80 48 75 20 Z"
        fill={`url(#${uid}-film)`}
      />
      {/* Top seal — flattened, and duller than the body it sits above. */}
      <path d="M23 12 h54 v9 h-54 Z" fill={`url(#${uid}-seal)`} />
      <path d="M23 12 h54" stroke={FOLD} strokeWidth="1.2" fill="none" opacity={0.6} />
      {/* Printed panel, following the body's curve at its edges. */}
      <path
        d="M25.6 44 C25.1 52 25.1 68 25.6 80 L74.4 80 C74.9 68 74.9 52 74.4 44 Z"
        fill={`url(#${uid}-label)`}
      />
      <LabelText y={54} />
      {/* Bottom gusset: the crease, then the fold beneath it in shadow. */}
      <path d="M25 104 Q50 117 75 104" stroke={FOLD} strokeWidth="1.4" fill="none" />
      <path d="M25 104 Q50 117 75 104 L75 108 Q50 121 25 108 Z" fill={FOLD} opacity={0.32} />
      {zipper ? (
        <>
          <rect x="27" y="27" width="46" height="4.5" rx="2.2" fill="#fff" opacity={0.85} />
          <path d="M29 29.2 h42" stroke={FOLD} strokeWidth="1.1" strokeDasharray="2 2.4" />
        </>
      ) : null}
    </>
  );
}

function FlatPouch({ uid, accent, zipper }: ArtProps & { zipper?: boolean }) {
  return (
    <>
      <FilmGradients uid={uid} accent={accent} />
      <Ground cy={118} rx={23} />
      <path d="M26 12 h48 v104 h-48 Z" fill={`url(#${uid}-film)`} />
      <path d="M26 12 h48 v9 h-48 Z" fill={`url(#${uid}-seal)`} />
      <path d="M26 107 h48 v9 h-48 Z" fill={`url(#${uid}-seal)`} />
      <rect x="26" y="42" width="48" height="40" fill={`url(#${uid}-label)`} />
      <LabelText y={54} />
      {zipper ? (
        <>
          <rect x="30" y="27" width="40" height="4.5" rx="2.2" fill="#fff" opacity={0.85} />
          <path d="M32 29.2 h36" stroke={FOLD} strokeWidth="1.1" strokeDasharray="2 2.4" />
        </>
      ) : null}
    </>
  );
}

function Spout({ uid, accent }: ArtProps) {
  return (
    <>
      <Standup uid={uid} accent={accent} />
      {/* Fitment welded through the top seal, with the cap above it. */}
      <rect x="56" y="4" width="9" height="10" rx="1.5" fill={accent[1]} />
      <rect x="53.5" y="0.5" width="14" height="6" rx="2" fill={accent[0]} />
      <rect x="56" y="6" width="9" height="1.6" fill="#fff" opacity={0.35} />
    </>
  );
}

function CentreSeal({ uid, accent }: ArtProps) {
  return (
    <>
      <FilmGradients uid={uid} accent={accent} />
      <Ground cy={110} rx={30} />
      {/* A pillow pack, both ends pinched flat and crimped. */}
      <path d="M25 22 Q50 15 75 22 L75 104 Q50 111 25 104 Z" fill={`url(#${uid}-film)`} />
      <path d="M25 22 Q50 15 75 22 L75 32 Q50 25 25 32 Z" fill={`url(#${uid}-seal)`} />
      <path d="M25 94 Q50 101 75 94 L75 104 Q50 111 25 104 Z" fill={`url(#${uid}-seal)`} />
      <path d="M25 46 Q50 39 75 46 L75 78 Q50 85 25 78 Z" fill={`url(#${uid}-label)`} />
      <LabelText y={56} />
      {/* The back seam that names the style, seen through the film. */}
      <path
        d="M50 18 V108"
        stroke={FOLD}
        strokeWidth="1.3"
        strokeDasharray="3 2.6"
        opacity={0.75}
      />
    </>
  );
}

function ThreeSideSeal({ uid, accent }: ArtProps) {
  return (
    <>
      <FilmGradients uid={uid} accent={accent} />
      <Ground cy={118} rx={22} />
      <path d="M22 14 h56 v102 h-56 Z" fill={`url(#${uid}-film)`} />
      {/* Sealed on three edges; the fourth is the fold, so it has no band. */}
      <path d="M22 14 h56 v8 h-56 Z" fill={`url(#${uid}-seal)`} />
      <path d="M22 14 h7 v102 h-7 Z" fill={`url(#${uid}-seal)`} />
      <path d="M71 14 h7 v102 h-7 Z" fill={`url(#${uid}-seal)`} />
      <rect x="29" y="42" width="42" height="42" fill={`url(#${uid}-label)`} />
      <LabelText y={54} />
      <path d="M29 14 v102 M71 14 v102" stroke={FOLD} strokeWidth="0.9" opacity={0.5} />
    </>
  );
}

function Roll({ uid, accent }: ArtProps) {
  return (
    <>
      <FilmGradients uid={uid} accent={accent} />
      <Ground cy={112} rx={30} />
      {/* The wound reel, printed film showing on the wrap. */}
      <path d="M16 40 a34 11 0 0 1 68 0 v46 a34 11 0 0 1 -68 0 Z" fill={`url(#${uid}-label)`} />
      <path d="M16 62 a34 11 0 0 0 68 0 v24 a34 11 0 0 1 -68 0 Z" fill="#0f172a" opacity={0.12} />
      <ellipse cx="50" cy="40" rx="34" ry="11" fill={`url(#${uid}-film)`} />
      <ellipse cx="50" cy="40" rx="11" ry="3.6" fill="#8b96a8" />
      <ellipse cx="50" cy="40" rx="11" ry="3.6" fill="none" stroke={FOLD} strokeWidth="1" />
      {/* The web running off the reel. */}
      <path
        d="M84 74 q10 4 11 18"
        stroke={accent[1]}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    </>
  );
}

function Other({ uid, accent }: ArtProps) {
  return (
    <>
      <FilmGradients uid={uid} accent={accent} />
      <Ground cy={118} rx={22} />
      <path d="M26 14 h48 v102 h-48 Z" fill={`url(#${uid}-film)`} opacity={0.85} />
      <path
        d="M26 14 h48 v102 h-48 Z"
        fill="none"
        stroke={FOLD}
        strokeWidth="1.6"
        strokeDasharray="5 4"
      />
      <text
        x="50"
        y="76"
        textAnchor="middle"
        fontSize="34"
        fontWeight="600"
        fill={accent[1]}
        opacity={0.75}
      >
        ?
      </text>
    </>
  );
}

/* ----------------------------------------------------------------- mapping */

const SHAPES: Record<PouchType, (props: ArtProps) => React.ReactElement> = {
  STANDUP: (p) => <Standup {...p} />,
  STANDUP_ZIPPER: (p) => <Standup {...p} zipper />,
  ZIPPER: (p) => <FlatPouch {...p} zipper />,
  SPOUT: (p) => <Spout {...p} />,
  CENTRE_SEAL: (p) => <CentreSeal {...p} />,
  THREE_SIDE_SEAL: (p) => <ThreeSideSeal {...p} />,
  OTHER: (p) => <Other {...p} />,
};

/* ---------------------------------------------------------------- artwork */

/**
 * Photographs of the real pouches, when they are available.
 *
 * Drop files into `apps/web/public/pouches/` using the names below and they
 * appear automatically — there is no code to edit and nothing to register. A
 * name that is not there simply falls back to the drawing, so the picker never
 * breaks while a set is half-finished.
 *
 * The files must be images this business owns or has licensed. That is why they
 * are supplied rather than fetched: a stock photograph of somebody else's pouch
 * would put a copyright liability inside the customer's software.
 *
 *   apps/web/public/pouches/
 *     standup.png          standup-zipper.png    zipper.png
 *     spout.png            centre-seal.png       three-side-seal.png
 *     other.png            roll.png
 *
 * What works best here: the pouch shot straight on against a transparent or
 * white background, product centred with a little room around it, roughly 4:5
 * (say 640 x 800). The card renders it with `object-contain`, so nothing is
 * cropped and any aspect ratio is safe — it just leaves more empty space the
 * further from 4:5 it gets.
 */
const ARTWORK_DIR = '/pouches';

/** Change this one line if the files are .webp or .jpg instead. */
const ARTWORK_EXT = 'png';

const SLUGS: Record<PouchType | 'ROLL', string> = {
  STANDUP: 'standup',
  STANDUP_ZIPPER: 'standup-zipper',
  ZIPPER: 'zipper',
  SPOUT: 'spout',
  CENTRE_SEAL: 'centre-seal',
  THREE_SIDE_SEAL: 'three-side-seal',
  OTHER: 'other',
  ROLL: 'roll',
};

/**
 * The picture for one construction — the supplied photograph if there is one,
 * the drawing otherwise.
 *
 * The fallback is driven by the image failing to load rather than by a list
 * somebody has to maintain: adding a file is the whole installation step, and
 * removing one puts the drawing back.
 *
 * A roll has no pouch style, so it is addressed by job kind: passing
 * `jobKind="ROLL"` gives the reel whatever `pouchType` says.
 */
export function PouchIcon({
  jobKind = 'POUCH',
  pouchType,
}: {
  jobKind?: JobKind;
  pouchType: PouchType | null;
}) {
  const uid = useId().replace(/:/g, '');
  const key: PouchType | 'ROLL' = jobKind === 'ROLL' ? 'ROLL' : (pouchType ?? 'OTHER');
  const label = key === 'ROLL' ? 'Printed film on the reel' : POUCH_TYPE_LABELS[key];

  const [artworkMissing, setArtworkMissing] = useState(false);

  // Reset when the construction changes, so one missing file does not suppress
  // the photograph of the next one the user clicks.
  useEffect(() => setArtworkMissing(false), [key]);

  if (!artworkMissing) {
    return (
      <img
        src={`${ARTWORK_DIR}/${SLUGS[key]}.${ARTWORK_EXT}`}
        alt={label}
        loading="lazy"
        onError={() => setArtworkMissing(true)}
        className="h-full w-full object-contain"
      />
    );
  }

  return (
    <svg viewBox="0 0 100 128" role="img" aria-label={label} className="h-full w-full">
      <title>{label}</title>
      {key === 'ROLL' ? (
        <Roll uid={uid} accent={ACCENTS[key]} />
      ) : (
        SHAPES[key]({ uid, accent: ACCENTS[key] })
      )}
    </svg>
  );
}
