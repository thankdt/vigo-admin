'use client';
import * as React from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, Pencil, StickyNote,
} from 'lucide-react';
import { getFeedback, updateFeedbackNote } from '@/lib/api';
import type { DriverFeedback, FeedbackCategory } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  APP_BUG: 'Lỗi ứng dụng',
  DISPATCH: 'Vấn đề nhận chuyến',
  PAYMENT: 'Thanh toán / Ví',
  CUSTOMER_ISSUE: 'Vấn đề với khách',
  FEATURE_REQUEST: 'Đề xuất tính năng',
  OTHER: 'Khác',
};

const CATEGORY_COLORS: Record<FeedbackCategory, string> = {
  APP_BUG: 'bg-red-100 text-red-700',
  DISPATCH: 'bg-orange-100 text-orange-700',
  PAYMENT: 'bg-yellow-100 text-yellow-700',
  CUSTOMER_ISSUE: 'bg-purple-100 text-purple-700',
  FEATURE_REQUEST: 'bg-blue-100 text-blue-700',
  OTHER: 'bg-gray-100 text-gray-700',
};

const MAX_NOTE_LENGTH = 2000;

function formatVnDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}

export default function FeedbackPage() {
  const { toast } = useToast();
  const [feedbacks, setFeedbacks] = React.useState<DriverFeedback[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [category, setCategory] = React.useState<string>('ALL');
  const [phone, setPhone] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalItems, setTotalItems] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);
  const [expandedRow, setExpandedRow] = React.useState<string | null>(null);

  const [editingFeedback, setEditingFeedback] = React.useState<DriverFeedback | null>(null);
  const [noteDraft, setNoteDraft] = React.useState('');
  const [isSavingNote, setIsSavingNote] = React.useState(false);

  const fetchFeedback = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getFeedback({
        page,
        limit: pageSize,
        category: category === 'ALL' ? undefined : category,
        phone: phone || undefined,
        from: from || undefined,
        to: to || undefined,
      });
      setFeedbacks(result.data);
      setTotalPages(result.totalPages || 1);
      setTotalItems(result.total || 0);
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Không thể tải góp ý',
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, category, phone, from, to, toast]);

  React.useEffect(() => {
    const t = setTimeout(fetchFeedback, 400);
    return () => clearTimeout(t);
  }, [fetchFeedback]);

  const openNoteDialog = (feedback: DriverFeedback) => {
    setEditingFeedback(feedback);
    setNoteDraft(feedback.adminNote ?? '');
  };

  const handleSaveNote = async (clear = false) => {
    if (!editingFeedback) return;
    const nextNote = clear ? null : (noteDraft.trim() || null);
    setIsSavingNote(true);
    try {
      const updated = await updateFeedbackNote(editingFeedback.id, nextNote);
      setFeedbacks((prev) =>
        prev.map((item) =>
          item.id === editingFeedback.id
            ? {
                ...item,
                adminNote:
                  updated && 'adminNote' in updated ? updated.adminNote : nextNote,
                adminNoteUpdatedAt:
                  updated && 'adminNoteUpdatedAt' in updated
                    ? updated.adminNoteUpdatedAt
                    : new Date().toISOString(),
                adminNoteUpdatedBy:
                  updated && 'adminNoteUpdatedBy' in updated
                    ? updated.adminNoteUpdatedBy
                    : item.adminNoteUpdatedBy,
                adminNoteUpdatedByUser:
                  updated && 'adminNoteUpdatedByUser' in updated
                    ? updated.adminNoteUpdatedByUser
                    : item.adminNoteUpdatedByUser,
              }
            : item,
        ),
      );
      toast({
        title: nextNote ? 'Đã lưu ghi chú' : 'Đã xoá ghi chú',
      });
      setEditingFeedback(null);
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Không lưu được ghi chú',
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSavingNote(false);
    }
  };

  const isNoteUnchanged =
    (noteDraft.trim() || null) === (editingFeedback?.adminNote?.trim() || null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Góp ý tài xế</h1>
        <p className="text-muted-foreground">Danh sách góp ý từ tài xế.</p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <Select
          value={category}
          onValueChange={(v) => {
            setCategory(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Loại góp ý" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả loại</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm SĐT tài xế"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setPage(1);
            }}
            className="w-full pl-8 sm:max-w-xs"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:contents">
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            placeholder="Từ ngày"
            className="w-full sm:w-[170px]"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            placeholder="Đến ngày"
            className="w-full sm:w-[170px]"
          />
        </div>
      </div>

      <Card>
        <Table stackBelow="md">
          <TableHeader>
            <TableRow>
              <TableHead className="md:w-[155px]">Thời gian</TableHead>
              <TableHead className="md:w-[180px]">Tài xế</TableHead>
              <TableHead className="md:w-[155px]">Loại</TableHead>
              <TableHead>Nội dung</TableHead>
              <TableHead className="md:w-[240px]">Ghi chú</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin inline mr-2" />
                  Đang tải…
                </TableCell>
              </TableRow>
            ) : feedbacks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Không có góp ý nào.
                </TableCell>
              </TableRow>
            ) : (
              feedbacks.map((f) => {
                const hasNote = Boolean(f.adminNote && f.adminNote.trim());
                return (
                  <TableRow
                    key={f.id}
                    className="cursor-pointer"
                    onClick={() => setExpandedRow(expandedRow === f.id ? null : f.id)}
                  >
                    <TableCell data-label="Thời gian" className="font-mono text-xs">
                      {formatVnDateTime(f.createdAt)}
                    </TableCell>
                    <TableCell data-card="header" className="max-md:-order-1">
                      <div className="font-medium">
                        {f.driver?.user?.fullName || '(Không tên)'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {f.driver?.user?.phone || ''}
                      </div>
                    </TableCell>
                    <TableCell data-label="Phân loại">
                      <Badge className={CATEGORY_COLORS[f.category]}>
                        {CATEGORY_LABELS[f.category]}
                      </Badge>
                    </TableCell>
                    <TableCell data-card="full" data-label="Nội dung">
                      <div className={expandedRow === f.id ? 'whitespace-pre-wrap break-words' : 'line-clamp-2 break-words'}>
                        {f.content}
                      </div>
                    </TableCell>
                    <TableCell
                      data-card="full"
                      data-label="Ghi chú"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => openNoteDialog(f)}
                          className="group flex-1 min-w-0 text-left rounded-md border border-transparent px-2 py-1 -mx-2 -my-1 hover:border-border hover:bg-muted/60 transition-colors"
                          aria-label={hasNote ? 'Sửa ghi chú' : 'Thêm ghi chú'}
                        >
                          {hasNote ? (
                            <div className="space-y-1 min-w-0">
                              <div
                                className={
                                  expandedRow === f.id
                                    ? 'text-sm whitespace-pre-wrap break-words text-foreground'
                                    : 'text-sm line-clamp-2 break-words text-foreground'
                                }
                              >
                                {f.adminNote}
                              </div>
                              {(f.adminNoteUpdatedByUser?.fullName || f.adminNoteUpdatedAt) && (
                                <div className="text-[11px] text-muted-foreground">
                                  {[
                                    f.adminNoteUpdatedByUser?.fullName,
                                    formatVnDateTime(f.adminNoteUpdatedAt),
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">
                              <StickyNote className="h-3.5 w-3.5" />
                              Thêm ghi chú...
                            </span>
                          )}
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={() => openNoteDialog(f)}
                          aria-label={`Ghi chú góp ý của ${f.driver?.user?.fullName || 'tài xế'}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          Hiển thị {feedbacks.length} / {totalItems} kết quả
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
          <Select
            value={pageSize.toString()}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((n) => (
                <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm">Trang {page} / {totalPages}</span>
          <Button variant="outline" size="icon" onClick={() => setPage(1)} disabled={page === 1}>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setPage(totalPages)} disabled={page === totalPages}>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog
        open={editingFeedback !== null}
        onOpenChange={(open) => {
          if (!open && !isSavingNote) setEditingFeedback(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ghi chú xử lý góp ý</DialogTitle>
            <DialogDescription>
              {editingFeedback?.driver?.user?.fullName || '(Không tên)'}
              {editingFeedback?.driver?.user?.phone ? ` · ${editingFeedback.driver.user.phone}` : ''}
            </DialogDescription>
          </DialogHeader>
          {editingFeedback && (
            <div className="space-y-3">
              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap break-words max-h-28 overflow-y-auto">
                {editingFeedback.content}
              </div>
              <div className="space-y-1.5">
                <Textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value.slice(0, MAX_NOTE_LENGTH))}
                  placeholder="Nhập ghi chú xử lý nội bộ cho góp ý này..."
                  rows={4}
                  disabled={isSavingNote}
                />
                <div className="text-right text-[11px] text-muted-foreground">
                  {noteDraft.length}/{MAX_NOTE_LENGTH}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            <div>
              {editingFeedback?.adminNote && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={isSavingNote}
                  onClick={() => handleSaveNote(true)}
                >
                  Xoá ghi chú
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isSavingNote}
                onClick={() => setEditingFeedback(null)}
              >
                Huỷ
              </Button>
              <Button
                type="button"
                disabled={isSavingNote || isNoteUnchanged}
                onClick={() => handleSaveNote(false)}
              >
                {isSavingNote && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Lưu ghi chú
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
