'use client';

import * as React from 'react';
import { Loader2, Search, Star, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getDriverReputationRanking } from '@/lib/api';
import type { DriverReputationRankRow } from '@/lib/types';
import {
  NO_RATING_LABEL,
  bayesText,
  driverNameText,
  driverPhoneText,
  formatDisplayStars,
  hasDisplayStars,
  lastRatingText,
  ratingCountText,
} from '../reputation-labels';
import type { SelectDriver } from './select-driver';
import { toastApiError } from '@/hooks/use-api-error-toast';

const PAGE_SIZE = 20;
const COL_COUNT = 6;

/** Hàng sao trang trí — làm tròn XUỐNG để không "tặng" thêm sao cho tài xế. */
function StarRow({ value }: { value: number }) {
  const filled = Math.floor(value);
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i <= filled ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`}
        />
      ))}
    </span>
  );
}

/**
 * Ô sao của một dòng.
 *
 * LUẬT 2: `displayStars === null` ⇒ chữ "Chưa có đánh giá" và TUYỆT ĐỐI KHÔNG
 * vẽ hàng sao — 5 ngôi sao rỗng nhìn ra đúng "0 sao". Cổng dùng
 * `hasDisplayStars` (chung định nghĩa với `formatDisplayStars`) chứ KHÔNG so
 * chuỗi nhãn và KHÔNG tự kiểm `!== null`.
 */
function StarsCell({ row }: { row: DriverReputationRankRow }) {
  // Cổng kiểm GIÁ TRỊ (hasDisplayStars), không so chuỗi nhãn.
  if (!hasDisplayStars(row.displayStars)) {
    return <span className="text-sm italic text-muted-foreground">{NO_RATING_LABEL}</span>;
  }
  // Số sao vẽ ra lấy LẠI từ chính chuỗi đã format (đã kẹp 0..5, đã parse cả
  // trường hợp backend trả chuỗi) — không ép kiểu `displayStars` lần nữa, để
  // hàng sao không bao giờ lệch với con số in bên cạnh.
  const text = formatDisplayStars(row.displayStars);
  return (
    <span className="flex items-center gap-2">
      <span className="font-semibold tabular-nums">{text}</span>
      <StarRow value={Number(text)} />
    </span>
  );
}

/**
 * Tab "Bảng xếp hạng" — thứ tự do BACKEND quyết (sao Bayes). Client KHÔNG sắp
 * xếp lại: sắp lại theo `displayStars` sẽ đẩy tài 1 chuyến 5 sao lên đỉnh.
 *
 * Phân trang chạy ở backend (limit/offset) vì bảng quét toàn bộ ~11.7k tài xế.
 */
export function ReputationRankingTab({ onSelectDriver }: { onSelectDriver: SelectDriver }) {

  const [search, setSearch] = React.useState('');
  // Mặc định CHỈ hiện tài đã có đánh giá. Dữ liệu thật: ~11.7k tài mà chỉ một
  // nhúm có đánh giá — bỏ lọc là admin mở trang ra toàn dòng rỗng.
  const [includeUnrated, setIncludeUnrated] = React.useState(false);
  const [page, setPage] = React.useState(0);

  const [rows, setRows] = React.useState<DriverReputationRankRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [minRatingsToShow, setMinRatingsToShow] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  // Debounce chỉ huỷ timer đang chờ, KHÔNG huỷ request đã bay. Thiếu chốt thứ
  // tự này thì một request cũ về muộn sẽ ghi đè danh sách đang đúng bộ lọc.
  const reqIdRef = React.useRef(0);

  // Đổi bộ lọc → về trang đầu NGAY TRONG handler (không qua useEffect): phân
  // trang chạy ở backend, nên reset bằng effect sẽ bắn thêm một request theo
  // offset cũ rồi mới bắn lại theo offset 0 — thừa một vòng và, nếu hai response
  // về lệch thứ tự, là một nhịp hiện nhầm trang.
  const applySearch = (value: string) => {
    setSearch(value);
    setPage(0);
  };
  const applyIncludeUnrated = (value: boolean) => {
    setIncludeUnrated(value);
    setPage(0);
  };

  const load = React.useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    try {
      const data = await getDriverReputationRanking({
        q: search,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        // 0 = hiện cả tài chưa có đánh giá. Truyền số THẬT, đừng để `|| 1` nuốt.
        minRatings: includeUnrated ? 0 : 1,
      });
      if (reqId !== reqIdRef.current) return; // bị request mới thay thế
      setRows(data.items);
      setTotal(data.total);
      setMinRatingsToShow(data.minRatingsToShow);
    } catch (err: any) {
      if (reqId !== reqIdRef.current) return;
      setRows([]);
      setTotal(0);
      toastApiError(err, 'Không tải được bảng xếp hạng');
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [search, includeUnrated, page]);

  React.useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => applySearch(e.target.value)}
              placeholder="Tìm tên hoặc SĐT tài xế..."
              className="pl-8"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="include-unrated"
              checked={includeUnrated}
              onCheckedChange={(checked) => applyIncludeUnrated(checked === true)}
            />
            <Label htmlFor="include-unrated" className="cursor-pointer text-sm font-normal">
              Hiện cả tài chưa có đánh giá
            </Label>
          </div>
        </div>
        {includeUnrated && (
          <p className="text-xs text-muted-foreground">
            Đang hiện toàn bộ tài xế, kể cả người chưa có đánh giá nào — phần lớn danh sách sẽ là dòng
            &quot;{NO_RATING_LABEL}&quot;.
          </p>
        )}
        {minRatingsToShow > 0 && (
          <p className="text-xs text-muted-foreground">
            Tài xế cần ít nhất {minRatingsToShow} đánh giá thì sao mới được công khai; chưa đủ thì hiện
            &quot;{NO_RATING_LABEL}&quot; dù đã có người chấm.
          </p>
        )}
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 whitespace-nowrap">#</TableHead>
              <TableHead className="whitespace-nowrap">Tài xế</TableHead>
              <TableHead className="whitespace-nowrap">Số lượt đánh giá</TableHead>
              <TableHead className="whitespace-nowrap">Sao</TableHead>
              <TableHead className="whitespace-nowrap" title="Sao đã làm mượt theo số lượt đánh giá — đây là khoá SẮP XẾP của bảng. Tài ít đánh giá bị kéo về mức trung bình chung để 1 chuyến 5 sao không chiếm đỉnh bảng.">
                Điểm xếp hạng
              </TableHead>
              <TableHead className="whitespace-nowrap">Đánh giá gần nhất</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={COL_COUNT} className="h-24 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COL_COUNT} className="h-28 text-center text-muted-foreground">
                  <Users className="mx-auto mb-2 h-6 w-6 opacity-50" />
                  {search.trim()
                    ? 'Không tìm thấy tài xế nào khớp từ khoá.'
                    : 'Chưa có tài xế nào có đánh giá.'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, i) => (
                <TableRow
                  key={row.driverId}
                  className="cursor-pointer"
                  onClick={() =>
                    onSelectDriver({
                      id: row.driverId,
                      name: driverNameText(row.fullName),
                      phone: driverPhoneText(row.phone),
                    })
                  }
                >
                  <TableCell className="tabular-nums text-sm text-muted-foreground">
                    {page * PAGE_SIZE + i + 1}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="font-medium">{driverNameText(row.fullName)}</div>
                    <div className="text-xs text-muted-foreground">{driverPhoneText(row.phone)}</div>
                  </TableCell>
                  <TableCell className="tabular-nums">{ratingCountText(row.ratingCount)}</TableCell>
                  <TableCell>
                    <StarsCell row={row} />
                  </TableCell>
                  <TableCell className="tabular-nums text-sm text-muted-foreground">
                    {bayesText(row.bayesStars)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {lastRatingText(row.lastRatingAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {!loading && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-sm text-muted-foreground">
            <span>
              Trang {page + 1}/{totalPages} · {total} tài xế
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Trước
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Sau
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
