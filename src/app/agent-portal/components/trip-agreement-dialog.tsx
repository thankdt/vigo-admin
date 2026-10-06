'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShieldCheck } from 'lucide-react';

interface TripAgreementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TripAgreementDialog({ open, onOpenChange }: TripAgreementDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[92vw] sm:max-w-md rounded-2xl p-5 sm:p-6 [&>button:last-child]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="space-y-2 text-center sm:text-left">
          <div className="h-11 w-11 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto sm:mx-0 shadow-2xs">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug">
            Xác nhận thoả thuận chuyến đi
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground sr-only">
            Quy định và thoả thuận đặt hộ chuyến đi theo yêu cầu khách hàng
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 py-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800">
            <p>
              Tài xế xác nhận việc đặt hộ chuyến đi theo yêu cầu và sự đồng ý của khách hàng.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800">
            <p>
              Giá chuyến đi được tính dựa trên hành trình vận chuyển (điểm đi-điểm đến). Tài xế chịu trách nhiệm về mức giá thoả thuận với khách hàng.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800">
            <p>
              Giá chuyến đi được ghi nhận trên Hợp đồng vận chuyển điện tử được xác lập giữa ĐVVT và khách hàng trước khi Tài xế bắt đầu chuyến đi.
            </p>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full h-11 text-base font-semibold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl shadow-md transition-all active:scale-[0.99]"
          >
            Đồng ý
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
