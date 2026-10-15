import { describe, it, expect } from 'vitest';
import {
  buildAssignedProvincePatch,
  buildProvinceOptions,
  driverWarning,
  formatShare,
  isCatalogProvince,
  isFollowUpOverdue,
  assignedProvinceLabels,
  provinceKeyOf,
  provinceNeedsDrivers,
  splitAssignedByCatalog,
  stageLabel,
  vnDay,
} from './driver-team-labels';

describe('stageLabel', () => {
  it('không có row = Tiềm năng, KHÔNG phải chuỗi rỗng', () => {
    expect(stageLabel(null)).toBe('Tiềm năng');
    expect(stageLabel(undefined)).toBe('Tiềm năng');
  });
  it('phân biệt họ-từ-chối với mình-loại', () => {
    expect(stageLabel('DECLINED')).toBe('Từ chối');
    expect(stageLabel('DROPPED')).toBe('Loại');
  });
  it('các bậc còn lại', () => {
    expect(stageLabel('CONTACTED')).toBe('Đã liên hệ');
    expect(stageLabel('INVITED')).toBe('Đã mời');
    expect(stageLabel('JOINED')).toBe('Trong team');
  });
});

describe('formatShare', () => {
  it('0..1 thành phần trăm 1 chữ số thập phân, dấu phẩy kiểu VN', () => {
    expect(formatShare(0.287)).toBe('28,7%');
  });
  it('0 và null đều ra "—", không ra "NaN%" hay "0,0%"', () => {
    expect(formatShare(0)).toBe('—');
    expect(formatShare(null)).toBe('—');
    expect(formatShare(undefined)).toBe('—');
  });
});

describe('driverWarning', () => {
  const base = {
    driverId: 'd', fullName: 'A', phone: '09', transportCompanyName: null,
    tripsInProvince: 1, tripsAll: 1, shareOfProvince: 1,
    lastCompletedAt: null, firstCompletedAt: null,
    isApproved: true, isBanned: false, suspendedUntil: null, team: null,
  } as any;

  it('bị khoá cứng → cảnh báo ban (ưu tiên cao nhất)', () => {
    expect(driverWarning({ ...base, isBanned: true })).toBe('Đang bị khoá');
  });
  it('khoá tạm CÒN hạn mới cảnh báo', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(driverWarning({ ...base, suspendedUntil: future })).toBe('Đang tạm khoá');
  });
  it('khoá tạm ĐÃ hết hạn thì KHÔNG cảnh báo', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(driverWarning({ ...base, suspendedUntil: past })).toBeNull();
  });
  it('chưa duyệt hồ sơ → cảnh báo', () => {
    expect(driverWarning({ ...base, isApproved: false })).toBe('Chưa duyệt hồ sơ');
  });
  it('bình thường → null', () => {
    expect(driverWarning(base)).toBeNull();
  });
});

describe('provinceNeedsDrivers', () => {
  const r = (o: any) => ({
    provinceCode: '31', provinceName: 'Hải Phòng', driverCount: 0, completedTrips: 0, totalBookings: 0,
    lastCompletedAt: null, contactedCount: 0, joinedCount: 0, ...o,
  });

  it('có khách đặt mà 0 tài chạy xong → cần tuyển', () => {
    expect(provinceNeedsDrivers(r({ totalBookings: 12, driverCount: 0 }))).toBe(true);
  });
  it('không ai đặt → KHÔNG phải vấn đề tuyển tài', () => {
    expect(provinceNeedsDrivers(r({ totalBookings: 0, driverCount: 0 }))).toBe(false);
  });
  it('đã có tài chạy → không gắn cờ', () => {
    expect(provinceNeedsDrivers(r({ totalBookings: 12, driverCount: 3 }))).toBe(false);
  });
  it('hàng "Chưa xác định tỉnh" KHÔNG bao giờ gắn cờ thiếu tài', () => {
    expect(provinceNeedsDrivers(r({ provinceCode: null, totalBookings: 12, driverCount: 0 }))).toBe(
      false,
    );
  });
});

describe('provinceKeyOf', () => {
  it('mã tỉnh làm khoá; null → "none" (khớp path provinces/none/drivers)', () => {
    expect(provinceKeyOf({ provinceCode: '01' })).toBe('01');
    expect(provinceKeyOf({ provinceCode: null })).toBe('none');
  });
});

