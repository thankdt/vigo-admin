import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ProvinceOption, SpecialZone, WardOption } from './types';

const getWards = vi.fn();
vi.mock('@/lib/api', () => ({
  getPricingMacroWards: (...a: unknown[]) => getWards(...a),
}));

import { useMacroPlaceIndex } from './use-macro-place-index';

const PROVINCES: ProvinceOption[] = [
  { code: '01', name: 'Hà Nội' },
  { code: '19', name: 'Thái Nguyên' },
];
const WARDS: WardOption[] = [
  { code: '19001', name: 'Đại Từ', provinceCode: '19' },
  { code: '01004', name: 'Láng', provinceCode: '01' },
];
const ZONES: SpecialZone[] = [
  { code: 'NOIBAI', name: 'Sân bay Nội Bài', provinceCode: '01', provinceName: 'Hà Nội', kind: 'AIRPORT', active: true },
];

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const keys = (index: { key: string }[]) => index.map((t) => t.key);
const props = { provinces: PROVINCES, zones: ZONES };

beforeEach(() => {
  getWards.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMacroPlaceIndex — nạp MỌI xã một lần, khi được gọi', () => {
  it('lúc đầu: idle, chưa gọi API; chỉ mục đã có tỉnh + điểm đặc biệt (chưa có xã)', () => {
    const { result } = renderHook(() => useMacroPlaceIndex(props));
    expect(result.current.wardsStatus).toBe('idle');
    expect(result.current.wardsError).toBeNull();
    expect(getWards).not.toHaveBeenCalled();
    expect(keys(result.current.index)).toEqual(['province|01', 'province|19', 'zone|NOIBAI']);
  });

  it('ensureLoaded: idle → loading → ready; gọi API KHÔNG kèm mã tỉnh (mọi xã); chỉ mục có thêm xã', async () => {
    const d = deferred<WardOption[]>();
    getWards.mockReturnValue(d.promise);
    const { result } = renderHook(() => useMacroPlaceIndex(props));
    act(() => result.current.ensureLoaded());
    expect(result.current.wardsStatus).toBe('loading');
    expect(getWards).toHaveBeenCalledTimes(1);
    expect(getWards.mock.calls[0]).toEqual([]);
    await act(async () => d.resolve(WARDS));
    expect(result.current.wardsStatus).toBe('ready');
    expect(result.current.wardsError).toBeNull();
    expect(keys(result.current.index)).toEqual(
      expect.arrayContaining(['ward|19|19001', 'ward|01|01004', 'zone|NOIBAI', 'province|01']),
    );
  });

  it('gọi ensureLoaded nhiều lần (đang nạp, hoặc đã nạp xong) chỉ gọi API MỘT lần', async () => {
    const d = deferred<WardOption[]>();
    getWards.mockReturnValue(d.promise);
    const { result } = renderHook(() => useMacroPlaceIndex(props));
    act(() => {
      result.current.ensureLoaded();
      result.current.ensureLoaded();
    });
    act(() => result.current.ensureLoaded());
    expect(getWards).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve(WARDS));
    expect(result.current.wardsStatus).toBe('ready');
    act(() => result.current.ensureLoaded());
    expect(getWards).toHaveBeenCalledTimes(1);
    expect(result.current.wardsStatus).toBe('ready');
  });

  it('lỗi ⇒ error + câu lỗi; gọi lại ensureLoaded thì THỬ LẠI (loading, xoá câu lỗi) và nạp được', async () => {
    getWards.mockRejectedValueOnce(new Error('Mất kết nối'));
    const { result } = renderHook(() => useMacroPlaceIndex(props));
    await act(async () => result.current.ensureLoaded());
    expect(result.current.wardsStatus).toBe('error');
    expect(result.current.wardsError).toBe('Mất kết nối');

    const d = deferred<WardOption[]>();
    getWards.mockReturnValueOnce(d.promise);
    act(() => result.current.ensureLoaded());
    expect(result.current.wardsStatus).toBe('loading');
    expect(result.current.wardsError).toBeNull();
    expect(getWards).toHaveBeenCalledTimes(2);
    await act(async () => d.resolve(WARDS));
    expect(result.current.wardsStatus).toBe('ready');
    expect(keys(result.current.index)).toContain('ward|19|19001');
  });

  it('máy chủ trả danh sách RỖNG (nuốt lỗi DB) ⇒ coi là lỗi, cho thử lại', async () => {
    getWards.mockResolvedValueOnce([]).mockResolvedValueOnce(WARDS);
    const { result } = renderHook(() => useMacroPlaceIndex(props));
    await act(async () => result.current.ensureLoaded());
    expect(result.current.wardsStatus).toBe('error');
    expect(result.current.wardsError).toBe('danh sách rỗng, máy chủ có thể đang lỗi');
    expect(keys(result.current.index).some((k) => k.startsWith('ward|'))).toBe(false);
    await act(async () => result.current.ensureLoaded());
    expect(result.current.wardsStatus).toBe('ready');
    expect(getWards).toHaveBeenCalledTimes(2);
  });

  it('lỗi không có câu ⇒ câu mặc định tiếng Việt', async () => {
    getWards.mockRejectedValueOnce({});
    const { result } = renderHook(() => useMacroPlaceIndex(props));
    await act(async () => result.current.ensureLoaded());
    expect(result.current.wardsStatus).toBe('error');
    expect(result.current.wardsError).toBe('Không tải được danh sách phường/xã');
  });
});

