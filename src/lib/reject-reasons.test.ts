import { describe, it, expect } from 'vitest';
import { combineRejectReason } from './reject-reasons';

describe('combineRejectReason', () => {
  it('returns empty string when nothing selected and no note', () => {
    expect(combineRejectReason([], '')).toBe('');
  });

  it('renders a single reason as one bullet line', () => {
    expect(combineRejectReason(['license_blurry'])).toBe('- Ảnh bằng lái không rõ, không đọc được');
  });

  it('renders multiple reasons as bullet lines in REJECT_REASONS order, not selection order', () => {
    const result = combineRejectReason(['cccd_missing', 'license_blurry']);
    expect(result).toBe('- Ảnh bằng lái không rõ, không đọc được\n- Thiếu ảnh CCCD (mặt trước/sau)');
  });

  it('appends a trimmed note after a blank line', () => {
    const result = combineRejectReason(['license_blurry'], '  Chụp lại rõ nét  ');
    expect(result).toBe('- Ảnh bằng lái không rõ, không đọc được\n\nChụp lại rõ nét');
  });

  it('returns only the note when no reasons selected', () => {
    expect(combineRejectReason([], 'Hồ sơ không hợp lệ')).toBe('Hồ sơ không hợp lệ');
  });

  it('ignores unknown reason values', () => {
    expect(combineRejectReason(['does_not_exist', 'cccd_blurry'])).toBe('- Ảnh CCCD không rõ, không đọc được');
  });

  it('ignores a whitespace-only note', () => {
    expect(combineRejectReason(['other'], '   ')).toBe('- Lý do khác');
  });
});
