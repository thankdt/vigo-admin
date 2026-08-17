'use client';

import * as React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getTeamMembers } from '@/lib/api';
import type { TeamMemberRow, TeamOwner } from '@/lib/types';
import {
  commissionRateLabel,
  isFollowUpOverdue,
  stageBadgeClass,
  stageLabel,
  STAGE_ORDER,
  vnDay,
} from '@/lib/driver-team-labels';
import { buildMemberExportRows, MEMBER_EXPORT_HEADER } from '@/lib/driver-team-export';
import { downloadXlsx } from '@/lib/csv';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { DateRange } from '../../finance/components/finance-filter';

const ALL = '__all__';
const EXPORT_CAP = 1000;

export type TeamMemberFilters = {
  stage: string;
  ownerAdminUserId: string;
  q: string;
};

/**
 * Sắp xếp mặc định: người vào team GẦN NHẤT lên đầu.
 *
 * DB không có cột riêng "ngày vào team" (driver_team_member không track mốc
 * chuyển sang JOINED cụ thể) — dùng `stageChangedAt` làm xấp xỉ, fallback
 * `createdAt` cho tài chưa từng đổi stage kể từ khi tạo row pipeline. Với bộ
 * lọc mặc định (stage = Trong team), stageChangedAt của một dòng đang JOINED
 * chính là lần đổi gần nhất — hợp lý để coi là "ngày vào team".
 */
export function sortMembersByJoinDate(rows: TeamMemberRow[]): TeamMemberRow[] {
  const joinTime = (m: TeamMemberRow) => new Date(m.stageChangedAt ?? m.createdAt).getTime();
  return [...rows].sort((a, b) => joinTime(b) - joinTime(a));
}

export function TeamMembersTable({
  range,
  owners,
  onOpenDriver,
  refreshKey,
}: {
  range: DateRange;
  owners: TeamOwner[];
  // Nhận cả DÒNG (không chỉ id): tên/SĐT đã có sẵn trong bảng, truyền xuống để
  // drawer hiện được ngay "đang xem ai" trong lúc chờ tải chi tiết đầy đủ —
  // giống cách RouteAccordion truyền TeamDriverRow cho onSelectDriver.
  onOpenDriver: (driverId: string, member: TeamMemberRow) => void;
  // Đổi giá trị này (vd sau khi lưu ở drawer) để tải lại danh sách — bảng tự
  // fetch nên KHÔNG tự biết khi nào dữ liệu ở nơi khác vừa đổi.
  refreshKey?: number;
}) {
  const { toast } = useToast();
  const [filters, setFilters] = React.useState<TeamMemberFilters>({
    // Mặc định "Trong team": tab này để QUẢN người đã có, người đang được chăm
    // sóc (Đã liên hệ/Đã mời) thường quản lý từ tab "Theo tuyến" hơn. Vẫn chọn
    // được mọi trạng thái khác qua bộ lọc.
    stage: 'JOINED',
    ownerAdminUserId: ALL,
    q: '',
  });
  const [members, setMembers] = React.useState<TeamMemberRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [exporting, setExporting] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTeamMembers({
      from: range.from,
      to: range.to,
      stage: filters.stage === ALL ? undefined : filters.stage,
      ownerId: filters.ownerAdminUserId === ALL ? undefined : filters.ownerAdminUserId,
      q: filters.q || undefined,
    })
      .then((res) => {
        if (cancelled) return;
        setMembers(res.members ?? []);
      })
      .catch((e) =>
        toast({
          variant: 'destructive',
          title: 'Không tải được danh sách đội tài',
          description: String(e?.message ?? e),
        }),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, filters.stage, filters.ownerAdminUserId, filters.q, refreshKey, toast]);

  const sorted = React.useMemo(() => sortMembersByJoinDate(members), [members]);

  const handleExport = async () => {
    setExporting(true);
    try {
      if (sorted.length === 0) {
        toast({ title: 'Không có dòng nào để xuất' });
        return;
      }
      const { rows, truncated } = buildMemberExportRows(sorted, EXPORT_CAP);
      const stamp = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
      await downloadXlsx(
        `doi-tai-thanh-vien_${stamp}.xlsx`,
        [...MEMBER_EXPORT_HEADER],
        rows,
        'Đội tài',
      );
      if (truncated > 0) {
        toast({
          title: 'File đã bị cắt bớt',
          description: `Chỉ xuất ${EXPORT_CAP} dòng đầu, bỏ qua ${truncated} dòng. Lọc thêm rồi xuất lại.`,
        });
      }
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Xuất file thất bại',
        description: String(e?.message ?? e),
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Danh sách đọc thẳng từ hồ sơ pipeline, <strong>không phụ thuộc khoảng ngày</strong> đang
        chọn ở trên — tài mới chạm tới mà chưa chạy chuyến nào vẫn hiện đủ. Khoảng ngày chỉ đổi số
        ở cột &quot;Chuyến trong kỳ&quot;, KHÔNG lọc bớt người.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Tài xế</Label>
          <Input
            className="w-56"
            placeholder="Tên hoặc SĐT"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Trạng thái</Label>
          <Select
            value={filters.stage}
            onValueChange={(v) => setFilters((f) => ({ ...f, stage: v }))}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Mọi trạng thái</SelectItem>
              {STAGE_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {stageLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Người phụ trách</Label>
          <Select
            value={filters.ownerAdminUserId}
            onValueChange={(v) => setFilters((f) => ({ ...f, ownerAdminUserId: v }))}
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Người phụ trách" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Mọi người phụ trách</SelectItem>
              {owners.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.fullName ?? o.phone ?? o.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={() => void handleExport()} disabled={exporting}>
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Xuất Excel
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : sorted.length === 0 ? (
        <p className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          Không có tài xế nào khớp bộ lọc.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tài xế</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>% hoa hồng</TableHead>
                <TableHead>Người phụ trách</TableHead>
                <TableHead>Tuyến phụ trách</TableHead>
                <TableHead>Hẹn gọi lại</TableHead>
                <TableHead>Ngày vào team</TableHead>
                <TableHead className="text-right">Chuyến trong kỳ</TableHead>
                <TableHead className="text-right">Chuyến gần nhất</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((m) => {
                const commission = commissionRateLabel(m.commissionRate);
                return (
                  <TableRow key={m.driverId}>
                    <TableCell>
                      <div className="font-medium">{m.fullName ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">
                        <a href={`tel:${m.phone ?? ''}`} className="hover:underline">
                          {m.phone ?? '—'}
                        </a>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`rounded px-2 py-0.5 text-xs ${stageBadgeClass(m.stage)}`}>
                        {stageLabel(m.stage)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {commission.warn ? (
                        <Badge className="gap-1 bg-red-100 text-red-800 hover:bg-red-100">
                          <AlertTriangle className="h-3 w-3" />
                          {commission.text}
                        </Badge>
                      ) : (
                        <span className="text-sm">{commission.text}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{m.ownerName ?? '—'}</TableCell>
                    <TableCell className="text-sm">
                      {m.assignedRouteNames.length > 0 ? m.assignedRouteNames.join(', ') : '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span
                        className={
                          isFollowUpOverdue(m.nextFollowUpAt) ? 'font-medium text-red-600' : ''
                        }
                      >
                        {vnDay(m.nextFollowUpAt)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {vnDay(m.stageChangedAt ?? m.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">{m.completedTripsInRange}</TableCell>
                    <TableCell className="text-right">{vnDay(m.lastCompletedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => onOpenDriver(m.driverId, m)}>
                        Chi tiết
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
