import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildGroupText, delayLabel, lastScanText, formatVnd, maskPhone, REJECT_HINT, REJECT_LABEL, addressText, shortId, vnTime, vnToday } from './pooling-labels';

describe('pooling-labels', () => {
  afterEach(() => vi.useRealTimers());

  it('mọi lý do loại đều có nhãn và giải thích — không để lộ mã máy ra UI', () => {
    for (const key of Object.keys(REJECT_LABEL)) {
      expect(REJECT_LABEL[key as keyof typeof REJECT_LABEL]).toBeTruthy();
      expect(REJECT_HINT[key as keyof typeof REJECT_HINT]).toBeTruthy();
    }
    expect(Object.keys(REJECT_LABEL)).toHaveLength(Object.keys(REJECT_HINT).length);
  });

  it('vnToday theo giờ VN, không theo giờ máy admin', () => {
    // 23:30 UTC 27/08 = 06:30 VN 28/08 — máy ở UTC vẫn phải ra ngày 28.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T23:30:00Z'));
    expect(vnToday()).toBe('2026-08-28');

    // 16:59 UTC = 23:59 VN cùng ngày.
    vi.setSystemTime(new Date('2026-08-27T16:59:00Z'));
    expect(vnToday()).toBe('2026-08-27');
  });

  it('vnToday luôn 2 chữ số', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-04T20:00:00Z'));
    expect(vnToday()).toBe('2026-01-05');
  });

  it('formatVnd theo kiểu Việt, null thành gạch ngang chứ KHÔNG thành 0', () => {
    // Hiện 0đ cho một nhóm chưa biết giá là nói dối admin về doanh thu.
    expect(formatVnd(430000)).toBe('430.000đ');
    expect(formatVnd(null)).toBe('—');
    expect(formatVnd(undefined)).toBe('—');
    expect(formatVnd(0)).toBe('0đ');
  });

  it('formatVnd nhận CHUỖI decimal và KHÔNG bao giờ hiện NaN', () => {
    // Lỗi thật 28/08: backend rò chuỗi decimal của TypeORM ra API, ô "Tổng
    // nhóm" hiện NaN. Backend đã ép số, đây là lớp phòng thủ thứ hai.
    expect(formatVnd('250000.00' as any)).toBe('250.000đ');
    expect(formatVnd('abc' as any)).toBe('—');
    expect(formatVnd(NaN)).toBe('—');
    expect(formatVnd(Infinity)).toBe('—');
  });

  it('addressText giữ NGUYÊN địa chỉ dài — admin chụp màn gửi tài xế, cắt là hỏng', () => {
    expect(addressText('Bến xe Mỹ Đình')).toBe('Bến xe Mỹ Đình');
    expect(addressText(null)).toBe('—');
    expect(addressText('   ')).toBe('—');
    const dai =
      'S403 Vinhomes Sapphire Parkville 2P3R+F7V, Đại lộ Thăng Long, Nam Từ Liêm, Hà Nội';
    expect(addressText(dai)).toBe(dai);
    expect(addressText(dai)).not.toContain('…');
  });

  it('vnTime đổi sang giờ VN, không theo giờ máy admin', () => {
    expect(vnTime('2026-08-28T01:00:00.000Z')).toBe('08:00');
    // Qua nửa đêm VN: 17:30 UTC = 00:30 hôm sau.
    expect(vnTime('2026-08-27T17:30:00.000Z')).toBe('00:30');
    expect(vnTime('2026-08-27T16:59:00.000Z')).toBe('23:59');
  });

  it('vnTime với mốc hỏng/rỗng → gạch ngang, KHÔNG ném', () => {
    expect(vnTime(null)).toBe('—');
    expect(vnTime('')).toBe('—');
    expect(vnTime('không-phải-ngày')).toBe('—');
  });

  it('delayLabel phân mức theo đúng ngân sách vòng thêm đã chốt (25 phút/khách)', () => {
    expect(delayLabel(null).level).toBe('unknown');
    expect(delayLabel(-40)).toEqual({ text: 'sớm 40′', level: 'ok' });
    expect(delayLabel(0)).toEqual({ text: 'đúng giờ', level: 'ok' });
    expect(delayLabel(10).level).toBe('ok');
    expect(delayLabel(11).level).toBe('warn');
    expect(delayLabel(25).level).toBe('warn');
    // Vượt ngân sách 25 phút/khách ⇒ đỏ.
    expect(delayLabel(26).level).toBe('bad');
  });

  it('maskPhone giữ 3 số đầu + 2 số cuối, đủ để nhận ra mà không đọc được', () => {
    expect(maskPhone('0912345678')).toBe('091•••••78');
    expect(maskPhone('0912 345 678')).toBe('091•••••78');
    expect(maskPhone(null)).toBe('—');
    expect(maskPhone('')).toBe('—');
    // Số ngắn bất thường thì che sạch, không để lộ gần hết.
    expect(maskPhone('123')).toBe('•••');
  });

  it('shortId rút gọn nhưng vẫn đủ phân biệt', () => {
    expect(shortId('0a1b2c3d-dead-beef-0000-111122223333')).toBe('0a1b2c3d');
  });
});


