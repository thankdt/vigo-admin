import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getDriverNotePresets,
  createDriverNotePreset,
  renameDriverNotePreset,
  deleteDriverNotePreset,
  API_BASE_URL,
} from './api';

/** Bốn client danh mục ghi chú tài xế: đúng đường dẫn, method, body và gỡ envelope. */
describe('driver-note-presets API clients', () => {
  let fetchMock: any;

  beforeEach(() => {
    localStorage.setItem('access_token', 'tok');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  const ok = (data: unknown) =>
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data }) });
  const url = () => String(fetchMock.mock.calls[0][0]);
  const init = () => fetchMock.mock.calls[0][1] ?? {};

  it('getDriverNotePresets: GET /drivers/admin/note-presets, gỡ envelope', async () => {
    ok([{ id: 'a', label: 'Chuyên chạy ghép', sortOrder: 10 }]);
    const res = await getDriverNotePresets();
    expect(url()).toBe(`${API_BASE_URL}/drivers/admin/note-presets`);
    expect(res).toEqual([{ id: 'a', label: 'Chuyên chạy ghép', sortOrder: 10 }]);
  });

  it('createDriverNotePreset: POST body {label}', async () => {
    ok({ id: 'b', label: 'Mới', sortOrder: 40 });
    const res = await createDriverNotePreset('Mới');
    expect(url()).toBe(`${API_BASE_URL}/drivers/admin/note-presets`);
    expect(init().method).toBe('POST');
    expect(JSON.parse(init().body)).toEqual({ label: 'Mới' });
    expect(res.id).toBe('b');
  });

  it('renameDriverNotePreset: PATCH /:id body {label}', async () => {
    ok({ id: 'a b', label: 'Đổi', sortOrder: 10 });
    await renameDriverNotePreset('a b', 'Đổi');
    expect(url()).toBe(`${API_BASE_URL}/drivers/admin/note-presets/a%20b`);
    expect(init().method).toBe('PATCH');
    expect(JSON.parse(init().body)).toEqual({ label: 'Đổi' });
  });

  it('deleteDriverNotePreset: DELETE /:id', async () => {
    ok({ deleted: true });
    await deleteDriverNotePreset('a');
    expect(url()).toBe(`${API_BASE_URL}/drivers/admin/note-presets/a`);
    expect(init().method).toBe('DELETE');
  });
});
