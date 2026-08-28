import type { PoolRejectReason } from '@/lib/api';

/**
 * Nhãn tiếng Việt cho lý do KHÔNG ghép được.
 *
 * Với màn quan sát, phần này quan trọng ngang danh sách ghép được: thấy "hôm nay
 * không có gợi ý nào" mà không biết do ngưỡng chặt hay do thật sự không có nhu
 * cầu thì admin không rút ra được gì.
 */
export const REJECT_LABEL: Record<PoolRejectReason, string> = {
  CUNG_KHACH: 'Cùng một khách',
  DAT_LAI: 'Khách đặt lại',
  LECH_GIO: 'Lệch giờ',
  QUA_GHE: 'Quá số ghế',
  DON_LECH_HANH_LANG: 'Điểm đón lệch tuyến',
  TRA_LECH_HANH_LANG: 'Điểm trả lệch tuyến',
  NGUOC_CHIEU: 'Ngược chiều',
};

/** Giải thích thêm khi admin rê chuột — vì sao luật đó tồn tại. */
export const REJECT_HINT: Record<PoolRejectReason, string> = {
  CUNG_KHACH: 'Một khách không tự ghép với chính mình. Phần lớn là do khách đặt lại sau khi bị huỷ.',
  DAT_LAI: 'Trùng điểm đón/trả và sát giờ — cùng một chuyến đặt lại, không phải hai khách.',
  LECH_GIO: 'Giờ đón cách nhau quá khung cho phép.',
  QUA_GHE: 'Cộng vào thì vượt sức chứa xe.',
  DON_LECH_HANH_LANG: 'Điểm đón nằm quá xa lộ trình của chuyến chủ.',
  TRA_LECH_HANH_LANG: 'Điểm trả nằm quá xa lộ trình của chuyến chủ.',
  NGUOC_CHIEU: 'Điểm trả nằm TRƯỚC điểm đón dọc tuyến — chạy ngược, tài xế phải quay đầu.',
};

