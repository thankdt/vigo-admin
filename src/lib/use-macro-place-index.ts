'use client';

import * as React from 'react';
import { getPricingMacroWards } from '@/lib/api';
import { buildSearchIndex, type SearchTarget } from '@/lib/ward-search';
import type { ProvinceOption, SpecialZone, WardOption } from '@/lib/types';

/** Cùng các giá trị với `WardsStatus` của ô «Tìm nhanh» (ward-quick-add) — truyền thẳng sang ô chọn điểm. */
export type MacroPlaceIndexStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Chỉ mục tìm điểm (xã/phường, «Cả tỉnh», điểm đặc biệt) cho các ô chọn điểm của thanh «Tìm quy tắc».
 *
 * Danh sách MỌI xã (~3.300 dòng) chỉ nạp khi `ensureLoaded()` được gọi lần đầu (ô chọn điểm gọi khi được focus), một
 * lần cho cả hai ô; gọi lại khi đang nạp / đã có thì không làm gì; sau LỖI thì gọi lại là thử lại. Cùng quy ước với hộp
 * thoại tạo hàng loạt (macro-bulk-dialog): máy chủ nuốt lỗi DB và trả [] ⇒ rỗng cũng là lỗi (không thì không bao giờ thử
 * lại và báo nhầm «không có kết quả»).
 *
 * `provinces` / `zones` do trang giữ: truyền MẢNG ỔN ĐỊNH (state hoặc useMemo) — chỉ mục chỉ dựng lại khi một trong
 * ba danh sách đổi. Trong lúc chưa có xã, chỉ mục vẫn tìm được tỉnh và điểm đặc biệt.
 */
export function useMacroPlaceIndex({ provinces, zones }: { provinces: ProvinceOption[]; zones: SpecialZone[] }): {
  index: SearchTarget[];
  wardsStatus: MacroPlaceIndexStatus;
  wardsError: string | null;
  /** Ổn định qua các lần render (an toàn khi đặt vào deps). */
  ensureLoaded: () => void;
} {
  const [wards, setWards] = React.useState<WardOption[] | null>(null);
  const [wardsStatus, setWardsStatus] = React.useState<MacroPlaceIndexStatus>('idle');
  const [wardsError, setWardsError] = React.useState<string | null>(null);
  const loaded = React.useRef(false);
  const inFlight = React.useRef(false);
  // Đặt lại `true` mỗi lần gắn: StrictMode gắn → gỡ thử → gắn lại; nếu chỉ khởi tạo `true` một lần thì sau lần gỡ thử
  // mọi kết quả nạp sẽ bị bỏ và ô kẹt ở «đang tải».
  const mounted = React.useRef(false);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const ensureLoaded = React.useCallback(() => {
    if (loaded.current || inFlight.current) return;
    inFlight.current = true;
    setWardsStatus('loading');
    setWardsError(null);
    // Gọi NGAY (đồng bộ) nhưng bọc lại: một hàm giả trả undefined hay ném đồng bộ (test, bản API lạ) thành lỗi nạp
    // bình thường thay vì làm vỡ trình xử lý focus của ô chọn điểm.
    let request: Promise<WardOption[]>;
    try {
      request = Promise.resolve(getPricingMacroWards());
    } catch (e) {
      request = Promise.reject(e);
    }
    request
      .then((list) => {
        // Gỡ cờ TRƯỚC khi báo kết quả: người dùng bấm «Thử tải lại» ngay sau khi thấy lỗi phải gọi được API.
        inFlight.current = false;
        if (!mounted.current) return;
        if (!Array.isArray(list) || list.length === 0) {
          setWardsError('danh sách rỗng, máy chủ có thể đang lỗi');
          setWardsStatus('error');
          return;
        }
        loaded.current = true;
        setWards(list);
        setWardsStatus('ready');
      })
      .catch((e: unknown) => {
        inFlight.current = false;
        if (!mounted.current) return;
        const message = e instanceof Error ? e.message : (e as { message?: unknown } | null)?.message;
        setWardsError(typeof message === 'string' && message ? message : 'Không tải được danh sách phường/xã');
        setWardsStatus('error');
      });
  }, []);

  const index = React.useMemo(() => buildSearchIndex({ provinces, wards: wards ?? [], zones }), [provinces, wards, zones]);

  return { index, wardsStatus, wardsError, ensureLoaded };
}
