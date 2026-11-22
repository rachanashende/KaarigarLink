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

/**
 * Words that describe a grade, temper or stock form of a material rather than a different
 * material ("aluminium sheet", "mild steel bar").
 */
const MATERIAL_QUALIFIERS = new Set([
  'grade', 'alloy', 'sheet', 'sheets', 'plate', 'plates', 'bar', 'bars', 'rod', 'rods', 'tube', 'tubes', 'pipe', 'pipes',
  'wire', 'coil', 'strip', 'extrusion', 'extrusions', 'casting', 'castings', 'forging', 'forgings', 'billet', 'block',
  'round', 'flat', 'profile', 'granules', 'pellets', 'resin', 'filament',
]);

/** Like normalizeMaterial, and also expands an alias at the start ("ss 304" -> "stainless steel 304"). */
function normalizeMaterialPhrase(raw: string): string {
  const cleaned = normalizeMaterial(raw);
  const [first, ...rest] = cleaned.split(' ');
  const alias = first ? MATERIAL_ALIASES[first] : undefined;
  return alias && rest.length ? [alias, ...rest].join(' ') : cleaned;
}

/**
 * M13 (BUG-04): how a job material relates to a material a workshop supports.
 *   - "exact": the same material ("Aluminum" and "aluminium").
 *   - "variant": the supported material followed by a grade or form, e.g. "aluminium 6061",
 *     "aluminium 6061-t6", "stainless steel 304", "mild steel sheet". The first extra word
 *     must contain a digit or be a known grade/form word, so "stainless steel" never counts
 *     as a variant of "steel", and "mild steel" never matches "stainless steel".
 *   - null: not compatible.
 */
export function materialMatch(jobMaterial: string, supported: string): 'exact' | 'variant' | null {
  const job = normalizeMaterialPhrase(jobMaterial);
  const base = normalizeMaterialPhrase(supported);
  if (!job || !base) return null;
  if (job === base) return 'exact';
  if (!job.startsWith(base + ' ')) return null;
  const next = job.slice(base.length + 1).split(/[\s,/]+/)[0] ?? '';
  return /\d/.test(next) || MATERIAL_QUALIFIERS.has(next) ? 'variant' : null;
}
