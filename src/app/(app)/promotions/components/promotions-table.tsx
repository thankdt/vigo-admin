'use client';
import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { getVouchers, createVoucher, updateVoucher } from '@/lib/api';
import type { Promotion } from '@/lib/types';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const promotionSchema = z.object({
  name: z.string().min(1, { message: "Tên là bắt buộc" }),
  code: z.string().min(1, { message: "Mã là bắt buộc" }),
  discountType: z.enum(['FIXED_AMOUNT', 'PERCENTAGE']),
  discountValue: z.coerce.number().positive({ message: "Giá trị giảm giá phải là số dương" }),
  minOrderValue: z.coerce.number().min(0, { message: "Giá trị đơn hàng tối thiểu không thể âm" }),
  usageLimit: z.coerce.number().positive({ message: "Giới hạn sử dụng phải là số dương" }),
  // Empty input → undefined → BE keeps it NULL = unlimited per user.
  userUsageLimit: z.coerce.number().int().positive({ message: "Phải là số nguyên dương" }).optional(),
  // Empty input → 0 = unlimited per day. Coerced so blank submits as undefined.
  dailyUsageLimit: z.coerce.number().int().min(0, { message: "Không thể âm" }).optional(),
  startDate: z.date({ required_error: "Ngày bắt đầu là bắt buộc" }),
  endDate: z.date({ required_error: "Ngày kết thúc là bắt buộc" }),
  pointCost: z.coerce.number().min(0, { message: "Chi phí điểm không thể âm" }).default(0),
  imageUrl: z.string().url({ message: "Vui lòng nhập URL hợp lệ" }).optional().or(z.literal('')),
  description: z.string().optional(),
  maxDiscount: z.coerce.number().positive({ message: "Giảm tối đa phải là số dương" }).optional(),
});

type PromotionFormValues = z.infer<typeof promotionSchema>;

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
        name: initial.name,
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
      };
    }
    return { discountType: 'FIXED_AMOUNT', pointCost: 0 };
  }, [mode, initial]);

  const { register, handleSubmit, control, watch, formState: { errors, isSubmitting }, reset } = useForm<PromotionFormValues>({
    resolver: zodResolver(promotionSchema),
    defaultValues,
  });

  const discountType = watch('discountType');

  const onSubmit = async (data: PromotionFormValues) => {
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
        toast({ title: 'Đã cập nhật', description: `Voucher "${initial.code}" được cập nhật.` });
      } else {
        await createVoucher(payload);
        toast({ title: "Thành công", description: "Đã tạo voucher thành công." });
      }
      onSaveSuccess();
      if (mode === 'create') reset();
    } catch (err: any) {
      const errorMessage = err.message || 'Đã xảy ra lỗi không xác định';
      let finalDescription = errorMessage;

      // Attempt to parse if the message is a JSON string
      try {
        const errorObj = JSON.parse(errorMessage);
        if (errorObj.details && Array.isArray(errorObj.details)) {
          finalDescription = errorObj.details.join(', ');
        } else if (errorObj.message) {
          finalDescription = errorObj.message;
        }
      } catch (e) {
        // Not a JSON string, use the original message
      }

      toast({ variant: 'destructive', title: mode === 'edit' ? 'Không thể cập nhật voucher' : 'Không thể tạo voucher', description: finalDescription });
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
          <Label htmlFor="name">Tên</Label>
          <Input id="name" {...register('name')} />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>
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
              <Popover modal={true}>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {field.value ? format(field.value, "PPP") : <span>Chọn ngày</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" style={{ zIndex: 9999 }}>
                  <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                </PopoverContent>
              </Popover>
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
              <Popover modal={true}>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {field.value ? format(field.value, "PPP") : <span>Chọn ngày</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" style={{ zIndex: 9999 }}>
                  <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                </PopoverContent>
              </Popover>
            )}
          />
          {errors.endDate && <p className="text-sm text-destructive">{errors.endDate.message}</p>}
        </div>
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
        <Button type="submit" disabled={isSubmitting}>
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

  const getStatusBadge = (promo: Promotion) => {
    const now = new Date();
    const startDate = new Date(promo.startDate);
    const endDate = new Date(promo.endDate);
    if (now < startDate) {
      return <Badge variant="secondary">Đã lên lịch</Badge>;
    }
    if (now > endDate) {
      return <Badge variant="outline">Hết hạn</Badge>;
    }
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400">Hoạt động</Badge>;
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
                <TableHead>Tên</TableHead>
                <TableHead>Giảm giá</TableHead>
                <TableHead>Hiệu lực</TableHead>
                <TableHead>Đã dùng</TableHead>
                <TableHead>Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                  </TableCell>
                </TableRow>
              ) : promotions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
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
                    <TableCell className="font-medium">{promo.name}</TableCell>
                    <TableCell>
                      {promo.discountType === 'PERCENTAGE'
                        ? `${promo.discountValue}%`
                        : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(promo.discountValue)}
                    </TableCell>
                    <TableCell>
                      {format(new Date(promo.startDate), 'dd/MM/yy')} - {format(new Date(promo.endDate), 'dd/MM/yy')}
                    </TableCell>
                    <TableCell>
                      {promo.usageCount} / {promo.usageLimit}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(promo)}
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
