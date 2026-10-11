import { getDriverNotePresets, type DriverNotePreset } from '@/lib/api';

let cache: Promise<DriverNotePreset[]> | null = null;

/** Danh mục dùng chung cho mọi dòng trong danh sách — chỉ 1 request. Lỗi thì xoá cache để thử lại. */
export function loadDriverNotePresets(force = false): Promise<DriverNotePreset[]> {
  if (!cache || force) {
    cache = getDriverNotePresets().catch((err) => {
      cache = null;
      throw err;
    });
  }
  return cache;
}

/** Chỉ cho test. */
export function resetDriverNotePresetsCache() {
  cache = null;
}

export type NoteOption = { label: string; value: string; legacy: boolean };

/**
 * Các lựa chọn của dropdown. Ghi chú cũ gõ tay (không thuộc danh mục) vẫn phải hiện để
 * không "biến mất" khỏi ô chọn — hiện đầu danh sách với tiền tố "(tự nhập)".
 */
export function buildNoteOptions(presets: DriverNotePreset[], value: string | null): NoteOption[] {
  const opts = presets.map((p) => ({ label: p.label, value: p.label, legacy: false }));
  const v = (value ?? '').trim();
  if (v && !presets.some((p) => p.label === v)) {
    return [{ label: `(tự nhập) ${v}`, value: v, legacy: true }, ...opts];
  }
  return opts;
}
