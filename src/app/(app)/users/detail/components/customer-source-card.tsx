'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toastApiError } from '@/hooks/use-api-error-toast';
import { getCrmCustomerSource, type CrmCustomerSource } from '@/lib/api';
import { formatVnDateTime } from '../../../leakage-review/leakage-labels';

/**
 * "Nguồn khách" — ai giới thiệu khách này (spec §3.4, GĐ2).
 *
 * Khối TỰ SỞ HỮU fetch của nó và chỉ nhận `userId` — đúng mẫu `UserBookingsCard`. Không
 * đưa fetch lên effect gốc của page vì `role` chỉ biết SAU khi `getAdminUserDetail` trả về,
 * nên fetch ở đó sẽ bắn request CRM cho cả tài xế lẫn chủ HTX.
 *
 * BỐN trạng thái phân biệt được BẰNG CHỮ: đang tải · lỗi · rỗng · có dữ liệu. Ẩn khối khi
 * rỗng là sai — admin không phân biệt được "chưa tải xong" với "không có ai giới thiệu".
 */
export function CustomerSourceCard({ userId }: { userId: string }) {
  const [data, setData] = React.useState<CrmCustomerSource | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const res = await getCrmCustomerSource(userId);
        if (cancelled) return;
        setData(res);
      } catch (e) {
        if (cancelled) return;
        setFailed(true);
        toastApiError(e, 'Không tải được nguồn khách');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Nguồn khách</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {loading ? (
          <p className="text-muted-foreground">Đang tải…</p>
        ) : failed ? (
          <p className="text-destructive">Không tải được nguồn khách.</p>
        ) : !data ? (
          <p className="text-muted-foreground">Không qua giới thiệu.</p>
        ) : (
          <div className="space-y-1">
            <p className="flex flex-wrap items-center gap-1.5">
              <span>Được</span>
              {/*
                Trỏ /users/detail — CÙNG function `users` với trang đang đứng, nên người xem
                chắc chắn có quyền và không cần bọc `can()`.
                🚨 ĐỪNG đổi sang /referrals hay /kol: role `cskh` — nhóm dùng hồ sơ 360
                nhiều nhất — KHÔNG có hai function đó, guard sẽ đá họ về /no-access giữa lúc
                đang chăm khách, và họ sẽ báo là "admin bị lỗi" chứ không ai lần ra là RBAC.
              */}
              <Link
                href={`/users/detail?id=${data.referrer.id}`}
                className="font-medium underline underline-offset-2"
              >
                {data.referrer.fullName ?? 'Không rõ tên'}
              </Link>
              {/* `kind` do BACKEND quyết qua kol_profile — FE TUYỆT ĐỐI không tự suy từ mã
                  giới thiệu, vì KOL STANDARD dùng mã thường sẽ bị dán nhãn sai (§13.2). */}
              <Badge variant={data.referrer.kind === 'KOL' ? 'default' : 'secondary'}>
                {data.referrer.kind === 'KOL' ? 'KOL' : 'Affiliate'}
              </Badge>
              <span>giới thiệu</span>
              {data.codeUsed ? (
                <>
                  <span>qua mã</span>
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">{data.codeUsed}</code>
                </>
              ) : null}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatVnDateTime(data.referredAt)}
              {data.referrer.phone ? ` · ${data.referrer.phone}` : ''}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