describe('useMacroPlaceIndex — chỉ mục được ghi nhớ', () => {
  it('render lại với CÙNG mảng tỉnh/điểm đặc biệt ⇒ CÙNG chỉ mục; đổi mảng ⇒ dựng lại', () => {
    const { result, rerender } = renderHook(
      (p: { provinces: ProvinceOption[]; zones: SpecialZone[] }) => useMacroPlaceIndex(p),
      { initialProps: { provinces: PROVINCES, zones: ZONES } },
    );
    const first = result.current.index;
    rerender({ provinces: PROVINCES, zones: ZONES });
    expect(result.current.index).toBe(first);

    const more: SpecialZone[] = [
      ...ZONES,
      { code: 'TSN', name: 'Sân bay Tân Sơn Nhất', provinceCode: '79', provinceName: 'Hồ Chí Minh', kind: 'AIRPORT', active: true },
    ];
    rerender({ provinces: PROVINCES, zones: more });
    expect(result.current.index).not.toBe(first);
    expect(keys(result.current.index)).toContain('zone|TSN');

    const second = result.current.index;
    rerender({ provinces: [...PROVINCES, { code: '79', name: 'Hồ Chí Minh' }], zones: more });
    expect(result.current.index).not.toBe(second);
    expect(keys(result.current.index)).toContain('province|79');
  });

  it('nạp xong xã ⇒ chỉ mục dựng lại đúng một lần, sau đó giữ nguyên', async () => {
    getWards.mockResolvedValue(WARDS);
    const { result, rerender } = renderHook(() => useMacroPlaceIndex(props));
    const before = result.current.index;
    await act(async () => result.current.ensureLoaded());
    const after = result.current.index;
    expect(after).not.toBe(before);
    rerender();
    expect(result.current.index).toBe(after);
  });

  it('ensureLoaded giữ NGUYÊN danh tính qua các lần render (an toàn khi đặt vào deps của effect)', async () => {
    getWards.mockResolvedValue(WARDS);
    const { result, rerender } = renderHook(() => useMacroPlaceIndex(props));
    const first = result.current.ensureLoaded;
    rerender();
    expect(result.current.ensureLoaded).toBe(first);
    await act(async () => result.current.ensureLoaded());
    expect(result.current.wardsStatus).toBe('ready');
    expect(result.current.ensureLoaded).toBe(first);
  });
});

describe('useMacroPlaceIndex — an toàn khi gỡ khỏi màn hình', () => {
  it('gỡ khi đang nạp rồi API mới trả về: không lỗi, không cảnh báo React, không ghi thêm trạng thái', async () => {
    const d = deferred<WardOption[]>();
    getWards.mockReturnValue(d.promise);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useMacroPlaceIndex(props));
    act(() => result.current.ensureLoaded());
    unmount();
    await act(async () => d.resolve(WARDS));
    expect(errorSpy).not.toHaveBeenCalled();
    expect(result.current.wardsStatus).toBe('loading');
  });

  it('gỡ khi đang nạp rồi API báo lỗi: cũng không lỗi', async () => {
    const d = deferred<WardOption[]>();
    getWards.mockReturnValue(d.promise);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useMacroPlaceIndex(props));
    act(() => result.current.ensureLoaded());
    unmount();
    await act(async () => d.reject(new Error('x')));
    expect(errorSpy).not.toHaveBeenCalled();
    expect(result.current.wardsStatus).toBe('loading');
  });

  it('chạy dưới React.StrictMode (gắn → gỡ thử → gắn lại) vẫn nạp xong bình thường', async () => {
    const d = deferred<WardOption[]>();
    getWards.mockReturnValue(d.promise);
    // `reactStrictMode` của RTL đặt StrictMode ở GỐC: chỉ khi đó React 19 mới chạy effect hai lần (gắn → gỡ thử → gắn
    // lại). Bọc bằng `wrapper` thì không — đã đo: chỉ một lần 'setup'.
    const { result } = renderHook(() => useMacroPlaceIndex(props), { reactStrictMode: true });
    act(() => result.current.ensureLoaded());
    await act(async () => d.resolve(WARDS));
    await waitFor(() => expect(result.current.wardsStatus).toBe('ready'));
    expect(getWards).toHaveBeenCalledTimes(1);
  });
});
