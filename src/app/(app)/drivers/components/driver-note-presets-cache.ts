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

// ── Đồng bộ giữa các ô chọn: mỗi dòng của danh sách giữ state riêng, nên khi 1 dòng đổi
// danh mục thì các dòng còn lại phải được báo để đọc lại (nếu không chúng giữ danh sách cũ
// và chọn lại nhãn đã đổi tên/xoá). `rename` cho bảng vá csNote của các dòng đang hiển thị.
export type PresetChange = { rename?: { from: string; to: string } };
const listeners = new Set<(c: PresetChange) => void>();

export function subscribeDriverNotePresets(fn: (c: PresetChange) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Đọc lại danh mục MỘT lần (force) rồi báo mọi ô chọn / bảng. */
export async function refreshDriverNotePresets(change: PresetChange = {}): Promise<void> {
  await loadDriverNotePresets(true);
  listeners.forEach((fn) => fn(change));
}
