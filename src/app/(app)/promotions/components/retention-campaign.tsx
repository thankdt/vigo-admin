'use client';
import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  getVoucherCampaign,
  updateVoucherCampaign,
  getVoucherCampaignStats,
} from '@/lib/api';
import type { VoucherCampaign, VoucherCampaignStats } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { toastApiError } from '@/hooks/use-api-error-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Info } from 'lucide-react';

const SERVICE_TYPES = [
  { value: 'RIDE', label: 'Đặt xe' },
  { value: 'DELIVERY', label: 'Giao hàng' },
  { value: 'CARPOOL', label: 'Đi ghép' },
] as const;

// Ô số để trống nghĩa là "tắt trần", KHÔNG phải 0. `z.coerce.number()('')` cho ra 0,
// mà 0 lại trượt `.positive()` và `.optional()` không cứu được vì 0 ≠ undefined —
// cùng cái bẫy đã ghi ở promotions-table.tsx.
const emptyToNull = (v: unknown) =>
  v === '' || v === null || v === undefined ? null : v;

const campaignSchema = z
  .object({
    isActive: z.boolean(),
    discountType: z.enum(['FIXED', 'PERCENTAGE']),
    discountValue: z.coerce.number().positive({ message: 'Giá trị giảm phải lớn hơn 0' }),
    maxDiscount: z.preprocess(
      emptyToNull,
      z.coerce.number().positive({ message: 'Giảm tối đa phải lớn hơn 0' }).nullable(),
    ),
    minOrderValue: z.coerce.number().min(0, { message: 'Đơn tối thiểu không thể âm' }),
    validDays: z.coerce.number().int().positive({ message: 'Hạn dùng phải từ 1 ngày trở lên' }),
    serviceTypes: z.array(z.string()),
    maxGrantsPerUser: z.preprocess(
      emptyToNull,
      z.coerce.number().int().positive({ message: 'Phải là số nguyên dương' }).nullable(),
    ),
    maxGrantsPerUserWindowDays: z.preprocess(
      emptyToNull,
      z.coerce.number().int().positive({ message: 'Phải là số nguyên dương' }).nullable(),
    ),
    maxTotalGrants: z.preprocess(
      emptyToNull,
      z.coerce.number().int().positive({ message: 'Phải là số nguyên dương' }).nullable(),
    ),
    minNotifyGapMinutes: z.coerce.number().int().min(0, { message: 'Không thể âm' }),
    popupGrantedTitle: z.string().min(1, { message: 'Không được để trống' }).max(120),
    popupGrantedBody: z.string().min(1, { message: 'Không được để trống' }).max(400),
    popupReminderTitle: z.string().min(1, { message: 'Không được để trống' }).max(120),
    popupReminderBody: z.string().min(1, { message: 'Không được để trống' }).max(400),
    pushTitle: z.string().min(1, { message: 'Không được để trống' }).max(120),
    pushBody: z.string().min(1, { message: 'Không được để trống' }).max(400),
  })
  // Giảm theo % mà không có trần là ký một tờ séc trắng: mức giảm trôi theo giá
  // chuyến. Backend cũng chặn (VoucherCampaignService), đây là lớp báo sớm cho admin
  // ngay tại ô nhập thay vì để họ bấm Lưu rồi mới thấy toast đỏ.
  .refine(
    (v) => v.discountType !== 'PERCENTAGE' || (v.maxDiscount != null && v.maxDiscount > 0),
    { message: 'Giảm theo % bắt buộc phải có mức giảm tối đa', path: ['maxDiscount'] },
  )
  .refine((v) => v.discountType !== 'PERCENTAGE' || v.discountValue <= 100, {
    message: 'Giảm theo % không được vượt quá 100',
    path: ['discountValue'],
  });

export type CampaignFormValues = z.infer<typeof campaignSchema>;

/** Export riêng để test validate form mà không phải dựng React. */
export const voucherCampaignSchema = campaignSchema;

const vnd = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);

