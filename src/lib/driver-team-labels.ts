import type { DriverTeamStage, TeamDriverRow, TeamProvinceRow } from './types';

export const STAGE_ORDER: DriverTeamStage[] = [
  'CONTACTED',
  'INVITED',
  'JOINED',
  'DECLINED',
  'DROPPED',
];

const STAGE_LABEL: Record<DriverTeamStage, string> = {
  CONTACTED: 'Đã liên hệ',
  INVITED: 'Đã mời',
  JOINED: 'Trong team',
  // Tách đôi có chủ đích: "Từ chối" là họ chối mình (còn gọi lại được),
  // "Loại" là mình đóng hẳn. Hai việc tiếp theo khác nhau.
  DECLINED: 'Từ chối',
  DROPPED: 'Loại',
};

/** null/undefined = chưa có row trong driver_team_member = Tiềm năng (spec §4.1). */
export function stageLabel(stage: DriverTeamStage | null | undefined): string {
  return stage ? STAGE_LABEL[stage] : 'Tiềm năng';
}

const STAGE_CLASS: Record<DriverTeamStage, string> = {
  CONTACTED: 'bg-sky-100 text-sky-800',
  INVITED: 'bg-amber-100 text-amber-800',
  JOINED: 'bg-emerald-100 text-emerald-800',
  DECLINED: 'bg-orange-100 text-orange-800',
  DROPPED: 'bg-muted text-muted-foreground',
};

export function stageBadgeClass(stage: DriverTeamStage | null | undefined): string {
  return stage ? STAGE_CLASS[stage] : 'bg-slate-100 text-slate-700';
}

/** 0..1 → '28,7%'. 0 và null đều ra '—' để không hiện "0,0%" gây tưởng đã đo được. */
export function formatShare(share: number | null | undefined): string {
  if (share == null || !Number.isFinite(share) || share <= 0) return '—';
  return `${(share * 100).toFixed(1).replace('.', ',')}%`;
}

/**
 * % hoa hồng riêng của tài (0..1, xem `TeamMemberRow.commissionRate`).
 * `null` và `0` PHẢI hiện khác nhau — lẫn hai cái là hiểu sai 200.000đ trên mỗi
 * chuyến 1 triệu:
 *  - null  = chưa set mức riêng → tài ăn chia theo MỨC CHUNG, hiện "Mức chung".
 *  - 0     = mức riêng ĐÃ set = 0 → VIGO không thu đồng nào, hiện "0%" kèm cờ
 *    `warn: true` để UI gắn dấu cảnh báo, tránh đọc nhầm thành "chưa set".
 */
export function commissionRateLabel(
  rate: number | null | undefined,
): { text: string; warn: boolean } {
  if (rate == null) return { text: 'Mức chung', warn: false };
  const pct = rate * 100;
  const text = `${Number.isInteger(pct) ? pct : pct.toFixed(1).replace('.', ',')}%`;
  return { text, warn: rate === 0 };
}

/** Cảnh báo mạnh nhất trước — ban > tạm khoá > chưa duyệt. */
export function driverWarning(row: TeamDriverRow): string | null {
  if (row.isBanned) return 'Đang bị khoá';
  if (row.suspendedUntil && new Date(row.suspendedUntil).getTime() > Date.now()) {
    return 'Đang tạm khoá';
  }
  if (!row.isApproved) return 'Chưa duyệt hồ sơ';
  return null;
}

/**
 * Tỉnh CÓ khách đặt nhưng KHÔNG tài nào chạy xong = cần tuyển gấp.
 * Cố ý KHÔNG dùng tỉ lệ completedTrips/totalBookings: hai số đó đếm theo hai mốc
 * thời gian khác nhau (spec §5.1) nên tỉ lệ giữa chúng vô nghĩa.
 * Hàng "Chưa xác định tỉnh" (provinceCode null) KHÔNG phải nơi để tuyển tài — nó là tín hiệu
 * soát dữ liệu chuyến thiếu mã tỉnh, nên không bao giờ gắn nhãn "thiếu tài".
 */
export function provinceNeedsDrivers(
  row: Pick<TeamProvinceRow, 'provinceCode' | 'totalBookings' | 'driverCount'>,
): boolean {
  return row.provinceCode !== null && row.totalBookings > 0 && row.driverCount === 0;
}

/** Khoá nhóm cấp 2 / accordion: mã tỉnh, hoặc 'none' cho hàng "Chưa xác định tỉnh". */
export const UNKNOWN_PROVINCE_KEY = 'none';

export function provinceKeyOf(row: Pick<TeamProvinceRow, 'provinceCode'>): string {
  return row.provinceCode ?? UNKNOWN_PROVINCE_KEY;
}

/**
 * Câu giải thích luật đếm theo tỉnh — dùng khi backend không trả `bucketNote`. Nội dung khớp
 * PROVINCE_BUCKET_NOTE của backend (driver-team-province.util.ts).
 */
