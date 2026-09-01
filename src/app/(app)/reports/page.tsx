'use client';

import * as React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getReportQuery, type ReportResult, type ReportSpec } from '@/lib/api';
import { FinanceFilter, PRESETS, type DateRange } from '../finance/components/finance-filter';
import { ReportPresetBar, REPORT_PRESETS } from './components/report-preset-bar';
import { ReportTable, type ReportResultRow } from './components/report-table';
import { ReportChart } from './components/report-chart';
import { ReportDrilldown } from './components/report-drilldown';

type DrillTarget = {
  dims: Record<string, string>;
  /** measure `created` của dòng vừa bấm — hiện cạnh tiêu đề drill-down để đối chiếu. */
  totalCount: number | null;
};

export default function ReportsPage() {
  const { toast } = useToast();
  const [range, setRange] = React.useState<DateRange>(PRESETS[0].range());
  const [presetKey, setPresetKey] = React.useState(REPORT_PRESETS[0].key);
  // BẤT BIẾN TRUNG TÂM: bảng luôn hiện `result` của ĐÚNG `spec` đã sinh ra nó — gắn
  // chung một state để KHÔNG BAO GIỜ đọc `spec` (biến sống, đổi ngay khi người dùng
  // chọn preset/khoảng ngày mới) cho một `result` còn đang là của kỳ TRƯỚC. Trước đây
  // ReportDrilldown nhận `spec` sống trong khi bảng vẫn hiện `result` cũ (do
  // `isLoading && !result` chỉ chặn màn hình lúc tải LẦN ĐẦU, không chặn lúc tải lại) —
  // bấm dòng ngay lúc đang đổi kỳ thì bộ lọc gửi lên mang khoảng ngày MỚI ghép với dims
  // của dòng thuộc kỳ CŨ, ra số sai hẳn.
  const [resultState, setResultState] = React.useState<{ spec: ReportSpec; result: ReportResult } | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [drillTarget, setDrillTarget] = React.useState<DrillTarget | null>(null);

  const spec: ReportSpec = React.useMemo(() => {
    const preset = REPORT_PRESETS.find((p) => p.key === presetKey) ?? REPORT_PRESETS[0];
    return { ...preset.spec, from: range.from, to: range.to };
  }, [presetKey, range]);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setDrillTarget(null);
    getReportQuery(spec)
      .then((r) => { if (!cancelled) setResultState({ spec, result: r }); })
      .catch((err: any) => {
        if (!cancelled) toast({ variant: 'destructive', title: 'Không tải được báo cáo', description: err.message });
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [spec, toast]);

  const result = resultState?.result ?? null;

  const measureLabels = React.useMemo(
    () => Object.fromEntries(
      (resultState?.result.columns ?? [])
        .filter((c) => c.type === 'measure')
        .map((c) => [c.key, c.label]),
    ),
    [resultState],
  );

  const handleRowClick = (row: ReportResultRow) => {
    setDrillTarget({ dims: row.dims, totalCount: row.measures.created ?? null });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Báo cáo</h1>
        <p className="text-sm text-muted-foreground">
          Số liệu chuyến đi theo tuyến, loại hình và nguyên nhân huỷ. Bấm một dòng để xem danh sách chuyến.
        </p>
      </div>

      <ReportPresetBar activeKey={presetKey} onSelect={setPresetKey} isLoading={isLoading} />
      <FinanceFilter value={range} onChange={setRange} isLoading={isLoading} />

      {result && result.meta.warnings.length > 0 ? (
        <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {result.meta.warnings.map((w, i) => (
            <p key={i} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{w}</span>
            </p>
          ))}
        </div>
      ) : null}

      {isLoading && !result ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : result && resultState ? (
        <>
          {result.meta.truncated ? (
            <p className="text-sm text-muted-foreground">
              Chỉ hiển thị {result.meta.rowCount} dòng đầu — hãy thu hẹp khoảng ngày để xem đủ.
            </p>
          ) : null}
          <ReportTable result={result} onRowClick={handleRowClick} />
          {drillTarget ? (
            // key = danh tính của ô đang xem: bấm sang ô khác phải là một phiên
            // drill-down MỚI (trang quay về 1), không kế thừa state của ô trước.
            // spec = resultState.spec (kỳ của KẾT QUẢ ĐANG HIỂN THỊ), không phải
            // `spec` sống — xem ghi chú bất biến trung tâm ở trên.
            <ReportDrilldown
              key={JSON.stringify(drillTarget.dims)}
              spec={resultState.spec}
              dims={drillTarget.dims}
              expectedTotal={drillTarget.totalCount}
              onClose={() => setDrillTarget(null)}
            />
          ) : null}
          <ReportChart spec={spec} measureLabels={measureLabels} />
        </>
      ) : null}
    </div>
  );
}
