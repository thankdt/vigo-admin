import { describe, it, expect } from 'vitest';
import { applyEdit, summarizeSaveResults } from './system-config-edits';

describe('applyEdit — dirty tracking', () => {
  it('marks a field dirty when the value differs from the original', () => {
    const next = applyEdit({}, '200000', 'PRICING_BASE', '250000');
    expect(next).toEqual({ PRICING_BASE: '250000' });
  });

  it('clears the field (auto-undirty) when typed back to the original value', () => {
    const next = applyEdit({ PRICING_BASE: '250000' }, '200000', 'PRICING_BASE', '200000');
    expect(next).toEqual({});
  });

  it('tracks multiple independent keys without cross-contamination', () => {
    let edits: Record<string, string> = {};
    edits = applyEdit(edits, '200000', 'PRICING_BASE', '250000');
    edits = applyEdit(edits, '8', 'PRICING_VAT', '10');
    expect(edits).toEqual({ PRICING_BASE: '250000', PRICING_VAT: '10' });
    // revert only one
    edits = applyEdit(edits, '200000', 'PRICING_BASE', '200000');
    expect(edits).toEqual({ PRICING_VAT: '10' });
  });

  it('does not mutate the input edits object (React state safety)', () => {
    const input = { A: '1' };
    const next = applyEdit(input, '0', 'B', '2');
    expect(input).toEqual({ A: '1' });
    expect(next).toEqual({ A: '1', B: '2' });
    expect(next).not.toBe(input);
  });

  it('null-normalizes: original null, type then clear to empty → not dirty', () => {
    // original.value === null; display normalizes to '', so comparison must too
    const typed = applyEdit({}, null, 'MAYBE_NULL', 'x');
    expect(typed).toEqual({ MAYBE_NULL: 'x' });
    const cleared = applyEdit(typed, null, 'MAYBE_NULL', '');
    expect(cleared).toEqual({});
  });

  it('undefined original behaves like empty string', () => {
    const cleared = applyEdit({ K: 'typed' }, undefined, 'K', '');
    expect(cleared).toEqual({});
  });
});

describe('summarizeSaveResults — batch save outcome', () => {
  const ok = (): PromiseSettledResult<unknown> => ({ status: 'fulfilled', value: undefined });
  const fail = (msg: string): PromiseSettledResult<unknown> => ({ status: 'rejected', reason: new Error(msg) });

  it('all fulfilled → every key in okKeys, none failed', () => {
    const { okKeys, failKeys } = summarizeSaveResults(['A', 'B'], [ok(), ok()]);
    expect(okKeys).toEqual(['A', 'B']);
    expect(failKeys).toEqual([]);
  });

  it('partial failure → splits by positional correspondence keys[i] ↔ settled[i]', () => {
    const { okKeys, failKeys } = summarizeSaveResults(
      ['A', 'B', 'C'],
      [ok(), fail('boom'), ok()],
    );
    expect(okKeys).toEqual(['A', 'C']);
    expect(failKeys).toEqual(['B']);
  });

  it('all rejected → every key in failKeys', () => {
    const { okKeys, failKeys } = summarizeSaveResults(['A'], [fail('x')]);
    expect(okKeys).toEqual([]);
    expect(failKeys).toEqual(['A']);
  });
});