describe('assignedProvinceLabels', () => {
  it('dùng tên backend trả, đúng thứ tự mã', () => {
    expect(
      assignedProvinceLabels({
        assignedProvinceCodes: ['01', '31'],
        assignedProvinceNames: ['Nội đô Hà Nội', 'Hải Phòng'],
      }),
    ).toEqual(['Nội đô Hà Nội', 'Hải Phòng']);
  });
  it('thiếu tên (backend cũ) → "Mã tỉnh XX", không bỏ trống', () => {
    expect(assignedProvinceLabels({ assignedProvinceCodes: ['31'] })).toEqual(['Mã tỉnh 31']);
  });
  it('không có field nào → mảng rỗng', () => {
    expect(assignedProvinceLabels({})).toEqual([]);
  });
});

describe('buildProvinceOptions', () => {
  const row = (provinceCode: string | null, provinceName: string) => ({ provinceCode, provinceName });

  it('sắp theo TÊN tiếng Việt, không theo thứ tự backend (nhiều tài → nhiều chuyến)', () => {
    // Thứ tự backend trả: tỉnh đông chuyến trước, tỉnh 0 chuyến sau — đổi theo khoảng ngày.
    const opts = buildProvinceOptions([
      row('01', 'Nội đô Hà Nội'),
      row('79', 'TP. Hồ Chí Minh'),
      row('31', 'Hải Phòng'),
      row('48', 'Đà Nẵng'),
      row('91', 'An Giang'),
      row('92', 'Cần Thơ'),
      row('27', 'Bắc Ninh'),
    ]);
    expect(opts.map((o) => o.name)).toEqual([
      'An Giang',
      'Bắc Ninh',
      'Cần Thơ',
      // Đ đứng ngay sau D theo bảng chữ cái tiếng Việt, KHÔNG bị đẩy xuống cuối như khi sắp theo mã ký tự.
      'Đà Nẵng',
      'Hải Phòng',
      'Nội đô Hà Nội',
      'TP. Hồ Chí Minh',
    ]);
  });

  it('giữ nguyên cặp mã ↔ tên', () => {
    expect(buildProvinceOptions([row('48', 'Đà Nẵng'), row('31', 'Hải Phòng')])).toEqual([
      { code: '48', name: 'Đà Nẵng' },
      { code: '31', name: 'Hải Phòng' },
    ]);
  });

  it('bỏ hàng "Chưa xác định tỉnh" (provinceCode null) — không phải một tỉnh', () => {
    expect(buildProvinceOptions([row(null, 'Chưa xác định tỉnh'), row('31', 'Hải Phòng')])).toEqual([
      { code: '31', name: 'Hải Phòng' },
    ]);
  });

  it('trùng tên thì xếp ổn định theo mã', () => {
    const opts = buildProvinceOptions([row('99', 'Mã tỉnh X'), row('98', 'Mã tỉnh X')]);
    expect(opts.map((o) => o.code)).toEqual(['98', '99']);
  });

  it('không đổi mảng đầu vào', () => {
    const rows = [row('48', 'Đà Nẵng'), row('91', 'An Giang')];
    const copy = rows.map((r) => ({ ...r }));
    buildProvinceOptions(rows);
    expect(rows).toEqual(copy);
  });
});

describe('isCatalogProvince', () => {
  it('tỉnh mang tên thật = thuộc danh mục', () => {
    expect(isCatalogProvince({ code: '31', name: 'Hải Phòng' })).toBe(true);
  });
  it('nhãn dự phòng "Mã tỉnh XX" của backend = mã có số liệu nhưng NGOÀI danh mục', () => {
    expect(isCatalogProvince({ code: '99', name: 'Mã tỉnh 99' })).toBe(false);
  });
});

