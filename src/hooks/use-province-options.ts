'use client';

import * as React from 'react';
import { getProvinceOptions } from '@/lib/api';
import type { ProvinceOption } from '@/lib/types';
import { provinceNameMap, type ProvinceNameMap } from '@/lib/province-labels';

// Danh sách 34 tỉnh gần như bất biến → nạp MỘT lần cho cả phiên và dùng chung giữa bảng chuyến
// và các hộp chi tiết (mỗi lần mở chi tiết mà gọi lại là phí request). Lỗi KHÔNG được nhớ: lần
// mở sau thử lại.
let cached: Promise<ProvinceOption[]> | null = null;

function loadProvinceOptions(): Promise<ProvinceOption[]> {
  if (!cached) {
    // Gọi trong try để một mock/api thiếu hàm cũng chỉ ra danh sách rỗng, không vỡ trang.
    cached = Promise.resolve()
      .then(() => getProvinceOptions())
      .catch(() => {
        cached = null;
        return [] as ProvinceOption[];
      });
  }
  return cached;
}

/** Chỉ cho test: bỏ cache giữa các ca. */
export function resetProvinceOptionsCache(): void {
  cached = null;
}

const EMPTY: ProvinceOption[] = [];
const EMPTY_NAMES: ProvinceNameMap = {};

/**
 * Tỉnh theo mã gis. Soft-fail: tải lỗi → danh sách rỗng, nhãn rơi về "Mã tỉnh <mã>" (riêng '01'
 * luôn là "Nội đô Hà Nội"), bộ lọc chỉ còn "Tất cả"/"Thiếu mã tỉnh".
 */
export function useProvinceOptions(): { options: ProvinceOption[]; names: ProvinceNameMap } {
  const [options, setOptions] = React.useState<ProvinceOption[]>(EMPTY);
  React.useEffect(() => {
    let cancelled = false;
    void loadProvinceOptions().then((o) => {
      if (!cancelled) setOptions(o);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const names = React.useMemo(() => (options.length ? provinceNameMap(options) : EMPTY_NAMES), [options]);
  return { options, names };
}
