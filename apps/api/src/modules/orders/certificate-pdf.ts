import { renderHtmlToPdf } from '../../lib/pdf.js';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../utils/api-error.js';
import {
  certificateTitle,
  renderCertificateHtml,
  type CertificateKind,
} from './certificate-document.js';

/** Hides the 'NA' the imported design data is full of. */
const text = (value: string | null | undefined): string =>
  !value || value === 'NA' || value === 'N/A' ? '' : value.trim();

const num = (value: { toNumber(): number } | null | undefined): number => {
  const parsed = value?.toNumber() ?? 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/**
 * The customer's address as it prints on an envelope.
 *
 * Built from the pieces rather than the imported source string: the source is
 * one run-on line with the mobile number buried in it, which is what the works
 * has been pasting into certificates — readable, but not an address.
 *
 * A piece the address line already names is dropped, since most of these came
 * off a sheet where the whole address sat in one cell: otherwise a certificate
 * goes to the customer reading "Tal. Sinnar, Dist Nashik 422 113" and then
 * "Sinnar, Nashik, 422113" underneath it.
 */
function addressLines(customer: {
  address: string;
  city: string;
  district: string;
  pincode: string;
  mobile: string;
}): string[] {
  const street = text(customer.address);
  /* Spaces and punctuation out of both sides: a pincode is written "422 113"
     as often as "422113", and neither contains the other as it stands. */
  const flattened = street.toLowerCase().replace(/[^a-z0-9]/g, '');
  const unsaid = (piece: string) => {
    const value = text(piece);
    if (!value) return '';
    return flattened.includes(value.toLowerCase().replace(/[^a-z0-9]/g, '')) ? '' : value;
  };

  const where = [unsaid(customer.city), unsaid(customer.district), unsaid(customer.pincode)]
    .filter(Boolean)
    .join(', ');

  return [street, where, text(customer.mobile) && `Mob. ${text(customer.mobile)}`].filter(
    (line): line is string => Boolean(line),
  );
}

/**
 * One certificate for one order, as a PDF.
 *
 * The order is what ties the three things a certificate needs together: the
 * customer it is addressed to, the design whose structure it certifies, and
 * the customer's own PO number. A certificate for a design nobody ordered
 * would have nothing to quote back.
 */
export async function renderCertificatePdf(
  orderId: string,
  kind: CertificateKind,
): Promise<{ pdf: Uint8Array; filename: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      number: true,
      jobName: true,
      customerName: true,
      customerPoNumber: true,
      customer: {
        select: {
          companyName: true,
          address: true,
          city: true,
          district: true,
          pincode: true,
          mobile: true,
        },
      },
      job: {
        select: {
          jobName: true,
          jobType: true,
          layer: true,
          petMicron: true,
          metPetMicron: true,
          polyMicron: true,
          polyType: true,
          totalCylinders: true,
          designHeight: true,
          designOpenWidth: true,
        },
      },
    },
  });

  if (!order) throw ApiError.notFound('That order is not on record');
  if (!order.job) {
    throw ApiError.badRequest(
      'This order is not against a design, and a certificate states what the design is made of',
    );
  }

  const job = order.job;

  const pdf = await renderHtmlToPdf(
    renderCertificateHtml({
      kind,
      /* Issued today. A certificate is dated the day it is given, which is why
         the works' own sheet puts TODAY() in that cell. */
      issuedOn: new Date().toISOString().slice(0, 10),
      poNumber: order.customerPoNumber,

      customerName: order.customer?.companyName ?? order.customerName,
      addressLines: order.customer ? addressLines(order.customer) : [],

      jobName: text(job.jobName) || order.jobName,
      jobType: text(job.jobType),
      layers: num(job.layer),
      petMicron: num(job.petMicron),
      metPetMicron: num(job.metPetMicron),
      polyMicron: num(job.polyMicron),
      polyType: text(job.polyType),
      /* One cylinder to a colour, which is how the works counts them — and
         what their own certificate prints in the colours row. */
      colours: num(job.totalCylinders),
      designHeightMm: num(job.designHeight),
      designOpenWidthMm: num(job.designOpenWidth),
    }),
  );

  const safeName = (text(job.jobName) || order.jobName)
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  const what = certificateTitle(kind).replace(/[^A-Za-z]+/g, '_');

  return { pdf, filename: `${what}_${safeName || 'Job'}_Order_${order.number}.pdf` };
}
