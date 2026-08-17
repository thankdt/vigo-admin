'use client';
import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import {
  getVouchers,
  createVoucher,
  updateVoucher,
  assignPromotionToUsers,
  getPromotionAssignees,
  revokePromotionFromUser,
} from '@/lib/api';
import type { Promotion, PromotionVisibility } from '@/lib/types';
import { AssigneePicker, type PickedCustomer } from './assignee-picker';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { dateInputValue, parseDateInput } from '@/lib/date-input-utils';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toastApiError } from '@/hooks/use-api-error-toast';

// Optional numeric fields used to break the save button: an empty <Input
// type="number"> sends "" to RHF; z.coerce.number()('') === 0, then
// .positive() rejects 0 and .optional() can't rescue it because 0 isn't
// undefined. Empty/null/undefined → undefined before coerce runs.
const emptyToUndefined = (val: unknown) =>
  val === '' || val === null || val === undefined ? undefined : val;

const promotionSchema = z.object({
  code: z.string().min(1, { message: "Mã là bắt buộc" }),
  discountType: z.enum(['FIXED_AMOUNT', 'PERCENTAGE']),
  discountValue: z.coerce.number().positive({ message: "Giá trị giảm giá phải là số dương" }),
  minOrderValue: z.coerce.number().min(0, { message: "Giá trị đơn hàng tối thiểu không thể âm" }),
  usageLimit: z.coerce.number().positive({ message: "Giới hạn sử dụng phải là số dương" }),
  // Empty input → undefined → BE keeps it NULL = unlimited per user.
  userUsageLimit: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive({ message: "Phải là số nguyên dương" }).optional(),
  ),
  // Empty input → undefined → BE treats as unlimited (0).
  dailyUsageLimit: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(0, { message: "Không thể âm" }).optional(),
  ),
  startDate: z.date({ required_error: "Ngày bắt đầu là bắt buộc" }),
  endDate: z.date({ required_error: "Ngày kết thúc là bắt buộc" }),
  pointCost: z.coerce.number().min(0, { message: "Chi phí điểm không thể âm" }).default(0),
  imageUrl: z.string().url({ message: "Vui lòng nhập URL hợp lệ" }).optional().or(z.literal('')),
  description: z.string().optional(),
  // Same empty-string trap as the limits above — only required when
  // discountType === PERCENTAGE, but always optional at the schema level.
  maxDiscount: z.preprocess(
    emptyToUndefined,
    z.coerce.number().positive({ message: "Giảm tối đa phải là số dương" }).optional(),
  ),
  isActive: z.boolean().default(true),
  // Ai THẤY voucher trong danh sách app khách. Mặc định PUBLIC = đúng hành vi có
  // trước khi có cột này, nên voucher cũ và thói quen tạo voucher cũ không đổi gì.
  visibility: z.enum(['PUBLIC', 'TARGETED', 'CODE_ONLY']).default('PUBLIC'),
});

type PromotionFormValues = z.infer<typeof promotionSchema>;

const VISIBILITY_HINT: Record<PromotionVisibility, string> = {
  PUBLIC: 'Mọi khách đều thấy voucher này trong danh sách.',
  TARGETED: 'Chỉ những khách được gán bên dưới mới thấy và dùng được.',
  CODE_ONLY: 'Không hiện trong danh sách. Khách phải tự gõ đúng mã ở ô "Nhập mã" mới sở hữu.',
};

// Backend stores discountType as 'FIXED' | 'PERCENTAGE'; the form uses
// 'FIXED_AMOUNT' to match the Promotion type union. Normalize the loaded value
// so RHF defaultValues align with the schema's enum.
function normalizeDiscountType(t: string | undefined): 'FIXED_AMOUNT' | 'PERCENTAGE' {
  return t === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED_AMOUNT';
}