export const PROVINCE_BUCKET_NOTE_FALLBACK =
  'Mỗi chuyến được đếm ở mọi tỉnh tài xế phải có để chạy chuyến đó: chuyến X↔Y nằm ở CẢ X và Y, ' +
  'chuyến Hà Nội↔X chỉ nằm ở X, chuyến trong Hà Nội nằm ở "Nội đô Hà Nội". ' +
  'Vì vậy cộng các dòng có thể LỚN HƠN tổng số chuyến — đừng cộng dồn các dòng để ra tổng.';

/** Nhãn một mã tỉnh khi không có tên (mã ngoài danh mục vẫn hiện, không biến mất). */
export function unknownProvinceCodeLabel(code: string): string {
  return `Mã tỉnh ${code}`;
}

/**
 * Tên các tỉnh được giao của một thành viên, theo thứ tự `assignedProvinceCodes`. Tên thiếu (backend
 * cũ không trả `assignedProvinceNames`, hoặc lệch độ dài) thì rơi về "Mã tỉnh XX" chứ không bỏ trống.
 */
export function assignedProvinceLabels(m: {
  assignedProvinceCodes?: string[];
  assignedProvinceNames?: string[];
}): string[] {
  const names = m.assignedProvinceNames ?? [];
  return (m.assignedProvinceCodes ?? []).map((c, i) => names[i] || unknownProvinceCodeLabel(c));
}

/** Một lựa chọn tỉnh: mã gis + tên hiển thị. */
export type ProvinceOption = { code: string; name: string };

/**
 * Lựa chọn tỉnh cho ô lọc "Tỉnh" và ô "Tỉnh được phân công", sắp theo TÊN tiếng Việt. KHÔNG dựa vào
 * thứ tự backend trả: mặc định nó sắp theo số tài → số chuyến nên đổi theo khoảng ngày, ô chọn nhảy
 * lung tung và khó tìm tỉnh. Hàng "Chưa xác định tỉnh" (provinceCode null) không phải một tỉnh nên
 * không vào đây — màn hình tự thêm riêng ở cuối ô lọc.
 */
export function buildProvinceOptions(
  rows: readonly Pick<TeamProvinceRow, 'provinceCode' | 'provinceName'>[],
): ProvinceOption[] {
  const out: ProvinceOption[] = [];
  for (const r of rows) {
    if (r.provinceCode !== null) out.push({ code: r.provinceCode, name: r.provinceName });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'vi') || a.code.localeCompare(b.code));
}

/**
 * Cấp 1 còn chứa mã có số liệu mà danh mục 34 tỉnh KHÔNG có; backend gắn cho chúng đúng nhãn dự phòng
 * "Mã tỉnh XX" (= `unknownProvinceCodeLabel`). Giao mã đó cho tài là 400 VAL_001 nên không được đưa
 * vào ô chọn tỉnh được giao. Tỉnh thật luôn mang tên thật.
 */
export function isCatalogProvince(p: ProvinceOption): boolean {
  return p.name !== unknownProvinceCodeLabel(p.code);
}

/**
 * Tập `assignedProvinceCodes` gửi PATCH. Backend (`validProvinceCodes`) trả 400 VAL_001 và TỪ CHỐI cả
 * request nếu có BẤT KỲ mã nào ngoài danh mục — nên mã "mồ côi" (đã giao từ trước, nay không còn
 * trong danh mục) KHÔNG được gửi lại, nếu không mọi lần lưu tỉnh của tài đó đều 400 và không gỡ nổi.
 *  - `selected`: tập vừa chọn ở ô chọn (hoặc tập còn hợp lệ khi chỉ gỡ mã mồ côi).
 *  - `assigned`: tập đang giao, có thể chứa mã mồ côi.
 *  - `catalog`: mã backend nhận. RỖNG = chưa tải được danh mục → không lọc gì, tin backend; nếu coi
 *    MỌI mã là mồ côi thì một lần lưu sẽ xoá sạch phân công.
 * Trả về `codes` (gửi đi, bỏ trùng, giữ thứ tự) và `dropped` (mã bị bỏ — nơi gọi phải báo người dùng).
 */
export function buildAssignedProvincePatch(
  selected: readonly string[],
  assigned: readonly string[],
  catalog: ReadonlySet<string>,
): { codes: string[]; dropped: string[] } {
  const known = (c: string) => catalog.size === 0 || catalog.has(c);
  return {
    codes: [...new Set(selected)].filter(known),
    dropped: [...new Set([...assigned, ...selected])].filter((c) => !known(c)),
  };
}

/** Tách tập đang giao thành mã thuộc danh mục / mã ngoài danh mục (cùng luật với PATCH ở trên). */
export function splitAssignedByCatalog(
  assigned: readonly string[],
  catalog: ReadonlySet<string>,
): { inCatalog: string[]; outside: string[] } {
  const { codes, dropped } = buildAssignedProvincePatch(assigned, assigned, catalog);
  return { inCatalog: codes, outside: dropped };
}

/** Ngày VN của một mốc, độc lập timezone trình duyệt. */
export function vnDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

function vnDateOf(ms: number): string {
  return new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Đến hạn = ngày hẹn (giờ VN) <= hôm nay (giờ VN). */
export function isFollowUpOverdue(
  iso: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!iso) return false;
  return vnDateOf(new Date(iso).getTime()) <= vnDateOf(nowMs);
}
