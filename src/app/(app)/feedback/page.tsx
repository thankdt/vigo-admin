'use client';
import * as React from 'react';
import { format } from 'date-fns';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from 'lucide-react';
import { getFeedback } from '@/lib/api';
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Góp ý tài xế</h1>
        <p className="text-muted-foreground">Danh sách góp ý từ tài xế.</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Select
          value={category}
          onValueChange={(v) => {
            setCategory(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Loại góp ý" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả loại</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm SĐT tài xế"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setPage(1);
            }}
            className="max-w-xs pl-8"
          />
        </div>
        <Input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
          placeholder="Từ ngày"
          className="w-[180px]"
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
          placeholder="Đến ngày"
          className="w-[180px]"
        />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Thời gian</TableHead>
              <TableHead className="w-[200px]">Tài xế</TableHead>
              <TableHead className="w-[180px]">Loại</TableHead>
              <TableHead>Nội dung</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin inline mr-2" />
                  Đang tải…
                </TableCell>
              </TableRow>
            ) : feedbacks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  Không có góp ý nào.
                </TableCell>
              </TableRow>
            ) : (
              feedbacks.map((f) => (
                <TableRow
                  key={f.id}
                  className="cursor-pointer"
                  onClick={() => setExpandedRow(expandedRow === f.id ? null : f.id)}
                >
                  <TableCell className="font-mono text-xs">
                    {format(new Date(f.createdAt), 'dd/MM/yyyy HH:mm')}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {f.driver?.user?.fullName || '(Không tên)'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {f.driver?.user?.phone || ''}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={CATEGORY_COLORS[f.category]}>
                      {CATEGORY_LABELS[f.category]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className={expandedRow === f.id ? 'whitespace-pre-wrap' : 'line-clamp-2'}>
                      {f.content}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Hiển thị {feedbacks.length} / {totalItems} kết quả
        </div>
        <div className="flex items-center gap-2">
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
    </div>
  );
}
