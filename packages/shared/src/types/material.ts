import type { MaterialCategory } from '../schemas/material.js';

/** A material with the rate that currently applies. */
export interface Material {
  id: string;
  name: string;
  category: MaterialCategory;
  unit: string;
  density: number | null;
  isActive: boolean;
  sortOrder: number;

  /** Rate in force on the requested date, and the one before it. */
  currentRate: number | null;
  currentRateDate: string | null;
  previousRate: number | null;
  previousRateDate: string | null;
  /** Percentage move from previous to current. Null when either is missing. */
  changePercent: number | null;
}

export interface MaterialRateHistoryEntry {
  id: string;
  rate: number;
  effectiveDate: string;
  enteredBy: string;
}

export interface RatesSaveResult {
  effectiveDate: string;
  created: number;
  updated: number;
  unchanged: number;
}
