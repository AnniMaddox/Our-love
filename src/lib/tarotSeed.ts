/**
 * Seeded LCG shuffle — deterministic based on a string seed.
 * Uses the same seed every day (YYYY-MM-DD) to produce a consistent daily spread.
 */
export function seededShuffle<T>(arr: T[], seed: string): T[] {
  // Hash seed string to a 32-bit integer
  let s = 0;
  for (let i = 0; i < seed.length; i++) {
    s = ((s * 31) + seed.charCodeAt(i)) >>> 0;
  }

  const result = [...arr];

  // Fisher-Yates shuffle with LCG random
  for (let i = result.length - 1; i > 0; i--) {
    s = ((s * 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }

  return result;
}

export function todayDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
