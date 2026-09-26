import { defaultFilter } from "cmdk"

// Bỏ dấu tiếng Việt (NFD + xoá combining marks), đ/Đ → d, hạ chữ thường.
export function foldVietnamese(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
}

// Filter cho cmdk: gõ "ha noi" vẫn khớp "Hà Nội". Giữ cách chấm điểm fuzzy mặc định
// của cmdk, chỉ gập dấu cả hai phía trước khi so.
export function vietnameseInsensitiveFilter(value: string, search: string, keywords?: string[]): number {
  return defaultFilter(foldVietnamese(value), foldVietnamese(search), keywords?.map(foldVietnamese))
}