describe('buildGroupText — khối chữ copy cho tài xế', () => {
  const nhom = {
    totalSeats: 3,
    totalPrice: 430000,
    missingPriceCount: 0,
    pooledDistanceKm: 95.2,
    pooledDurationMin: 130,
    passengers: [
      {
        bookingId: 'aaaaaaaa-1111', isAnchor: true, customerName: 'Nguyễn A',
        routeName: 'Hà Nội - Hải Dương', pickupAddress: 'Bến xe Mỹ Đình',
        dropoffAddress: 'TP Hải Dương', seats: 1,
        pickupAt: '2026-08-28T00:00:00.000Z', etaPickupAt: '2026-08-28T00:00:00.000Z',
        price: 250000,
      },
      {
        bookingId: 'bbbbbbbb-2222', isAnchor: false, customerName: 'Trần B',
        routeName: 'Hà Nội - Hưng Yên', pickupAddress: 'Ngã tư Trâu Quỳ',
        dropoffAddress: 'TT Gia Lộc', seats: 2,
        pickupAt: '2026-08-28T00:30:00.000Z', etaPickupAt: '2026-08-28T00:35:00.000Z',
        price: 180000,
      },
    ],
    stops: [
      { bookingId: 'aaaaaaaa-1111', kind: 'DON' as const, etaAt: '2026-08-28T00:00:00.000Z' },
      { bookingId: 'bbbbbbbb-2222', kind: 'DON' as const, etaAt: '2026-08-28T00:35:00.000Z' },
      { bookingId: 'bbbbbbbb-2222', kind: 'TRA' as const, etaAt: '2026-08-28T01:40:00.000Z' },
      { bookingId: 'aaaaaaaa-1111', kind: 'TRA' as const, etaAt: '2026-08-28T02:10:00.000Z' },
    ],
  };

  it('KHÔNG BAO GIỜ chứa số điện thoại — lý do hàm này tồn tại', () => {
    // Copy nguyên bảng thì SĐT đi theo. Đây là chốt cho đúng chuyện đó.
    const text = buildGroupText(nhom as any);
    expect(text).not.toMatch(/09\d{8}/);
    expect(text).not.toMatch(/\d{9,11}/);
    expect(text.toLowerCase()).not.toContain('điện thoại');
  });

  it('có đủ tên, tuyến, điểm đón/trả, giờ và tiền', () => {
    const text = buildGroupText(nhom as any);
    expect(text).toContain('Nguyễn A');
    expect(text).toContain('Hà Nội - Hưng Yên');
    expect(text).toContain('Bến xe Mỹ Đình');
    expect(text).toContain('TT Gia Lộc');
    expect(text).toContain('250.000đ');
    expect(text).toContain('430.000đ');
    expect(text).toContain('95.2 km');
  });

  it('có THỨ TỰ đón/trả tối ưu, ghi tên và giờ dự trù', () => {
    const text = buildGroupText(nhom as any);
    expect(text).toContain('THỨ TỰ ĐÓN/TRẢ TỐI ƯU');
    expect(text).toContain('1. Đón Nguyễn A (07:00)');
    expect(text).toContain('2. Đón Trần B (07:35)');
    expect(text).toContain('4. Trả Nguyễn A (09:10)');
  });

  it('chưa sắp được thứ tự → bỏ hẳn mục đó, không in tiêu đề rỗng', () => {
    const text = buildGroupText({ ...nhom, stops: null } as any);
    expect(text).not.toContain('THỨ TỰ');
  });

  it('thiếu giá → nói rõ trong dòng tổng, không im lặng', () => {
    const text = buildGroupText({ ...nhom, missingPriceCount: 1 } as any);
    expect(text).toContain('chưa gồm 1 chuyến chưa có giá');
  });
});

