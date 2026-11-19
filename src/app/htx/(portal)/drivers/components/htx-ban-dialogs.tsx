'use client';

import * as React from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Ban, Loader2, LockOpen } from 'lucide-react';

interface HtxBanConfirmDialogProps {
  open: boolean;
  driverName: string;
  reason: string;
  onReasonChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  submitting: boolean;
  idPrefix: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Hộp thoại xác nhận khoá cứng tài khoản tài xế (dùng chung cho bảng HTX và dialog chi tiết). */
export function HtxBanConfirmDialog({
  open,
  driverName,
  reason,
  onReasonChange,
  note,
  onNoteChange,
  submitting,
  idPrefix,
  onCancel,
  onConfirm,
}: HtxBanConfirmDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !submitting) onCancel();
      }}
    >
      <AlertDialogContent onCloseAutoFocus={(e) => { e.preventDefault(); document.body.style.pointerEvents = ''; }}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <Ban className="h-5 w-5" />
            Khoá tài khoản tài xế
          </AlertDialogTitle>
          <AlertDialogDescription>
            Tài xế <span className="font-semibold text-foreground">{driverName}</span> sẽ bị{' '}
            <span className="font-semibold">đăng xuất ngay</span> và không thể đăng nhập hoặc nhận chuyến cho tới khi được mở khoá.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor={`${idPrefix}-ban-reason`} className="text-xs font-medium">
              Lý do khoá <span className="text-destructive">*</span> (tài xế sẽ thấy lý do này)
            </label>
            <Textarea
              id={`${idPrefix}-ban-reason`}
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="Ví dụ: vi phạm nội quy HTX, giả mạo hồ sơ…"
              rows={2}
              disabled={submitting}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${idPrefix}-ban-note`} className="text-xs font-medium text-muted-foreground">
              Ghi chú nội bộ (tuỳ chọn)
            </label>
            <Textarea
              id={`${idPrefix}-ban-note`}
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="Ghi chú nội bộ…"
              rows={2}
              disabled={submitting}
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Huỷ</AlertDialogCancel>
          <AlertDialogAction
            disabled={submitting || !reason.trim()}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Xác nhận khoá
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface HtxUnbanConfirmDialogProps {
  open: boolean;
  driverName: string;
  note: string;
  onNoteChange: (value: string) => void;
  submitting: boolean;
  idPrefix: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Hộp thoại xác nhận mở khoá tài khoản tài xế (chỉ dành cho tài khoản do HTX khoá). */
export function HtxUnbanConfirmDialog({
  open,
  driverName,
  note,
  onNoteChange,
  submitting,
  idPrefix,
  onCancel,
  onConfirm,
}: HtxUnbanConfirmDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !submitting) onCancel();
      }}
    >
      <AlertDialogContent onCloseAutoFocus={(e) => { e.preventDefault(); document.body.style.pointerEvents = ''; }}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <LockOpen className="h-5 w-5" />
            Mở khoá tài khoản tài xế
          </AlertDialogTitle>
          <AlertDialogDescription>
            Tài xế <span className="font-semibold text-foreground">{driverName}</span> sẽ đăng nhập lại được và trở lại trạng thái trước khi bị khoá.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-unban-note`} className="text-xs font-medium text-muted-foreground">
            Ghi chú nội bộ (tuỳ chọn)
          </label>
          <Textarea
            id={`${idPrefix}-unban-note`}
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Ghi chú nội bộ…"
            rows={2}
            disabled={submitting}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Huỷ</AlertDialogCancel>
          <AlertDialogAction
            disabled={submitting}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Xác nhận mở khoá
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
