// Pure dirty-tracking helpers for SystemConfigManager. Kept free of React/DOM so
// they're unit-testable in isolation (see system-config-edits.test.ts).

// Normalize a config value the SAME way the input displays it (`?? ''`). The API's
// `result.data` is untyped and may hand back null, so display uses `value ?? ''`;
// dirty comparison MUST normalize identically or a null-original field can never
// go clean after being typed into and cleared (`'' !== null`).
export const normalizeValue = (value: string | null | undefined): string => value ?? '';

// Apply one field edit against its ORIGINAL server value, returning a NEW edits map
// (never mutates the input — React state safety). When the typed value equals the
// original (after normalization) the key is removed so the field auto-undirties.
export function applyEdit(
  edits: Record<string, string>,
  originalValue: string | null | undefined,
  key: string,
  value: string,
): Record<string, string> {
  const next = { ...edits };
  if (value === normalizeValue(originalValue)) {
    delete next[key];
  } else {
    next[key] = value;
  }
  return next;
}

// Split a batch `Promise.allSettled` result into saved / failed keys by POSITIONAL
// correspondence: keys[i] ↔ settled[i]. Caller MUST build the settled array by
// mapping over this exact `keys` array in order.
export function summarizeSaveResults(
  keys: string[],
  settled: PromiseSettledResult<unknown>[],
): { okKeys: string[]; failKeys: string[] } {
  const okKeys: string[] = [];
  const failKeys: string[] = [];
  keys.forEach((key, i) => {
    if (settled[i]?.status === 'fulfilled') okKeys.push(key);
    else failKeys.push(key);
  });
  return { okKeys, failKeys };
}
