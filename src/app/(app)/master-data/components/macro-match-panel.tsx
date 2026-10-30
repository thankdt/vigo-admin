'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import type { MacroMatchCombo, MacroMatchResponse, MacroMatchVerdict } from '@/lib/api';
import {
  comboLabel,
  flatPriceText,
  macroRuleAdjustmentText,
  macroRuleRouteText,
  verdictLabel,
  type matchAvailability,
} from '@/lib/macro-search';
import type { PricingMacroRule, ProvinceOption } from '@/lib/types';
import { cn } from '@/lib/utils';

export type MacroMatchPanelProps = {
  availability: ReturnType<typeof matchAvailability>;
  /** Nhãn hai đầu như ô chọn đang hiện (vd `placeFilterLabel(filters.origin)`). */
  originLabel: string;
  destLabel: string;
  loading: boolean;
  /** Câu lỗi đã sẵn sàng để hiện (trang tự chọn câu, vd máy chủ chưa hỗ trợ). */
  error: string | null;
  match: MacroMatchResponse | null;
  /** Vị trí tổ hợp đang chọn trong `match.combos`. */
  selectedCombo: number;
  onSelectCombo: (i: number) => void;
  /** Tên tỉnh cho các đầu cấp tỉnh của luật; thiếu thì hiện mã tỉnh. */
  provinces?: ProvinceOption[];
};

const VERDICT_CLASS: Record<MacroMatchVerdict, string> = {
  WINNER: 'bg-emerald-600 text-white',
  LOSES_SPECIFICITY: 'bg-slate-100 text-slate-700',
  LOSES_PRIORITY: 'bg-slate-100 text-slate-700',
  LOSES_ID: 'bg-slate-100 text-slate-700',
  IGNORED_TYPE: 'bg-amber-50 text-amber-800',
};

/** Phần mô tả một luật ở MỘT tổ hợp: mức điều chỉnh (theo ghế / theo chuyến của tổ hợp) · đường đi · ưu tiên. */
function ruleSummary(
  rule: PricingMacroRule,
  provinceName: (code: string) => string,
  comboService: MacroMatchCombo['serviceType'],
): string {
  return `${macroRuleAdjustmentText(rule, comboService)} · ${macroRuleRouteText(rule, provinceName)} · ưu tiên ${rule.priority}`;
}

/** Nhãn kết luận «thắng» ở tổ hợp trúng đồng giá: máy giá bỏ MỌI luật, kể cả luật macro đứng đầu. */
const FLAT_IGNORED_LABEL = 'Bị đồng giá bỏ qua';

/**
 * Khung «Quy tắc đang áp dụng» cho chuyến đón → đến (chỉ hiển thị; trang lo việc gọi máy chủ). Năm tổ hợp dịch vụ × loại
 * xe (gồm «Ghép xe · không chọn loại xe»), mỗi tổ hợp: luật máy tính giá THẬT sẽ áp (theo `GET /pricing/macro-rules/match`),
 * «giữ giá gốc», hoặc ĐỒNG GIÁ (trúng bảng đồng giá điểm đặc biệt ⇒ mọi luật bị bỏ qua). Dưới tổ hợp đang chọn là bảng
 * xếp hạng: mọi luật khớp, đúng thứ tự máy giá, kèm lý do thua.
 *
 * Đang tải hoặc lỗi thì KHÔNG hiện kết quả đang giữ (có thể là của điểm cũ): một câu trả lời cũ trông như mới là nguy
 * hiểm hơn một khoảng trống.
 */
