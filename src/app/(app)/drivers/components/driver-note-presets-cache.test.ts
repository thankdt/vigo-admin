import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDriverNotePresets } from '@/lib/api';
import { buildNoteOptions, loadDriverNotePresets, resetDriverNotePresetsCache } from './driver-note-presets-cache';

vi.mock('@/lib/api', () => ({ getDriverNotePresets: vi.fn() }));

const P = (label: string, sortOrder = 10) => ({ id: label, label, sortOrder });

describe('buildNoteOptions', () => {
  it('value thuộc danh mục → không thêm mục legacy', () => {
    const o = buildNoteOptions([P('A'), P('B')], 'A');
    expect(o.map((x) => x.value)).toEqual(['A', 'B']);
    expect(o.some((x) => x.legacy)).toBe(false);
  });
  it('value ngoài danh mục → mục "(tự nhập)" đứng đầu', () => {
    const o = buildNoteOptions([P('A')], 'jjj');
    expect(o[0]).toEqual({ label: '(tự nhập) jjj', value: 'jjj', legacy: true });
    expect(o).toHaveLength(2);
  });
  it('null / rỗng → không có legacy', () => {
    expect(buildNoteOptions([P('A')], null)).toHaveLength(1);
    expect(buildNoteOptions([P('A')], '  ')).toHaveLength(1);
  });
});

describe('loadDriverNotePresets', () => {
  beforeEach(() => {
    resetDriverNotePresetsCache();
    vi.mocked(getDriverNotePresets).mockReset();
  });
  it('gọi 2 lần chỉ 1 request; force=true gọi lại', async () => {
    vi.mocked(getDriverNotePresets).mockResolvedValue([P('A')]);
    await loadDriverNotePresets();
    await loadDriverNotePresets();
    expect(getDriverNotePresets).toHaveBeenCalledTimes(1);
    await loadDriverNotePresets(true);
    expect(getDriverNotePresets).toHaveBeenCalledTimes(2);
  });
  it('lỗi → xoá cache, lần sau gọi lại được', async () => {
    vi.mocked(getDriverNotePresets).mockRejectedValueOnce(new Error('boom'));
    await expect(loadDriverNotePresets()).rejects.toThrow('boom');
    vi.mocked(getDriverNotePresets).mockResolvedValueOnce([P('A')]);
    await expect(loadDriverNotePresets()).resolves.toEqual([P('A')]);
  });
});
