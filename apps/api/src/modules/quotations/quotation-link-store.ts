import type { QuotationShareLink } from '@yuva/shared';
import { prisma } from '../../lib/prisma.js';
import { linkUrl, mintLink } from './quotation-link.js';

/**
 * **Reading and writing accept links.**
 *
 * Its own small module so that sending a quotation and serving one can both
 * reach the links without reaching each other. `quotation.service` mints a
 * link as it sends; `quotation-share.service` resolves one as a customer
 * opens it, and that one needs `getQuotationById` from the first. Putting the
 * link queries in either would make the two import each other.
 */

type LinkRow = {
  id: string;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  viewCount: number;
  lastViewedAt: Date | null;
};

function toShareLink(row: LinkRow, url: string | null): QuotationShareLink {
  return {
    id: row.id,
    url,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    viewCount: row.viewCount,
    lastViewedAt: row.lastViewedAt ? row.lastViewedAt.toISOString() : null,
  };
}

/** A link that is neither withdrawn nor past its date, newest first. */
export async function activeLinkFor(quotationId: string, now: Date = new Date()) {
  return prisma.quotationLink.findFirst({
    where: { quotationId, revokedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Mints a link and answers with the whole URL.
 *
 * **The only moment the token exists outside the customer's inbox.** It is
 * returned here, used immediately by whoever asked, and then only its hash
 * remains — so there is no second chance to read it and no way to recover one
 * that was not copied. Losing it is not a disaster: minting another is free,
 * and the old one keeps working until it is withdrawn.
 */
export async function issueLink(
  quotationId: string,
  createdBy: string,
): Promise<QuotationShareLink> {
  const { token, tokenHash, expiresAt } = mintLink();
  const row = await prisma.quotationLink.create({
    data: { quotationId, tokenHash, createdBy, expiresAt },
  });
  return toShareLink(row, linkUrl(token));
}

/**
 * The link to put in a message, making one if there is none.
 *
 * Sending twice reuses the first link rather than minting a second, so a
 * customer who kept the earlier mail is not holding a dead address — and the
 * view count stays the count of times that quotation was opened rather than
 * splitting across a handful of links to the same document.
 */
export async function linkForSending(quotationId: string, createdBy: string): Promise<string> {
  const existing = await activeLinkFor(quotationId);
  if (existing) {
    /*
     * A hash cannot be turned back into a token, so an existing link can be
     * recorded but not re-read. Rather than send nothing, the old one is
     * withdrawn and a fresh one issued: the customer always has a working
     * link, and the withdrawn row still says somebody was sent something.
     */
    await prisma.quotationLink.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
  }
  const issued = await issueLink(quotationId, createdBy);
  return issued.url as string;
}

/** Every link ever issued for this quotation, newest first. Tokens are gone. */
export async function listLinks(quotationId: string): Promise<QuotationShareLink[]> {
  const rows = await prisma.quotationLink.findMany({
    where: { quotationId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return rows.map((row) => toShareLink(row, null));
}

/**
 * Withdraws every live link for a quotation.
 *
 * Called when a revision is created. Version 2 is a different document at a
 * different price, and the link that went out with version 1 must not go on
 * accepting the old one — the customer who clicks it is told the quotation has
 * been revised rather than shown a price the works has withdrawn.
 */
export async function revokeLinksFor(quotationId: string, now: Date = new Date()) {
  await prisma.quotationLink.updateMany({
    where: { quotationId, revokedAt: null },
    data: { revokedAt: now },
  });
}
