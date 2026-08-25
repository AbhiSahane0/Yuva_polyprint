# Quotation letterhead assets

Drop the artwork here and the PDF picks it up automatically — no code change,
no redeploy. Files are read at boot and inlined as base64 into the document,
because the PDF renderer has no network access.

| File             | Where it appears                         | Guidance                                                     |
| ---------------- | ---------------------------------------- | ------------------------------------------------------------ |
| `header.png`     | Full-width band at the top of every page | ~1560 x 350 px. Logo, ISO mark, QR.                          |
| `footer.png`     | Full-width band pinned to the bottom     | ~1560 x 260 px. Support icons, product shots, contact strip. |
| `payment-qr.png` | Beside the bank details                  | Square. The UPI / payment QR.                                |

`.jpg`, `.jpeg` and `.svg` also work — the loader matches on the base name.

If a file is missing the document still renders, falling back to the CSS
rendition of the letterhead. Nothing breaks; it just looks less like the
printed original.

## Why the QR codes must be real files

A QR code encodes actual payment details. It cannot be recreated from a
description or approximated in CSS — a wrong or non-functional payment QR on a
customer-facing quotation is worse than none at all. These must be the real
exported images.
