'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Trash2, Save, RefreshCw } from 'lucide-react';
import { getKmTables, saveKmTables } from '@/lib/api';
import {
  KM_TABLE_LABEL,
  KM_TABLE_TYPES,
  ghepBiTranKeoXuong,
  previewKmPrice,
  validateKmTable,
  type KmTable,
  type KmTableType,
  type KmTables,
  type KmTablesResponse,
} from '@/lib/km-tables';

const vnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`;
const numOrNaN = (s: string) => (s.trim() === '' ? NaN : Number(s));
const show = (n: number) => (Number.isFinite(n) ? n : '');

export function KmTablesManager() {
  const { toast } = useToast();
  const [loaded, setLoaded] = React.useState<KmTablesResponse | null>(null);
  const [draft, setDraft] = React.useState<KmTables | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [previewKm, setPreviewKm] = React.useState('80');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await getKmTables();
      setLoaded(r);
      setDraft(structuredClone(r.tables));
    } catch (e) {
      toast({ variant: 'destructive', title: 'Không tải được bảng giá km', description: e instanceof Error ? e.message : undefined });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const errors = React.useMemo(() => {
    const out = {} as Record<KmTableType, string[]>;
    for (const t of KM_TABLE_TYPES) out[t] = draft ? validateKmTable(draft[t]) : [];
    return out;
  }, [draft]);
  const hasErrors = KM_TABLE_TYPES.some((t) => errors[t].length > 0);
  const dirty = !!loaded && !!draft && JSON.stringify(loaded.tables) !== JSON.stringify(draft);
  const keoXuong = draft && !hasErrors ? ghepBiTranKeoXuong(draft) : [];

  const update = (type: KmTableType, fn: (t: KmTable) => KmTable) =>
    setDraft((d) => (d ? { ...d, [type]: fn(d[type]) } : d));

  const doSave = async () => {
    if (!loaded || !draft) return;
    setSaving(true);
    try {
      await saveKmTables(loaded.version, draft);
      toast({ title: 'Đã lưu bảng giá theo km', description: 'Giá mới áp dụng cho báo giá từ giờ.' });
      setConfirmOpen(false);
      await load();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Không lưu được', description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !draft) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!draft || !loaded) {
    return (
      <Button variant="outline" onClick={() => void load()}>
        <RefreshCw className="mr-2 h-4 w-4" /> Tải lại
      </Button>
    );
  }

  const km = Number(previewKm);
  const previewOk = Number.isFinite(km) && km > 0 && !hasErrors;

  return (
    <div className="space-y-4">
      {loaded.source === 'invalid' && (
        <Alert variant="destructive">
          <AlertTitle>Bảng đã lưu bị hỏng</AlertTitle>
          <AlertDescription>
            Hệ thống đang dùng bảng mặc định ({loaded.reason}). Lưu lại bảng bên dưới để thay thế.
          </AlertDescription>
        </Alert>
      )}
      {loaded.source === 'default' && (
        <Alert>
          <AlertTitle>Đang dùng bảng mặc định</AlertTitle>
          <AlertDescription>Chưa có chỉnh sửa nào được lưu. Giá hiện hành chính là các mốc bên dưới.</AlertDescription>
        </Alert>
      )}
      {keoXuong.length > 0 && (
        <Alert>
          <AlertTitle>Giá ghép bị giá bao xe 4–5 chỗ chặn trần</AlertTitle>
          <AlertDescription>
            Giá một ghế ghép không bao giờ cao hơn giá bao xe 4–5 chỗ cùng km. Tại {keoXuong.join(', ')} km, bảng bao xe
            đang thấp hơn bảng ghép nên giá ghép thực tế sẽ thấp hơn số đã nhập.
          </AlertDescription>
        </Alert>
      )}

      {KM_TABLE_TYPES.map((type) => {
        const t = draft[type];
        return (
          <Card key={type}>
            <CardHeader>
              <CardTitle>{KM_TABLE_LABEL[type]}</CardTitle>
              <CardDescription>
                Mỗi dòng: tại số km đó, giá là bao nhiêu. Giữa hai mốc giá tăng đều; dưới mốc đầu là giá sàn; sau mốc cuối
                tính thêm theo đơn giá/km. Giá tính xong được làm tròn nghìn.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Đến (km)</TableHead>
                    <TableHead>Giá tại mốc (đ)</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {t.points.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          inputMode="decimal"
                          aria-label={`${type} mốc ${i + 1} km`}
                          value={show(p.km)}
                          onChange={(e) =>
                            update(type, (tb) => ({
                              ...tb,
                              points: tb.points.map((m, j) => (j === i ? { ...m, km: numOrNaN(e.target.value) } : m)),
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          inputMode="numeric"
                          aria-label={`${type} mốc ${i + 1} giá`}
                          value={show(p.price)}
                          onChange={(e) =>
                            update(type, (tb) => ({
                              ...tb,
                              points: tb.points.map((m, j) => (j === i ? { ...m, price: numOrNaN(e.target.value) } : m)),
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Xoá mốc ${i + 1} của ${type}`}
                          disabled={t.points.length <= 2}
                          onClick={() => update(type, (tb) => ({ ...tb, points: tb.points.filter((_, j) => j !== i) }))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    update(type, (tb) => {
                      const last = tb.points[tb.points.length - 1];
                      return { ...tb, points: [...tb.points, { km: last.km + 10, price: last.price }] };
                    })
                  }
                >
                  <PlusCircle className="mr-2 h-4 w-4" /> Thêm mốc
                </Button>
                <div className="space-y-1">
                  <Label htmlFor={`tail-${type}`}>Sau mốc cuối: đơn giá mỗi km (đ/km)</Label>
                  <Input
                    id={`tail-${type}`}
                    type="number"
                    inputMode="numeric"
                    className="w-40"
                    value={show(t.tailPerKm)}
                    onChange={(e) => update(type, (tb) => ({ ...tb, tailPerKm: numOrNaN(e.target.value) }))}
                  />
                </div>
              </div>
              {errors[type].length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
                  {errors[type].map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle>Xem thử giá</CardTitle>
          <CardDescription>Tính theo bảng đang nhập (chưa lưu), đã gồm làm tròn nghìn và trần giá ghép.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-6">
          <div className="space-y-1">
            <Label htmlFor="km-preview">Quãng đường (km)</Label>
            <Input id="km-preview" type="number" className="w-32" value={previewKm} onChange={(e) => setPreviewKm(e.target.value)} />
          </div>
          {KM_TABLE_TYPES.map((type) => (
            <div key={type} className="text-sm">
              <div className="text-muted-foreground">{KM_TABLE_LABEL[type].split(' (')[0]}</div>
              <div className="text-lg font-semibold">{previewOk ? vnd(previewKmPrice(km, type, draft)) : '—'}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={!dirty || saving} onClick={() => setDraft(structuredClone(loaded.tables))}>
          Hoàn tác
        </Button>
        <Button disabled={!dirty || hasErrors || saving} onClick={() => setConfirmOpen(true)}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Lưu bảng giá
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lưu bảng giá theo km?</AlertDialogTitle>
            <AlertDialogDescription>
              Giá mới có hiệu lực ngay cho mọi báo giá ghép và bao xe. Chuyến đã đặt không đổi giá.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                void doSave();
              }}
            >
              Lưu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