/** Ngày VN hôm nay dạng YYYY-MM-DD, không phụ thuộc múi giờ máy admin. */
export function vnToday(): string {
  const vn = new Date(Date.now() + 7 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${vn.getUTCFullYear()}-${p(vn.getUTCMonth() + 1)}-${p(vn.getUTCDate())}`;
}

/** Rút gọn id chuyến cho bảng hẹp. */
export const shortId = (id: string) => id.slice(0, 8);

/**
 * Tiền VND kiểu Việt: 430.000đ.
 *
 * Nhận cả CHUỖI: cột tiền bên backend khai `@Column('decimal')` và TypeORM trả
 * chuỗi, nên một API nào đó rò chuỗi ra là chuyện có thật — đã xảy ra 28/08,
 * ô "Tổng nhóm" hiện `NaN` trên màn admin.
 *
 * Không ra số hữu hạn ⇒ gạch ngang. Thà hiện "chưa biết" còn hơn hiện `NaN`
 * hay `0đ`: cả hai đều là nói dối admin về doanh thu, mà `NaN` ít ra còn nhìn
 * ra là hỏng, `0đ` thì không.
 */
export function formatVnd(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n).toLocaleString('vi-VN')}đ`;
}

/**
 * Địa chỉ ĐẦY ĐỦ, không cắt. Trước 28/08 hàm này cắt còn 42 ký tự và thêm dấu
 * `…`, nhưng màn này sinh ra để admin CHỤP MÀN HÌNH gửi nhóm tài xế — địa chỉ
 * cụt thì tài xế không tới được, tức là cắt chữ làm hỏng đúng công dụng chính.
 * Ô bảng cho xuống dòng thay vì cắt.
 */
export function addressText(a: string | null | undefined): string {
  const t = (a ?? '').trim();
  return t || '—';
}

/**
 * Giờ VN dạng `HH:mm` từ mốc ISO. Cộng thẳng 7 giờ rồi đọc bằng `getUTC*`,
 * KHÔNG dùng `toLocaleTimeString` với timeZone: máy admin có thể ở múi khác,
 * và giờ hiển thị ở đây phải là giờ của TÀI XẾ.
 */
export function vnTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const vn = new Date(t + 7 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(vn.getUTCHours())}:${p(vn.getUTCMinutes())}`;
}

/**
 * Nhãn độ trễ đón. Trả cả chuỗi lẫn mức độ để màn hình tô màu.
 *
 * Ngưỡng theo đúng thứ đã chốt cho bộ ghép: mỗi khách vẫn phải được đón trong
 * khung giờ họ chọn, còn vòng thêm thì tối đa 25 phút một khách. Nên >25' là
 * ĐỎ (vượt ngân sách đã thống nhất), 10–25' là VÀNG, dưới 10' coi như bình thường.
 */
export function delayLabel(min: number | null | undefined): {
  text: string;
  level: 'ok' | 'warn' | 'bad' | 'unknown';
} {
  if (min == null) return { text: '—', level: 'unknown' };
  if (min <= -1) return { text: `sớm ${Math.abs(min)}′`, level: 'ok' };
  if (min === 0) return { text: 'đúng giờ', level: 'ok' };
  if (min <= 10) return { text: `trễ ${min}′`, level: 'ok' };
  if (min <= 25) return { text: `trễ ${min}′`, level: 'warn' };
  return { text: `trễ ${min}′`, level: 'bad' };
}

/**
 * Che SĐT cho ảnh chụp màn hình: giữ 3 số đầu và 2 số cuối.
 *
 * ⚠️ Đây là chốt CHỐNG LỘ QUA ẢNH, không phải chốt bảo mật: số thật vẫn nằm
 * trong response và mở DevTools là đọc được. Cùng nhận định với `PhoneCell` ở
 * màn /users — chỗ che thật sự là backend. Ở đây mối lo là admin chụp màn hình
 * chuyển cho tài xế, và che ở FE giải quyết đúng cái đó.
 */
export function maskPhone(p: string | null | undefined): string {
  const t = (p ?? '').replace(/\s/g, '');
  if (!t) return '—';
  if (t.length <= 5) return '•'.repeat(t.length);
  return `${t.slice(0, 3)}${'•'.repeat(Math.max(3, t.length - 5))}${t.slice(-2)}`;
}

export interface CopyableStop {
  bookingId: string;
  kind: 'DON' | 'TRA';
  etaAt: string | null;
}

export interface CopyablePassenger {
  bookingId: string;
  isAnchor: boolean;
  customerName: string | null;
  routeName: string | null;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  seats: number;
  pickupAt: string;
  etaPickupAt: string | null;
  price: number | null;
}

export interface CopyableGroup {
  passengers: CopyablePassenger[];
  stops: CopyableStop[] | null;
  totalSeats: number;
  totalPrice: number;
  missingPriceCount: number;
  pooledDistanceKm: number | null;
  pooledDurationMin: number | null;
}

/**
 * Dựng khối chữ để admin copy chuyển cho tài xế.
 *
 * TUYỆT ĐỐI KHÔNG kèm số điện thoại — đó là lý do hàm này tồn tại thay vì copy
 * nguyên bảng. Có test canh riêng chuyện đó.
 */
export function buildGroupText(g: CopyableGroup): string {
  const L: string[] = [];
  L.push(`CHUYẾN GHÉP · ${g.passengers.length} chuyến · ${g.totalSeats} khách`);

  const tong = `${formatVnd(g.totalPrice)}${g.missingPriceCount > 0 ? ` (chưa gồm ${g.missingPriceCount} chuyến chưa có giá)` : ''}`;
  L.push(`Tổng tiền: ${tong}`);
  if (g.pooledDistanceKm != null) {
    const t = g.pooledDurationMin != null ? ` · ~${g.pooledDurationMin} phút` : '';
    L.push(`Quãng đường: ${g.pooledDistanceKm} km${t}`);
  }
  L.push('');

  g.passengers.forEach((p, i) => {
    L.push(`${i + 1}. ${p.customerName ?? '(chưa có tên)'}${p.isAnchor ? ' — chuyến chính' : ''}`);
    if (p.routeName) L.push(`   Tuyến: ${p.routeName}`);
    L.push(`   Đón: ${p.pickupAddress ?? '—'}`);
    L.push(`   Trả: ${p.dropoffAddress ?? '—'}`);
    const duTru = p.etaPickupAt ? ` · dự trù đón ${vnTime(p.etaPickupAt)}` : '';
    L.push(`   Giờ khách đặt: ${vnTime(p.pickupAt)}${duTru}`);
    L.push(`   ${p.seats} khách · ${formatVnd(p.price)}`);
    L.push('');
  });

  if (g.stops?.length) {
    const ten = new Map(g.passengers.map((p) => [p.bookingId, p.customerName?.trim() || shortId(p.bookingId)]));
    L.push('THỨ TỰ ĐÓN/TRẢ TỐI ƯU:');
    g.stops.forEach((st, i) => {
      const gio = st.etaAt ? ` (${vnTime(st.etaAt)})` : '';
      L.push(`   ${i + 1}. ${st.kind === 'DON' ? 'Đón' : 'Trả'} ${ten.get(st.bookingId) ?? shortId(st.bookingId)}${gio}`);
    });
  }

  return L.join('\n').trim();
}