describe('lastScanText — dòng cho biết job nền có chạy không', () => {
  const co = {
    runAt: '2026-08-29T02:25:00.000Z', // 09:25 giờ VN
    source: 'AUTO_JOB',
    scanned: 113,
    groups: 19,
    lone: 7,
    savedKm: 1368.7,
  };

  it('chưa quét lần nào thì trả null, để trang không hiện dòng rỗng', () => {
    expect(lastScanText(null)).toBeNull();
  });

  it('nói rõ HỆ THỐNG tự quét, kèm giờ VN', () => {
    // Đây là chỗ duy nhất admin thấy job nền tồn tại; ghi mỗi con số thì người
    // dùng vẫn tưởng phải bấm Quét mới có gì.
    const t = lastScanText(co)!;
    expect(t).toContain('Hệ thống tự quét lúc 09:25');
    expect(t).toContain('113 chuyến');
    expect(t).toContain('19 nhóm');
    expect(t).toContain('7 chuyến lẻ');
    expect(t).toContain('tiết kiệm 1368.7 km');
  });

  it('phân biệt người bấm Quét với job nền', () => {
    expect(lastScanText({ ...co, source: 'ADMIN_SCAN' })).toContain('Quét thủ công');
  });

  it('0 nhóm nói THẲNG là chưa ghép được, không im lặng', () => {
    // "113 chuyến" đứng một mình đọc như đang tải dở. 0 nhóm là kết quả có
    // nghĩa: hệ thống đã xem và không ghép được gì.
    const t = lastScanText({ ...co, groups: 0, savedKm: null })!;
    expect(t).toContain('chưa ghép được nhóm nào');
    expect(t).not.toContain('tiết kiệm');
  });

  it('bỏ qua các vế rỗng thay vì in "0 chuyến lẻ" / "tiết kiệm 0 km"', () => {
    const t = lastScanText({ ...co, lone: 0, savedKm: 0 })!;
    expect(t).not.toContain('chuyến lẻ');
    expect(t).not.toContain('tiết kiệm');
  });
});

describe('lastScanText — không được nhận nhầm VỎ response', () => {
  it('nhận object rỗng field thì KHÔNG in "undefined chuyến"', () => {
    // Bảo hiểm cho lỗi thật: `getPoolingLastScan` từng trả về cả vỏ
    // `{success:true,data:null}` khi backend trả null, và vỏ đó là object
    // truthy nên lọt qua `if (!s) return null`, in ra "undefined chuyến".
    // Sửa gốc nằm ở api.ts; đây là lớp chặn thứ hai.
    const vo = { success: true, data: null } as any;
    const t = lastScanText(vo);
    expect(t == null || !t.includes('undefined')).toBe(true);
  });
});
