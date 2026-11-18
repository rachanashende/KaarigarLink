/**
 * Normalisation helpers so that matching compares like with like
 * ("Aluminum ", "ALUMINIUM" and "aluminium" are the same material).
 */
const MATERIAL_ALIASES: Record<string, string> = {
  aluminum: 'aluminium',
  ss: 'stainless steel',
  'stainless-steel': 'stainless steel',
  ms: 'mild steel',
  'mild-steel': 'mild steel',
  abs: 'abs plastic',
};

export function normalizeMaterial(raw: string): string {
  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  return MATERIAL_ALIASES[cleaned] ?? cleaned;
}

export function normalizeMaterials(list: string[]): string[] {
  return [...new Set(list.map(normalizeMaterial).filter(Boolean))];
}

/** "iso 9001" / "ISO-9001" -> "ISO_9001" */
export function normalizeCertification(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function normalizeCertifications(list: string[]): string[] {
  return [...new Set(list.map(normalizeCertification).filter(Boolean))];
}