describe('buildAssignedProvincePatch', () => {
  // Danh mục backend nhận. '99'/'98'/'77' là mã đã giao từ trước nhưng nay ngoài danh mục.
  const catalog = new Set(['01', '31', '48']);

  it('không có mã mồ côi: gửi đúng tập vừa chọn, không bỏ gì', () => {
    expect(buildAssignedProvincePatch(['01', '31'], ['01'], catalog)).toEqual({
      codes: ['01', '31'],
      dropped: [],
    });
  });

  it('đang giao mã ngoài danh mục + chọn thêm tỉnh khác: mã mồ côi KHÔNG gửi lại, được báo đã bỏ', () => {
    // Backend trả 400 VAL_001 cho cả request nếu CÓ MỘT mã ngoài danh mục — gửi lại là mọi lần lưu hỏng.
    const { codes, dropped } = buildAssignedProvincePatch(['01', '31'], ['01', '99'], catalog);
    expect(codes).toEqual(['01', '31']);
    expect(codes).not.toContain('99');
    expect(dropped).toEqual(['99']);
  });

  it('gỡ mã mồ côi (phần hợp lệ giữ nguyên): gửi tập hợp lệ, báo mã đã bỏ', () => {
    expect(buildAssignedProvincePatch(['01'], ['01', '99'], catalog)).toEqual({
      codes: ['01'],
      dropped: ['99'],
    });
  });

  it('chỉ còn mã mồ côi rồi gỡ: gửi [] (bỏ hết) chứ không bỏ trống field', () => {
    expect(buildAssignedProvincePatch([], ['99'], catalog)).toEqual({ codes: [], dropped: ['99'] });
  });

  it('bỏ chọn hết tỉnh hợp lệ: gửi [] = bỏ hết, không báo bỏ mã nào', () => {
    expect(buildAssignedProvincePatch([], ['01'], catalog)).toEqual({ codes: [], dropped: [] });
  });

  it('nhiều mã mồ côi: báo đủ, mỗi mã một lần', () => {
    expect(buildAssignedProvincePatch(['01'], ['01', '98', '99', '98'], catalog)).toEqual({
      codes: ['01'],
      dropped: ['98', '99'],
    });
  });

  it('phòng thủ: mã ngoài danh mục lọt vào tập vừa chọn cũng bị bỏ và được báo', () => {
    expect(buildAssignedProvincePatch(['01', '77'], ['01'], catalog)).toEqual({
      codes: ['01'],
      dropped: ['77'],
    });
  });

  it('bỏ trùng, giữ thứ tự chọn', () => {
    expect(buildAssignedProvincePatch(['31', '01', '31'], [], catalog).codes).toEqual(['31', '01']);
  });

  it('danh mục RỖNG (chưa tải được): không lọc gì — KHÔNG coi mọi mã là mồ côi rồi xoá sạch phân công', () => {
    expect(buildAssignedProvincePatch(['01', '31'], ['01', '99'], new Set())).toEqual({
      codes: ['01', '31'],
      dropped: [],
    });
  });

  it('không đổi mảng đầu vào', () => {
    const selected = ['01', '31'];
    const assigned = ['01', '99'];
    buildAssignedProvincePatch(selected, assigned, catalog);
    expect(selected).toEqual(['01', '31']);
    expect(assigned).toEqual(['01', '99']);
  });
});

describe('splitAssignedByCatalog', () => {
  it('tách mã thuộc danh mục / ngoài danh mục, giữ thứ tự', () => {
    expect(splitAssignedByCatalog(['99', '31', '01', '98'], new Set(['01', '31']))).toEqual({
      inCatalog: ['31', '01'],
      outside: ['99', '98'],
    });
  });

  it('danh mục rỗng (chưa tải) → không có mã nào bị coi là ngoài danh mục', () => {
    expect(splitAssignedByCatalog(['01', '99'], new Set())).toEqual({
      inCatalog: ['01', '99'],
      outside: [],
    });
  });

  it('chưa giao tỉnh nào → cả hai rỗng', () => {
    expect(splitAssignedByCatalog([], new Set(['01']))).toEqual({ inCatalog: [], outside: [] });
  });
});

describe('isFollowUpOverdue — mốc theo ngày VN', () => {
  // 2026-08-10T20:00Z === 03:00 ngày 11/8 giờ VN.
  const nowMs = Date.parse('2026-08-10T20:00:00.000Z');

  it('hẹn hôm nay (giờ VN) là ĐẾN HẠN', () => {
    expect(isFollowUpOverdue('2026-08-11T02:00:00.000Z', nowMs)).toBe(true);
  });
  it('hẹn ngày mai giờ VN thì chưa tới hạn', () => {
    expect(isFollowUpOverdue('2026-08-12T02:00:00.000Z', nowMs)).toBe(false);
  });
  it('không hẹn → không quá hạn', () => {
    expect(isFollowUpOverdue(null, nowMs)).toBe(false);
  });
});

describe('vnDay', () => {
  it('23:30 giờ VN ngày 1/8 hiển thị là 2026-08-01, không phải 31/7', () => {
    expect(vnDay('2026-08-01T16:30:00.000Z')).toBe('2026-08-01');
  });
  it('null → "—"', () => {
    expect(vnDay(null)).toBe('—');
  });
});