function PromotionForm({
  mode,
  initial,
  onSaveSuccess,
  onCancel,
}: {
  mode: 'create' | 'edit';
  initial?: Promotion;
  onSaveSuccess: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const defaultValues = React.useMemo<Partial<PromotionFormValues>>(() => {
    if (mode === 'edit' && initial) {
      return {
        code: initial.code,
        description: initial.description,
        discountType: normalizeDiscountType(initial.discountType),
        discountValue: initial.discountValue,
        maxDiscount: initial.maxDiscount,
        minOrderValue: initial.minOrderValue,
        usageLimit: initial.usageLimit,
        userUsageLimit: initial.userUsageLimit ?? undefined,
        dailyUsageLimit: initial.dailyUsageLimit ?? undefined,
        startDate: new Date(initial.startDate),
        endDate: new Date(initial.endDate),
        pointCost: initial.pointCost ?? 0,
        imageUrl: initial.imageUrl ?? '',
        isActive: initial.isActive,
        // Voucher tạo trước đợt này không có cột — coi như PUBLIC, đúng hành vi cũ.
        visibility: initial.visibility ?? 'PUBLIC',
      };
    }
    return { discountType: 'FIXED_AMOUNT', pointCost: 0, isActive: true, visibility: 'PUBLIC' as const };
  }, [mode, initial]);

  const { register, handleSubmit, control, watch, formState: { errors, isSubmitting }, reset } = useForm<PromotionFormValues>({
    resolver: zodResolver(promotionSchema),
    defaultValues,
  });

  const discountType = watch('discountType');
  const visibility = watch('visibility');

  // Khách được gán khi visibility = TARGETED. Ở chế độ SỬA, danh sách này là những
  // người sẽ được THÊM — người đã gán từ trước nạp riêng ở `existingAssignees` bên
  // dưới để admin nhìn thấy và gỡ được.
  const [picked, setPicked] = React.useState<PickedCustomer[]>([]);
  const [existingAssignees, setExistingAssignees] = React.useState<
    { userId: string; fullName: string | null; phone: string | null }[]
  >([]);

  React.useEffect(() => {
    if (mode !== 'edit' || !initial) return;
    if ((initial.visibility ?? 'PUBLIC') === 'PUBLIC') return;
    let alive = true;
    getPromotionAssignees(initial.id)
      .then((rows) => { if (alive) setExistingAssignees(rows); })
      .catch(() => undefined); // danh sách gán hỏng không được chặn việc sửa voucher
    return () => { alive = false; };
  }, [mode, initial]);

  // Voucher TARGETED KHÔNG được lưu khi chưa gán ai.
  //
  // `findAllActive` loại TARGETED khỏi nhánh công khai, và nhánh còn lại đi qua
  // `user_promotion` — nên một voucher TARGETED không gán ai là voucher KHÔNG AI
  // NHÌN THẤY, kể cả người được "nhắm tới". Trước đó form vẫn cho lưu và báo "Đã tạo
  // voucher thành công", tạo ra rác im lặng.
  //
  // Kiểm ở đây chứ không trong zod schema: `picked` là React state, không nằm trong
  // form values nên `.refine` không thấy được nó.
  const targetedWithoutAssignee =
    visibility === 'TARGETED' &&
    picked.length === 0 &&
    // Ở chế độ SỬA, người đã gán từ trước cũng tính — admin chỉ đang đổi câu chữ.
    (mode === 'create' || existingAssignees.length === 0);

  const onSubmit = async (data: PromotionFormValues) => {
    if (data.visibility === 'TARGETED' && targetedWithoutAssignee) {
      toast({
        variant: 'destructive',
        title: 'Chưa chọn khách nào',
        description:
          'Voucher chỉ định phải gán cho ít nhất một khách, nếu không sẽ không ai nhìn thấy nó.',
      });
      return;
    }
    try {
      const payload = {
        ...data,
        startDate: format(data.startDate, 'yyyy-MM-dd') + 'T00:00:00Z',
        endDate: format(data.endDate, 'yyyy-MM-dd') + 'T23:59:59Z',
      };
      if (mode === 'edit' && initial) {
        // Don't allow code changes — already issued to customers.
        const { code: _code, ...patch } = payload;
        await updateVoucher(initial.id, patch);
        if (picked.length) {
          await assignPromotionToUsers(initial.id, picked.map((p) => p.id));
        }
        toast({ title: 'Đã cập nhật', description: `Voucher "${initial.code}" được cập nhật.` });
      } else {
        // Gửi kèm `assignUserIds` để backend tạo voucher + gán khách trong CÙNG một
        // lần gọi. Nếu tách thành hai request, request thứ hai hỏng sẽ để lại một
        // voucher TARGETED không ai thấy — đúng loại rác im lặng khó lần ra nhất.
        await createVoucher({
          ...payload,
          ...(data.visibility === 'TARGETED' && picked.length
            ? { assignUserIds: picked.map((p) => p.id) }
            : {}),
        });
        toast({ title: "Thành công", description: "Đã tạo voucher thành công." });
      }
      onSaveSuccess();
      if (mode === 'create') { reset(); setPicked([]); }
    } catch (err: any) {
      // Khối JSON.parse cũ ở đây là CODE CHẾT: nó đọc `errorObj.details` và
      // `errorObj.message` ở tầng gốc, trong khi envelope backend lồng chúng dưới
      // `error`. Cả hai luôn undefined nên form voucher vẫn hiện nguyên cục JSON.
      // Giờ ApiError lo phần bóc; riêng lỗi nhập liệu (VAL_001) giữ nguyên câu
      // của backend vì nó chỉ đích danh field sai — đúng thứ admin cần ở form này.
      toastApiError(
        err,
        mode === 'edit' ? 'Không thể cập nhật voucher' : 'Không thể tạo voucher',
      );
    }
  };

  const isEdit = mode === 'edit';

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DialogHeader>
        <DialogTitle>{isEdit ? `Sửa Voucher · ${initial?.code ?? ''}` : 'Tạo Voucher'}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? 'Cập nhật thông tin voucher. Mã voucher không thể đổi vì đã được phát hành.'
            : 'Điền thông tin chi tiết để tạo voucher khuyến mãi mới.'}
        </DialogDescription>
      </DialogHeader>
      <div className="grid max-h-[70vh] grid-cols-1 gap-4 overflow-y-auto p-1 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="code">Mã{isEdit ? ' (không sửa được)' : ''}</Label>
          <Input id="code" {...register('code')} disabled={isEdit} />
          {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
        </div>
        {isEdit && initial && (
          <div className="space-y-2">
            <Label>Đã dùng</Label>
            <Input value={`${initial.usageCount} / ${initial.usageLimit}`} disabled readOnly />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="description">Mô tả (Tùy chọn)</Label>
          <Input id="description" {...register('description')} placeholder="VD: Giảm 10% tối đa 50k" />
        </div>

        <div className="space-y-2">
          <Label>Loại giảm giá</Label>
          <Controller
            name="discountType"
            control={control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED_AMOUNT">Số tiền cố định</SelectItem>
                  <SelectItem value="PERCENTAGE">Phần trăm</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="discountValue">Giá trị giảm</Label>
          <Input id="discountValue" type="number" {...register('discountValue')} />
          {errors.discountValue && <p className="text-sm text-destructive">{errors.discountValue.message}</p>}
        </div>

        {discountType === 'PERCENTAGE' && (
          <div className="space-y-2">
            <Label htmlFor="maxDiscount">Giảm tối đa (VND)</Label>
            <Input id="maxDiscount" type="number" {...register('maxDiscount')} />
            {errors.maxDiscount && <p className="text-sm text-destructive">{errors.maxDiscount.message}</p>}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="minOrderValue">Đơn tối thiểu (VND)</Label>
          <Input id="minOrderValue" type="number" {...register('minOrderValue')} />
          {errors.minOrderValue && <p className="text-sm text-destructive">{errors.minOrderValue.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="usageLimit">Giới hạn sử dụng (tổng)</Label>
          <Input id="usageLimit" type="number" {...register('usageLimit')} />
          {errors.usageLimit && <p className="text-sm text-destructive">{errors.usageLimit.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="userUsageLimit">Mỗi user được đổi (lần)</Label>
          <Input
            id="userUsageLimit"
            type="number"
            placeholder="Bỏ trống = không giới hạn"
            {...register('userUsageLimit')}
          />
          {errors.userUsageLimit && (
            <p className="text-sm text-destructive">{errors.userUsageLimit.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="dailyUsageLimit">Giới hạn đổi mỗi ngày</Label>
          <Input
            id="dailyUsageLimit"
            type="number"
            placeholder="0 = không giới hạn"
            {...register('dailyUsageLimit')}
          />
          {errors.dailyUsageLimit && (
            <p className="text-sm text-destructive">{errors.dailyUsageLimit.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Ngày bắt đầu</Label>
          <Controller
            name="startDate"
            control={control}
            render={({ field }) => (
              <Input
                type="date"
                value={dateInputValue(field.value)}
                onChange={(e) => field.onChange(parseDateInput(e.target.value))}
              />
            )}
          />
          {errors.startDate && <p className="text-sm text-destructive">{errors.startDate.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Ngày kết thúc</Label>
          <Controller
            name="endDate"
            control={control}
            render={({ field }) => (
              <Input
                type="date"
                value={dateInputValue(field.value)}
                onChange={(e) => field.onChange(parseDateInput(e.target.value))}
              />
            )}
          />
          {errors.endDate && <p className="text-sm text-destructive">{errors.endDate.message}</p>}
        </div>
        <div className="space-y-2 sm:col-span-2">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="isActive" className="text-sm font-medium">
                Hoạt động
              </Label>
              <p className="text-xs text-muted-foreground">
                Tắt để ẩn khỏi danh sách hiển thị cho khách hàng.
              </p>
            </div>
            <Controller
              name="isActive"
              control={control}
              render={({ field }) => (
                <Switch
                  id="isActive"
                  checked={field.value ?? true}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </div>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Ai thấy voucher này</Label>
          <Controller
            name="visibility"
            control={control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value ?? 'PUBLIC'}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PUBLIC">Công khai</SelectItem>
                  <SelectItem value="TARGETED">Chỉ định khách</SelectItem>
                  <SelectItem value="CODE_ONLY">Ẩn — gõ mã mới dùng được</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          <p className="text-xs text-muted-foreground">
            {VISIBILITY_HINT[(visibility ?? 'PUBLIC') as PromotionVisibility]}
          </p>
        </div>

        {visibility === 'TARGETED' && (
          <div className="space-y-3 sm:col-span-2">
            <AssigneePicker value={picked} onChange={setPicked} disabled={isSubmitting} />

            {isEdit && existingAssignees.length > 0 && (
              <div className="space-y-2 rounded-md border p-3">
                <Label className="text-xs text-muted-foreground">Đã gán trước đó</Label>
                <div className="flex flex-wrap gap-2">
                  {existingAssignees.map((a) => (
                    <Badge key={a.userId} variant="outline" className="gap-1 py-1">
                      {a.fullName ? `${a.fullName} · ${a.phone ?? ''}` : (a.phone ?? a.userId)}
                      <button
                        type="button"
                        aria-label={`Gỡ ${a.phone ?? a.userId}`}
                        className="ml-1 rounded-sm hover:text-destructive"
                        onClick={async () => {
                          if (!initial) return;
                          try {
                            await revokePromotionFromUser(initial.id, a.userId);
                            setExistingAssignees((prev) =>
                              prev.filter((x) => x.userId !== a.userId),
                            );
                          } catch (err) {
                            toastApiError(err, 'Không gỡ được khách khỏi voucher');
                          }
                        }}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="pointCost">Chi phí điểm thưởng</Label>
          <Input id="pointCost" type="number" {...register('pointCost')} />
          {errors.pointCost && <p className="text-sm text-destructive">{errors.pointCost.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="imageUrl">URL hình ảnh (Tùy chọn)</Label>
          <Input id="imageUrl" {...register('imageUrl')} placeholder="https://..." />
          {errors.imageUrl && <p className="text-sm text-destructive">{errors.imageUrl.message}</p>}
        </div>
      </div>
      <DialogFooter className="pt-4">
        <Button variant="outline" onClick={onCancel} type="button">Hủy</Button>
        <Button type="submit" disabled={isSubmitting || targetedWithoutAssignee}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEdit ? 'Lưu thay đổi' : 'Lưu Voucher'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function PromotionsTable({ isFormOpen, setIsFormOpen }: { isFormOpen: boolean; setIsFormOpen: React.Dispatch<React.SetStateAction<boolean>> }) {
  const [promotions, setPromotions] = React.useState<Promotion[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<Promotion | null>(null);
  // id of the voucher whose inline toggle is mid-flight, so we can disable
  // the Switch while the PUT is in flight and avoid a double-click toggling
  // back and forth.
  const [togglingId, setTogglingId] = React.useState<number | null>(null);
  const { toast } = useToast();

  const fetchPromotions = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getVouchers();
      setPromotions(data);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không thể tải voucher', description: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchPromotions();
  }, [fetchPromotions]);

  const handleSaveSuccess = () => {
    setIsFormOpen(false);
    fetchPromotions();
  };

  // Render a time-window badge (Đã lên lịch / Hoạt động / Hết hạn) plus a
  // muted "Đã tắt" pill when the admin has flipped isActive off. The badge
  // alone used to lie — a voucher could read "Hoạt động" while isActive was
  // false because the column only inspected start/end dates.
  const getStatusBadge = (promo: Promotion) => {
    const now = new Date();
    const startDate = new Date(promo.startDate);
    const endDate = new Date(promo.endDate);
    if (!promo.isActive) {
      return <Badge variant="outline" className="text-muted-foreground">Đã tắt</Badge>;
    }
    if (now < startDate) {
      return <Badge variant="secondary">Đã lên lịch</Badge>;
    }
    if (now > endDate) {
      return <Badge variant="outline">Hết hạn</Badge>;
    }
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400">Hoạt động</Badge>;
  };

  // Toggle isActive directly from the row without opening the edit dialog.
  // Optimistic update so the Switch feels instant; we revert + show a toast
  // if the API call fails.
  const handleToggleActive = async (promo: Promotion, next: boolean) => {
    setTogglingId(promo.id);
    setPromotions((prev) =>
      prev.map((p) => (p.id === promo.id ? { ...p, isActive: next } : p)),
    );
    try {
      await updateVoucher(promo.id, { isActive: next });
      toast({
        title: next ? 'Đã bật voucher' : 'Đã tắt voucher',
        description: `"${promo.code}" hiện ${next ? 'hoạt động' : 'không còn hiển thị cho khách'}.`,
      });
    } catch (err: any) {
      // Revert optimistic flip on failure.
      setPromotions((prev) =>
        prev.map((p) => (p.id === promo.id ? { ...p, isActive: !next } : p)),
      );
      toast({
        variant: 'destructive',
        title: 'Không thể cập nhật trạng thái',
        description: err?.message ?? 'Đã xảy ra lỗi không xác định',
      });
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Danh sách Voucher</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã</TableHead>
                <TableHead>Mô tả</TableHead>
                <TableHead>Giảm giá</TableHead>
                <TableHead>Hiển thị</TableHead>
                <TableHead>Hiệu lực</TableHead>
                <TableHead>Đã dùng</TableHead>
                <TableHead>Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                  </TableCell>
                </TableRow>
              ) : promotions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    Không tìm thấy voucher.
                  </TableCell>
                </TableRow>
              ) : (
                promotions.map(promo => (
                  <TableRow
                    key={promo.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setEditing(promo)}
                  >
                    <TableCell>
                      <Badge variant="destructive">{promo.code}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {promo.description ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {promo.discountType === 'PERCENTAGE'
                        ? `${promo.discountValue}%`
                        : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(promo.discountValue)}
                    </TableCell>
                    <TableCell>
                      {/* Voucher tạo trước đợt này không có cột → PUBLIC, đúng hành vi cũ. */}
                      {(promo.visibility ?? 'PUBLIC') === 'PUBLIC' ? (
                        <span className="text-muted-foreground">Công khai</span>
                      ) : (
                        <Badge variant="secondary">
                          {promo.visibility === 'TARGETED' ? 'Chỉ định' : 'Gõ mã'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {format(new Date(promo.startDate), 'dd/MM/yy')} - {format(new Date(promo.endDate), 'dd/MM/yy')}
                    </TableCell>
                    <TableCell>
                      {promo.usageCount} / {promo.usageLimit}
                    </TableCell>
                    <TableCell
                      // Stop row-click from opening the edit dialog when the
                      // admin is targeting the inline switch — they want to
                      // flip status, not pull up the form.
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-2">
                        {getStatusBadge(promo)}
                        <Switch
                          checked={promo.isActive}
                          disabled={togglingId === promo.id}
                          onCheckedChange={(next) => handleToggleActive(promo, next)}
                          aria-label={`Bật/tắt voucher ${promo.code}`}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-2xl">
          <PromotionForm
            mode="create"
            onCancel={() => setIsFormOpen(false)}
            onSaveSuccess={handleSaveSuccess}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-2xl">
          {editing && (
            <PromotionForm
              mode="edit"
              initial={editing}
              onCancel={() => setEditing(null)}
              onSaveSuccess={() => { setEditing(null); fetchPromotions(); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