function toFormValues(c: VoucherCampaign): CampaignFormValues {
  return {
    isActive: c.isActive,
    discountType: c.discountType,
    // `numeric` của Postgres về dạng CHUỖI — không ép kiểu thì ô input hiện "20000.00"
    // và mọi so sánh số phía dưới đều so chuỗi.
    discountValue: Number(c.discountValue) || 0,
    maxDiscount: c.maxDiscount == null ? null : Number(c.maxDiscount),
    minOrderValue: Number(c.minOrderValue) || 0,
    validDays: c.validDays,
    serviceTypes: c.serviceTypes ?? [],
    maxGrantsPerUser: c.maxGrantsPerUser,
    maxGrantsPerUserWindowDays: c.maxGrantsPerUserWindowDays,
    maxTotalGrants: c.maxTotalGrants,
    minNotifyGapMinutes: c.minNotifyGapMinutes,
    popupGrantedTitle: c.popupGrantedTitle,
    popupGrantedBody: c.popupGrantedBody,
    popupReminderTitle: c.popupReminderTitle,
    popupReminderBody: c.popupReminderBody,
    pushTitle: c.pushTitle,
    pushBody: c.pushBody,
  };
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function RetentionCampaign() {
  const { toast } = useToast();
  const [campaign, setCampaign] = React.useState<VoucherCampaign | null>(null);
  const [stats, setStats] = React.useState<VoucherCampaignStats | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const {
    register, handleSubmit, control, watch, reset,
    formState: { errors, isSubmitting },
  } = useForm<CampaignFormValues>({ resolver: zodResolver(campaignSchema) });

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [c, s] = await Promise.all([
        getVoucherCampaign(),
        // Thống kê hỏng KHÔNG được chặn phần cấu hình: admin vẫn phải tắt được
        // chiến dịch khi ngân sách cháy, kể cả lúc truy vấn thống kê đang lỗi.
        getVoucherCampaignStats().catch(() => null),
      ]);
      setCampaign(c);
      setStats(s);
      reset(toFormValues(c));
    } catch (err) {
      toastApiError(err, 'Không thể tải cấu hình chiến dịch');
    } finally {
      setIsLoading(false);
    }
  }, [reset]);

  React.useEffect(() => { load(); }, [load]);

  const discountType = watch('discountType');
  const isActive = watch('isActive');

  const onSubmit = async (data: CampaignFormValues) => {
    try {
      const saved = await updateVoucherCampaign(data);
      setCampaign(saved);
      reset(toFormValues(saved));
      toast({
        title: 'Đã lưu',
        description: data.isActive
          ? 'Chiến dịch đang BẬT — chuyến có tài xế nhận sẽ tặng mã ngay.'
          : 'Chiến dịch đang TẮT — sẽ không tặng mã cho ai.',
      });
      getVoucherCampaignStats().then(setStats).catch(() => undefined);
    } catch (err) {
      toastApiError(err, 'Không thể lưu cấu hình');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Không tải được cấu hình chiến dịch.
          <Button variant="outline" className="ml-3" onClick={load}>Thử lại</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Công tắc tổng — để trên cùng vì đây là thứ admin cần tìm nhanh nhất khi
          ngân sách khuyến mãi phình ngoài dự kiến. */}
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <Label htmlFor="isActive" className="text-base font-medium">
              Trạng thái chiến dịch
            </Label>
            <p className="text-sm text-muted-foreground">
              Bật thì MỖI chuyến có tài xế nhận sẽ tặng khách một mã cho chuyến kế tiếp.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={isActive ? 'default' : 'outline'}>
              {isActive ? 'Đang bật' : 'Đang tắt'}
            </Badge>
            <Controller
              name="isActive"
              control={control}
              render={({ field }) => (
                <Switch id="isActive" checked={!!field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Khối 1 — Giá trị ưu đãi ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>1. Giá trị ưu đãi</CardTitle>
          <CardDescription>Mã tặng ra sẽ mang đúng các thông số này.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Kiểu giảm</Label>
            <Controller
              name="discountType"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED">Số tiền cố định</SelectItem>
                    <SelectItem value="PERCENTAGE">Phần trăm</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="discountValue">
              Giá trị giảm {discountType === 'PERCENTAGE' ? '(%)' : '(VND)'}
            </Label>
            <Input id="discountValue" type="number" {...register('discountValue')} />
            {errors.discountValue && (
              <p className="text-sm text-destructive">{errors.discountValue.message}</p>
            )}
          </div>

          {discountType === 'PERCENTAGE' && (
            <div className="space-y-2">
              <Label htmlFor="maxDiscount">Giảm tối đa (VND)</Label>
              <Input id="maxDiscount" type="number" {...register('maxDiscount')} />
              {errors.maxDiscount && (
                <p className="text-sm text-destructive">{errors.maxDiscount.message as string}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="minOrderValue">Đơn tối thiểu (VND)</Label>
            <Input id="minOrderValue" type="number" {...register('minOrderValue')} />
            {errors.minOrderValue && (
              <p className="text-sm text-destructive">{errors.minOrderValue.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="validDays">Hạn dùng (ngày)</Label>
            <Input id="validDays" type="number" {...register('validDays')} />
            <p className="text-xs text-muted-foreground">
              Mã hết hạn lúc 23:59 giờ Việt Nam của ngày thứ N kể từ ngày được tặng —
              nên khách được tặng lúc 23h50 vẫn dùng trọn N ngày.
            </p>
            {errors.validDays && (
              <p className="text-sm text-destructive">{errors.validDays.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Khối 2 — Điều kiện tặng ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>2. Điều kiện tặng</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex gap-3 rounded-md border bg-muted/40 p-3 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="space-y-1 text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">
                  Khách còn mã chưa tiêu thì không tặng thêm
                </span>{' '}
                — quy tắc cố định, không tắt được. Khách vẫn được báo lại về mã đang cầm.
              </p>
              <p>
                Tính cả trường hợp <span className="font-medium text-foreground">admin gán tài xế</span>{' '}
                và <span className="font-medium text-foreground">khách chọn tài theo SĐT</span>.
                Đổi tài xế lần hai cho cùng một chuyến sẽ KHÔNG báo lại.
              </p>
              <p>Chuyến bị huỷ sau khi tặng: mã không bị thu hồi.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Loại dịch vụ được tặng</Label>
            <Controller
              name="serviceTypes"
              control={control}
              render={({ field }) => {
                const value: string[] = field.value ?? [];
                return (
                  <div className="flex flex-wrap gap-4">
                    {SERVICE_TYPES.map((s) => (
                      <label key={s.value} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={value.includes(s.value)}
                          onCheckedChange={(checked) =>
                            field.onChange(
                              checked
                                ? [...value, s.value]
                                : value.filter((v) => v !== s.value),
                            )
                          }
                        />
                        {s.label}
                      </label>
                    ))}
                  </div>
                );
              }}
            />
            <p className="text-xs text-muted-foreground">
              Không tích ô nào = tặng cho mọi loại dịch vụ.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="maxGrantsPerUser">Trần mã / khách</Label>
              <Input
                id="maxGrantsPerUser"
                type="number"
                placeholder="Bỏ trống = không giới hạn"
                {...register('maxGrantsPerUser')}
              />
              {errors.maxGrantsPerUser && (
                <p className="text-sm text-destructive">
                  {errors.maxGrantsPerUser.message as string}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxGrantsPerUserWindowDays">Trong vòng (ngày)</Label>
              <Input
                id="maxGrantsPerUserWindowDays"
                type="number"
                placeholder="Bỏ trống = tính toàn thời gian"
                {...register('maxGrantsPerUserWindowDays')}
              />
              {errors.maxGrantsPerUserWindowDays && (
                <p className="text-sm text-destructive">
                  {errors.maxGrantsPerUserWindowDays.message as string}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxTotalGrants">Trần tổng chiến dịch</Label>
              <Input
                id="maxTotalGrants"
                type="number"
                placeholder="Bỏ trống = không giới hạn"
                {...register('maxTotalGrants')}
              />
              {errors.maxTotalGrants && (
                <p className="text-sm text-destructive">
                  {errors.maxTotalGrants.message as string}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2 sm:max-w-xs">
            <Label htmlFor="minNotifyGapMinutes">Cách nhau tối thiểu giữa 2 lần báo (phút)</Label>
            <Input id="minNotifyGapMinutes" type="number" {...register('minNotifyGapMinutes')} />
            <p className="text-xs text-muted-foreground">
              Chống dội thông báo khi khách đặt–huỷ nhiều vòng. Khách bị dội sẽ tắt push,
              mà tắt push là mất luôn cả thông báo &ldquo;Đã tìm được tài xế!&rdquo;.
              Đặt 0 để báo mọi lần.
            </p>
            {errors.minNotifyGapMinutes && (
              <p className="text-sm text-destructive">{errors.minNotifyGapMinutes.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Khối 3 — Nội dung hiển thị ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>3. Nội dung hiển thị</CardTitle>
          <CardDescription>
            Dùng biến <code className="rounded bg-muted px-1">{'{{gia_tri}}'}</code> và{' '}
            <code className="rounded bg-muted px-1">{'{{han_dung}}'}</code>. Hệ thống thay
            biến bằng số liệu của CHÍNH mã được tặng, nên đổi cấu hình giữa chừng cũng
            không làm lệch con số trên mã khách đang cầm.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="popupGrantedTitle">Popup lúc vừa tặng — tiêu đề</Label>
            <Input id="popupGrantedTitle" {...register('popupGrantedTitle')} />
            {errors.popupGrantedTitle && (
              <p className="text-sm text-destructive">{errors.popupGrantedTitle.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="popupGrantedBody">Popup lúc vừa tặng — nội dung</Label>
            <Textarea id="popupGrantedBody" rows={2} {...register('popupGrantedBody')} />
            {errors.popupGrantedBody && (
              <p className="text-sm text-destructive">{errors.popupGrantedBody.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="popupReminderTitle">Popup nhắc lại — tiêu đề</Label>
            <Input id="popupReminderTitle" {...register('popupReminderTitle')} />
            {errors.popupReminderTitle && (
              <p className="text-sm text-destructive">{errors.popupReminderTitle.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="popupReminderBody">Popup nhắc lại — nội dung</Label>
            <Textarea id="popupReminderBody" rows={2} {...register('popupReminderBody')} />
            {errors.popupReminderBody && (
              <p className="text-sm text-destructive">{errors.popupReminderBody.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pushTitle">Push — tiêu đề</Label>
            <Input id="pushTitle" {...register('pushTitle')} />
            {errors.pushTitle && (
              <p className="text-sm text-destructive">{errors.pushTitle.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="pushBody">Push — nội dung</Label>
            <Textarea id="pushBody" rows={2} {...register('pushBody')} />
            {errors.pushBody && (
              <p className="text-sm text-destructive">{errors.pushBody.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Khối 4 — Theo dõi hiệu quả ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>4. Theo dõi hiệu quả</CardTitle>
          <CardDescription>
            &ldquo;Đã dùng&rdquo; đếm mã đã tiêu trên chuyến CHƯA HUỶ. &ldquo;Tiền đã
            giảm&rdquo; là số tiền giảm thực tế trên chính các chuyến đó, không phải giá
            trị danh nghĩa của mã.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatTile label="Đã tặng" value={stats.granted.toLocaleString('vi-VN')} hint="số mã đã sinh" />
              <StatTile
                label="Đã dùng"
                value={`${stats.used.toLocaleString('vi-VN')} (${stats.usedRate}%)`}
              />
              <StatTile label="Tiền đã giảm" value={vnd(stats.totalDiscount)} />
              <StatTile label="Đang còn hạn" value={stats.active.toLocaleString('vi-VN')} hint="chưa tiêu, chưa hết hạn" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Chưa tải được số liệu.{' '}
              <Button
                type="button"
                variant="link"
                className="h-auto p-0"
                onClick={() => getVoucherCampaignStats().then(setStats).catch(() => undefined)}
              >
                Thử lại
              </Button>
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={load} disabled={isSubmitting}>
          Hoàn tác
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Lưu cấu hình
        </Button>
      </div>
    </form>
  );
}
