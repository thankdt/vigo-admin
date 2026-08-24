'use client';

import * as React from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toastApiError } from '@/hooks/use-api-error-toast';
import { useToast } from '@/hooks/use-toast';
import {
  createCrmSegment,
  deleteCrmSegment,
  getCrmSegments,
  previewCrmSegment,
  recomputeCrmMetrics,
  type CrmSegmentCondition,
  type CrmSegmentDef,
} from '@/lib/api';
import { formatVnDateTime } from '../leakage-review/leakage-labels';
import {
  SEGMENT_FIELD_LABEL,
  SEGMENT_LABEL,
  SEGMENT_OP_LABEL,
} from './segment-labels';

/**
 * Phân khúc khách (CRM GĐ4, §6.5).
 *
 * 🚨 XEM TRƯỚC là bắt buộc trước khi lưu: người dựng phải nhìn thấy SỐ KHÁCH và vài cái TÊN
 * THẬT. Đây là cổng chặn "gửi nhầm tệp" của GĐ5 — sau khi lưu, phân khúc này thành đầu vào
 * của một chiến dịch gửi tin ra ngoài cho khách thật.
 */
export default function CrmSegmentsPage() {
  const { toast } = useToast();

  const [segments, setSegments] = React.useState<CrmSegmentDef[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const list = await getCrmSegments();
        if (!cancelled) setSegments(list);
      } catch (e) {
        if (cancelled) return;
        setFailed(true);
        toastApiError(e, 'Không tải được danh sách phân khúc');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const handleRecompute = async () => {
    setBusy(true);
    try {
      const res = await recomputeCrmMetrics();
      toast({ title: 'Đã tính lại', description: `${res.processed} khách.` });
      setReloadKey((k) => k + 1);
    } catch (e) {
      toastApiError(e, 'Không tính lại được');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Phân khúc khách</h1>
          <p className="text-sm text-muted-foreground">
            Rule chạy trên chỉ số tính sẵn (cron 03:00 giờ VN), không quét lại chuyến.
          </p>
        </div>
        {/* Ngày đầu bật tính năng bảng chỉ số còn rỗng -> mọi phân khúc đều rỗng và không
            ai hiểu vì sao. Nút này để không phải đợi tới 03:00 sáng hôm sau. */}
        <Button variant="outline" disabled={busy} onClick={handleRecompute}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Tính lại chỉ số ngay
        </Button>
      </div>

      <SegmentBuilder
        onSaved={() => {
          toast({ title: 'Đã lưu phân khúc' });
          setReloadKey((k) => k + 1);
        }}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Phân khúc hiện có</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {loading ? (
            <p className="text-muted-foreground">Đang tải…</p>
          ) : failed ? (
            <p className="text-destructive">Không tải được danh sách phân khúc.</p>
          ) : segments.length === 0 ? (
            <p className="text-muted-foreground">Chưa có phân khúc nào.</p>
          ) : (
            <ul className="space-y-2">
              {segments.map((s) => (
                <li
                  key={s.id}
                  data-testid="crm-segment-row"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      {s.isBuiltin ? <Badge variant="secondary">Dựng sẵn</Badge> : null}
                    </div>
                    {s.description ? (
                      <p className="text-xs text-muted-foreground">{s.description}</p>
                    ) : null}
                  </div>
                  {/* Dựng sẵn KHÔNG cho xoá: chiến dịch GĐ5 tham chiếu tới chúng. */}
                  {!s.isBuiltin ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Xoá phân khúc ${s.name}`}
                      onClick={async () => {
                        try {
                          await deleteCrmSegment(s.id);
                          setReloadKey((k) => k + 1);
                        } catch (e) {
                          toastApiError(e, 'Không xoá được phân khúc');
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Dựng rule + XEM TRƯỚC + lưu. Một điều kiện một dòng; AND/OR chọn ở trên. */
function SegmentBuilder({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = React.useState('');
  const [joiner, setJoiner] = React.useState<'all' | 'any'>('all');
  const [conds, setConds] = React.useState<CrmSegmentCondition[]>([
    { field: 'segment', op: 'eq', value: 'NGUY_CO_ROI_BO' },
  ]);
  const [preview, setPreview] = React.useState<Awaited<ReturnType<typeof previewCrmSegment>> | null>(
    null,
  );
  const [busy, setBusy] = React.useState(false);

  const rule = React.useMemo(
    () => (joiner === 'all' ? { all: conds } : { any: conds }),
    [joiner, conds],
  );

  // Đổi rule thì kết quả xem trước cũ KHÔNG còn đúng — xoá đi, đừng để người dùng lưu theo
  // một con số của rule khác.
  React.useEffect(() => {
    setPreview(null);
  }, [rule]);

  const patch = (i: number, p: Partial<CrmSegmentCondition>) =>
    setConds((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...p } : c)));

  const doPreview = async () => {
    setBusy(true);
    try {
      setPreview(await previewCrmSegment(rule));
    } catch (e) {
      toastApiError(e, 'Rule không hợp lệ');
    } finally {
      setBusy(false);
    }
  };

  const doSave = async () => {
    setBusy(true);
    try {
      await createCrmSegment({ name: name.trim(), ruleJson: rule });
      setName('');
      setPreview(null);
      onSaved();
    } catch (e) {
      toastApiError(e, 'Không lưu được phân khúc');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Dựng phân khúc mới</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="seg-name">Tên phân khúc</Label>
            <Input
              id="seg-name"
              className="w-[260px]"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Ghép điều kiện</Label>
            <Select value={joiner} onValueChange={(v) => setJoiner(v as 'all' | 'any')}>
              <SelectTrigger className="h-9 w-[160px]" aria-label="Cách ghép điều kiện">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Thoả TẤT CẢ (AND)</SelectItem>
                <SelectItem value="any">Thoả BẤT KỲ (OR)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          {conds.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2" data-testid="seg-cond">
              <Select value={c.field} onValueChange={(v) => patch(i, { field: v })}>
                <SelectTrigger className="h-9 w-[220px]" aria-label={`Trường ${i + 1}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SEGMENT_FIELD_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={c.op} onValueChange={(v) => patch(i, { op: v as any })}>
                <SelectTrigger className="h-9 w-[130px]" aria-label={`Toán tử ${i + 1}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SEGMENT_OP_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {c.field === 'segment' ? (
                <Select value={String(c.value)} onValueChange={(v) => patch(i, { value: v })}>
                  <SelectTrigger className="h-9 w-[220px]" aria-label={`Giá trị ${i + 1}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SEGMENT_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="w-[220px]"
                  aria-label={`Giá trị ${i + 1}`}
                  value={String(c.value)}
                  onChange={(e) => patch(i, { value: e.target.value })}
                />
              )}

              {conds.length > 1 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Bỏ điều kiện ${i + 1}`}
                  onClick={() => setConds((cs) => cs.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConds((cs) => [...cs, { field: 'fScore', op: 'gte', value: 2 }])}
          >
            Thêm điều kiện
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={busy} onClick={doPreview}>
            Xem trước
          </Button>
          {/*
            🚨 KHÔNG cho lưu khi chưa xem trước: phân khúc này sẽ thành đầu vào của chiến
            dịch gửi tin ra ngoài (GĐ5). Bắt nhìn số khách thật một lần là rẻ hơn nhiều so
            với gửi nhầm cả tệp.
          */}
          <Button disabled={busy || !name.trim() || !preview} onClick={doSave}>
            Lưu phân khúc
          </Button>
          {!preview ? (
            <span className="text-xs text-muted-foreground">
              Phải xem trước rồi mới lưu được.
            </span>
          ) : null}
        </div>

        {preview ? (
          <div className="space-y-2 rounded-md border p-3" data-testid="seg-preview">
            <p className="font-medium">
              Khớp <b>{preview.total.toLocaleString('vi-VN')}</b> khách
            </p>
            {preview.total === 0 ? (
              <p className="text-xs text-muted-foreground">
                Không khách nào khớp. Kiểm lại điều kiện, hoặc chạy “Tính lại chỉ số ngay”
                nếu bảng chỉ số chưa từng được tính.
              </p>
            ) : (
              <ul className="space-y-1 text-xs">
                {preview.sample.map((s) => (
                  <li key={s.userId} data-testid="seg-sample">
                    {s.fullName ?? 'Không rõ tên'} ·{' '}
                    {SEGMENT_LABEL[s.segment as keyof typeof SEGMENT_LABEL] ?? s.segment} ·{' '}
                    {formatVnDateTime(s.lastTripAt)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
