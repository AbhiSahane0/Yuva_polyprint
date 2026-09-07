import { z } from 'zod';

export const materialCategorySchema = z.enum(['FILM', 'INK', 'ADHESIVE', 'SOLVENT', 'CONSUMABLE']);
export type MaterialCategory = z.infer<typeof materialCategorySchema>;

export const MATERIAL_CATEGORY_LABELS: Record<MaterialCategory, string> = {
  FILM: 'Films',
  INK: 'Ink',
  ADHESIVE: 'Adhesive',
  SOLVENT: 'Solvents',
  CONSUMABLE: 'Consumables',
};

export const createMaterialSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80),
  category: materialCategorySchema,
  unit: z.string().trim().min(1).max(8).default('KG'),
  /**
   * Only films need one — it converts microns to weight. Inks and adhesives are
   * specified by weight already.
   */
  density: z.coerce.number().positive().max(10).nullable().optional(),
  /**
   * Ink and adhesive only. Without the solids share a laydown costed against
   * the purchase rate understates the ink three to five times over, because
   * most of what is bought evaporates.
   */
  solidsPercent: z.coerce.number().positive().max(100).nullable().optional(),
  /** Dry g/m² this colour lays. A white base coat is an order heavier. */
  laydownGsm: z.coerce.number().min(0).max(50).nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const updateMaterialSchema = createMaterialSchema.partial();

/** One line of the daily rate entry form. */
export const rateEntrySchema = z.object({
  materialId: z.string().min(1),
  /** Blank means "no change today"; the previous rate stays in force. */
  rate: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((value, ctx) => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'string' && value.trim() === '') return null;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        ctx.addIssue({ code: 'custom', message: 'Enter a rate' });
        return null;
      }
      return parsed;
    }),
});

export const saveRatesSchema = z.object({
  /** Defaults to today. Lets the office key in a rate they forgot yesterday. */
  effectiveDate: z.string().min(1).optional(),
  enteredBy: z.string().trim().max(80).default('Office'),
  entries: z.array(rateEntrySchema).min(1, 'Nothing to save').max(200),
});

export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type CreateMaterialFormValues = z.input<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;
export type SaveRatesInput = z.infer<typeof saveRatesSchema>;
