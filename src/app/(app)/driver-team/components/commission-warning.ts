/**
 * Cảnh báo hai chiều cho ô "% hoa hồng riêng" trong ngăn kéo chi tiết tài
 * (spec §8, task-17). Admin KHÔNG có API nào trả "mức chuẩn" / "% HTX" THẬT
 * của từng tài (hai giá trị đó biến thiên theo loại chuyến — vinow/thường —
 * và theo từng HTX, được backend chốt lúc chấp chuyến, không snapshot sẵn ở
 * đây) — nên cảnh báo dùng CON SỐ MINH HOẠ đúng theo ví dụ chốt trong spec
 * (P=1.000.000, R=0,2, h=0,05 — xem
 * `docs/superpowers/specs/2026-08-14-driver-team-commission-design.md` §10
 * "Kiểm số của T2") để nêu số cụ thể, KHÔNG bịa ra số của riêng tài đang xem.
 *
 * - `standardRate` mặc định 0,2 = seed `BOOKING_COMMISSION_RATE` (system_config).
 * - `htxCommissionRate` mặc định 0,05 = `DEFAULT_HTX_RATE` phổ biến nhất ở BE.
 */

export const WARNING_EXAMPLE_GROSS = 1_000_000;
export const WARNING_STANDARD_RATE = 0.2;
export const WARNING_EXAMPLE_HTX_RATE = 0.05;

export type CommissionWarning = {
  /** 'below' = mức riêng thấp hơn chuẩn (VIGO chịu thiệt); 'above' = cao hơn chuẩn (tài chịu thiệt). */
  direction: 'below' | 'above';
  message: string;
};

function fmtVnd(n: number): string {
  return `${Math.round(n).toLocaleString('vi-VN')}đ`;
}

function fmtPct(rate: number): string {
  const pct = rate * 100;
  const rounded = Math.round(pct * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1).replace('.', ',')}%`;
}

/**
 * `rate` = mức riêng ĐANG XEM (0..1). `null`/`undefined` (chưa set, dùng mức
 * chung) không có gì để cảnh báo — trả `null`. `rate === standardRate` cũng
 * không cảnh báo (đúng bằng mức chung thì không ai chịu thiệt).
 */
export function commissionRateWarning(
  rate: number | null | undefined,
  opts: { standardRate?: number; htxCommissionRate?: number; exampleGross?: number } = {},
): CommissionWarning | null {
  if (rate == null) return null;
  const standardRate = opts.standardRate ?? WARNING_STANDARD_RATE;
  const htxCommissionRate = opts.htxCommissionRate ?? WARNING_EXAMPLE_HTX_RATE;
  const gross = opts.exampleGross ?? WARNING_EXAMPLE_GROSS;

  if (rate === standardRate) return null;

  if (rate < standardRate) {
    const forgone = (standardRate - rate) * gross;
    // Lỗ TIỀN MẶT thật chỉ phát sinh khi mức riêng thấp hơn CẢ phần HTX ăn —
    // lúc đó VIGO thu vào ít hơn số phải trả HTX (§8 công thức cashLoss).
    const cashLoss = Math.max(0, (htxCommissionRate - rate) * gross);
    let message =
      `Mức riêng ${fmtPct(rate)} thấp hơn mức chuẩn ${fmtPct(standardRate)} — minh hoạ trên ` +
      `chuyến ${fmtVnd(gross)}: VIGO bỏ qua khoảng ${fmtVnd(forgone)} doanh thu.`;
    if (cashLoss > 0) {
      message +=
        ` Tài thuộc HTX ${fmtPct(htxCommissionRate)}: VIGO thu ${fmtVnd(rate * gross)} nhưng vẫn ` +
        `phải trả HTX ${fmtVnd(htxCommissionRate * gross)} → lỗ tiền mặt thật khoảng ` +
        `${fmtVnd(cashLoss)} mỗi chuyến ${fmtVnd(gross)}.`;
    }
    return { direction: 'below', message };
  }

  const overcharge = (rate - standardRate) * gross;
  const message =
    `Mức riêng ${fmtPct(rate)} CAO HƠN mức chuẩn ${fmtPct(standardRate)} — người chịu thiệt là ` +
    `TÀI XẾ: minh hoạ trên chuyến ${fmtVnd(gross)}, tài bị thu thêm khoảng ${fmtVnd(overcharge)} ` +
    `so với mức chuẩn.`;
  return { direction: 'above', message };
}
