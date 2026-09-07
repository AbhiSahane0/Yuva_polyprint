import type { MaterialCategory } from '../schemas/material.js';

/** A material with the rate that currently applies. */
export interface Material {
  id: string;
  name: string;
  category: MaterialCategory;
  unit: string;
  density: number | null;
  /**
   * For inks and adhesives: what share of the tin stays on the film. The rest
   * evaporates, so several kilograms are bought for every one laid down.
   */
  solidsPercent: number | null;
  /** For inks: dry g/m² this colour lays. White runs far heavier than a process colour. */
  laydownGsm: number | null;
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
