'use client';
import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { getVouchers, createVoucher } from '@/lib/api';
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
    name: z.string().min(1, { message: "Name is required" }),
    code: z.string().min(1, { message: "Code is required" }),
    discountType: z.enum(['FIXED_AMOUNT', 'PERCENTAGE']),
    discountValue: z.coerce.number().positive({ message: "Discount value must be positive" }),
    minOrderValue: z.coerce.number().min(0, { message: "Minimum order value cannot be negative" }),
    usageLimit: z.coerce.number().positive({ message: "Usage limit must be positive" }),
    startDate: z.date({ required_error: "Start date is required" }),
    endDate: z.date({ required_error: "End date is required" }),
    pointCost: z.coerce.number().min(0, { message: "Point cost cannot be negative" }).default(0),
    imageUrl: z.string().url({ message: "Please enter a valid URL" }).optional().or(z.literal('')),
});

type PromotionFormValues = z.infer<typeof promotionSchema>;

function PromotionForm({ onSaveSuccess, onCancel }: { onSaveSuccess: () => void, onCancel: () => void }) {
    const { toast } = useToast();
    const { register, handleSubmit, control, formState: { errors, isSubmitting }, reset } = useForm<PromotionFormValues>({
        resolver: zodResolver(promotionSchema),
        defaultValues: {
            discountType: 'FIXED_AMOUNT',
            pointCost: 0,
        },
    });

    const onSubmit = async (data: PromotionFormValues) => {
        try {
            await createVoucher({
                ...data,
                startDate: data.startDate.toISOString(),
                endDate: data.endDate.toISOString(),
            });
            toast({ title: "Success", description: "Voucher created successfully." });
            onSaveSuccess();
            reset(); // Reset form after successful submission
        } catch (err: any) {
            const errorMessage = err.message || 'An unknown error occurred';
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

            toast({ variant: 'destructive', title: 'Failed to create voucher', description: finalDescription });
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <DialogHeader>
                <DialogTitle>Create Voucher</DialogTitle>
                <DialogDescription>Fill in the details to create a new promotional voucher.</DialogDescription>
            </DialogHeader>
            <div className="grid max-h-[70vh] grid-cols-1 gap-4 overflow-y-auto p-1 sm:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" {...register('name')} />
                    {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="code">Code</Label>
                    <Input id="code" {...register('code')} />
                    {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label>Discount Type</Label>
                    <Controller
                        name="discountType"
                        control={control}
                        render={({ field }) => (
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="FIXED_AMOUNT">Fixed Amount</SelectItem>
                                    <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                                </SelectContent>
                            </Select>
                        )}
                    />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="discountValue">Discount Value</Label>
                    <Input id="discountValue" type="number" {...register('discountValue')} />
                    {errors.discountValue && <p className="text-sm text-destructive">{errors.discountValue.message}</p>}
                </div>
                
                <div className="space-y-2">
                    <Label htmlFor="minOrderValue">Min. Order Value (VND)</Label>
                    <Input id="minOrderValue" type="number" {...register('minOrderValue')} />
                    {errors.minOrderValue && <p className="text-sm text-destructive">{errors.minOrderValue.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="usageLimit">Usage Limit</Label>
                    <Input id="usageLimit" type="number" {...register('usageLimit')} />
                    {errors.usageLimit && <p className="text-sm text-destructive">{errors.usageLimit.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label>Start Date</Label>
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
                                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
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
                    <Label>End Date</Label>
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
                                        {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
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
                    <Label htmlFor="pointCost">Loyalty Point Cost</Label>
                    <Input id="pointCost" type="number" {...register('pointCost')} />
                    {errors.pointCost && <p className="text-sm text-destructive">{errors.pointCost.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="imageUrl">Image URL (Optional)</Label>
                    <Input id="imageUrl" {...register('imageUrl')} placeholder="https://..." />
                    {errors.imageUrl && <p className="text-sm text-destructive">{errors.imageUrl.message}</p>}
                </div>
            </div>
            <DialogFooter className="pt-4">
                <Button variant="outline" onClick={onCancel} type="button">Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Voucher
                </Button>
            </DialogFooter>
        </form>
    );
}

export function PromotionsTable({ isFormOpen, setIsFormOpen }: { isFormOpen: boolean; setIsFormOpen: React.Dispatch<React.SetStateAction<boolean>> }) {
  const [promotions, setPromotions] = React.useState<Promotion[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const { toast } = useToast();

  const fetchPromotions = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getVouchers();
      setPromotions(data);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to fetch vouchers', description: err.message });
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
        return <Badge variant="secondary">Scheduled</Badge>;
    }
    if (now > endDate) {
        return <Badge variant="outline">Expired</Badge>;
    }
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400">Active</Badge>;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Voucher List</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Validity</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Status</TableHead>
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
                    No vouchers found.
                  </TableCell>
                </TableRow>
              ) : (
                promotions.map(promo => (
                  <TableRow key={promo.id}>
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
            onCancel={() => setIsFormOpen(false)}
            onSaveSuccess={handleSaveSuccess}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
