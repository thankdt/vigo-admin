/**
 * Tiêu đề ô drill-down từ giá trị các chiều của dòng vừa bấm.
 *
 * Cặp tỉnh phải đọc ra HƯỚNG: "Hà Nội · Hải Phòng" mơ hồ (đi hay về?), nên `provinceFrom` +
 * `provinceTo` được gộp thành "Hà Nội → Hải Phòng" ở vị trí của chiều đầu tiên; các chiều khác
 * giữ thứ tự và nối bằng " · ".
 */
export function drilldownTitle(dims: Record<string, string>): string {
  const hasPair = 'provinceFrom' in dims && 'provinceTo' in dims;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(dims)) {
    if (hasPair && key === 'provinceFrom') {
      parts.push(`${value} → ${dims.provinceTo}`);
    } else if (hasPair && key === 'provinceTo') {
      continue;
    } else {
      parts.push(value);
    }
  }
  return parts.join(' · ');
}