export function MacroMatchPanel({
  availability,
  originLabel,
  destLabel,
  loading,
  error,
  match,
  selectedCombo,
  onSelectCombo,
  provinces,
}: MacroMatchPanelProps) {
  const provinceName = React.useMemo(() => {
    const names = new Map((provinces ?? []).map((p) => [p.code, p.name]));
    return (code: string) => names.get(code) ?? code;
  }, [provinces]);
  const ruleById = React.useMemo(() => new Map((match?.rules ?? []).map((r) => [r.id, r])), [match]);
  const headingId = React.useId();

  if (availability === 'NEED_BOTH') {
    return (
      <div
        data-testid="macro-match-panel"
        className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500"
      >
        Chọn cả điểm đón và điểm đến để xem quy tắc đang áp dụng.
      </div>
    );
  }

  const answerable = availability === 'READY' || availability === 'PROVINCE_ONLY';
  const combos: MacroMatchCombo[] | null = answerable && !loading && !error && match ? match.combos ?? [] : null;
  const warnings = answerable && !loading && !error && match ? match.warnings ?? [] : [];
  const anyFlatPrice = (combos ?? []).some((c) => Boolean(c.flatPrice));

  return (
    <section
      aria-labelledby={headingId}
      data-testid="macro-match-panel"
      className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/40 p-3 text-xs text-slate-700"
    >
      <h3 id={headingId} className="text-sm font-semibold text-slate-800">
        Quy tắc đang áp dụng cho chuyến {originLabel} → {destLabel}
      </h3>

      {anyFlatPrice && (
        <p
          data-testid="macro-match-flat-banner"
          className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 font-medium text-amber-800"
        >
          Cặp điểm này có bảng ĐỒNG GIÁ điểm đặc biệt (sân bay…): giá thật lấy theo đồng giá, mọi quy tắc macro bị bỏ qua ở
          các tổ hợp bên dưới đánh dấu đồng giá. Xem tab «Sân bay & đồng giá».
        </p>
      )}

      {availability === 'TEXT_SIDE' && (
        <p className="text-slate-600">
          Đã chọn theo chữ nên chưa biết chính xác xã nào — chọn một xã/phường cụ thể ở gợi ý để xem quy tắc đang áp
          dụng.
        </p>
      )}
      {availability === 'PROVINCE_ONLY' && (
        <p className="text-amber-700">
          Bạn chọn cả tỉnh nên quy tắc cấp xã không được xét — chọn xã/phường để biết chính xác.
        </p>
      )}

      {answerable && loading && (
        <p role="status" className="flex items-center gap-1 text-slate-500">
          <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
          Đang tra quy tắc…
        </p>
      )}
      {answerable && error && (
        <p className="text-red-600" data-testid="macro-match-error">
          {error}
        </p>
      )}

      {warnings.map((w, i) =>
        w === 'RANKING_MISMATCH' ? (
          <p key={`${w}-${i}`} className="font-medium text-red-600">
            Kết quả xếp hạng không khớp máy tính giá — báo kỹ thuật.
          </p>
        ) : w === 'FLAT_PRICE_LOOKUP_FAILED' ? (
          <p key={`${w}-${i}`} data-testid="macro-match-flat-unknown" className="font-medium text-amber-700">
            Không kiểm được bảng đồng giá — nếu cặp này có đồng giá thì mọi quy tắc đều bị bỏ qua.
          </p>
        ) : (
          <p key={`${w}-${i}`} className="text-amber-700">
            Cảnh báo từ máy chủ: {w}
          </p>
        ),
      )}

      {combos && (
        <ul className="space-y-1" aria-label="Các tổ hợp dịch vụ × loại xe">
          {combos.map((c, i) => {
            const selected = i === selectedCombo;
            const winner = c.winnerRuleId !== null && c.winnerRuleId !== undefined ? ruleById.get(c.winnerRuleId) : undefined;
            const flat = c.flatPrice ?? null;
            return (
              <li key={`${c.serviceType}|${c.vehicleType}|${i}`}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectCombo(i)}
                  className={cn(
                    'flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md border px-2 py-1.5 text-left',
                    selected
                      ? 'border-emerald-400 bg-emerald-100/70 ring-1 ring-emerald-300'
                      : 'border-slate-200 bg-white hover:bg-slate-50',
                  )}
                >
                  <span className="w-44 shrink-0 font-medium text-slate-800">{comboLabel(c)}</span>
                  {flat ? (
                    // Trúng đồng giá: KHÔNG trình bày luật macro như đang áp (máy giá bỏ mọi luật).
                    <span
                      className="min-w-0 flex-1 font-semibold text-amber-800"
                      title="Giá trên hàng của bảng đồng giá (chưa làm tròn nghìn, chưa phụ phí/VAT)"
                    >
                      {flatPriceText(flat)} — mọi quy tắc bị bỏ qua
                    </span>
                  ) : c.winnerRuleId === null || c.winnerRuleId === undefined ? (
                    <span className="text-slate-500">Không có quy tắc nào áp (giữ giá gốc)</span>
                  ) : (
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold text-emerald-700">#{c.winnerRuleId}</span>
                      {winner && <span> · {ruleSummary(winner, provinceName, c.serviceType)}</span>}
                      {c.orientation === 'REVERSE' && <span className="text-slate-500"> · khớp chiều ngược</span>}
                    </span>
                  )}
                </button>
                {selected && (
                  <div className="ml-2 mt-1 space-y-1 border-l-2 border-emerald-200 pl-3">
                    {c.ranking.length === 0 ? (
                      <p className="text-slate-500">Không có quy tắc đang bật nào khớp chuyến này.</p>
                    ) : (
                      <ol className="space-y-0.5" aria-label={`Thứ tự xét quy tắc — ${comboLabel(c)}`}>
                        {c.ranking.map((r, k) => {
                          const rule = ruleById.get(r.ruleId);
                          const flatIgnored = Boolean(flat) && r.verdict === 'WINNER';
                          return (
                            <li key={`${r.ruleId}-${k}`} className="flex flex-wrap items-baseline gap-x-1.5 text-[11px]">
                              <span className="font-semibold text-slate-800">#{r.ruleId}</span>
                              <span
                                className={cn(
                                  'rounded px-1',
                                  flatIgnored
                                    ? 'bg-slate-200 text-slate-700'
                                    : VERDICT_CLASS[r.verdict] ?? 'bg-slate-100 text-slate-700',
                                )}
                              >
                                {flatIgnored ? FLAT_IGNORED_LABEL : verdictLabel(r.verdict)}
                              </span>
                              {rule && <span className="text-slate-600">{ruleSummary(rule, provinceName, c.serviceType)}</span>}
                              {r.orientation === 'REVERSE' && <span className="text-slate-500">· khớp chiều ngược</span>}
                            </li>
                          );
                        })}
                      </ol>
                    )}
                    {c.truncated && (
                      <p className="text-slate-500">Danh sách còn nữa, chỉ hiện {c.ranking.length} dòng đầu.</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {answerable && (
        <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-slate-500">
          <li>Chỉ tính quy tắc đang bật.</li>
          <li>Chuyến trúng bảng đồng giá thì mọi quy tắc đều bị bỏ.</li>
          <li>Thay đổi quy tắc có hiệu lực trong vòng 30 giây.</li>
        </ul>
      )}
    </section>
  );
}
