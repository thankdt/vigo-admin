'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toastApiError } from '@/hooks/use-api-error-toast';
import { useToast } from '@/hooks/use-toast';
import {
  addCrmAccountMember,
  changeCrmAccountStage,
  createCrmAccount,
  getCrmAccount,
  getCrmAccountUsage,
  getCrmAccounts,
  updateCrmAccountTerms,
  type CrmAccount,
  type CrmAccountEventRow,
  type CrmAccountMemberRow,
} from '@/lib/api';
import { formatVnDateTime } from '../leakage-review/leakage-labels';
import { ACCOUNT_ALLOWED_STAGE, ACCOUNT_EVENT_LABEL, STAGE_LABEL } from './account-labels';

/** Khách doanh nghiệp + pipeline B2B (CRM GĐ6, §6.7). */
export default function CrmAccountsPage() {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<CrmAccount[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [taxCode, setTaxCode] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const list = await getCrmAccounts();
        if (!cancelled) setRows(list);
      } catch (e) {
        if (cancelled) return;
        setFailed(true);
        toastApiError(e, 'Không tải được danh sách công ty');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Khách doanh nghiệp</h1>
        <p className="text-sm text-muted-foreground">
          Hồ sơ công ty, nhân viên đặt xe, giai đoạn hợp đồng và điều khoản giá.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Thêm công ty</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3 text-sm">
          <div className="space-y-1">
            <Label htmlFor="acc-name">Tên công ty</Label>
            <Input id="acc-name" className="w-[260px]" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="acc-tax">Mã số thuế</Label>
            <Input id="acc-tax" className="w-[180px]" value={taxCode} onChange={(e) => setTaxCode(e.target.value)} />
          </div>
          <Button
            disabled={!name.trim()}
            onClick={async () => {
              try {
                await createCrmAccount({ name: name.trim(), taxCode: taxCode.trim() || undefined });
                setName('');
                setTaxCode('');
                toast({ title: 'Đã thêm công ty' });
                setReloadKey((k) => k + 1);
              } catch (e) {
                toastApiError(e, 'Không thêm được công ty');
              }
            }}
          >
            Thêm
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Danh sách</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {loading ? (
            <p className="text-muted-foreground">Đang tải…</p>
          ) : failed ? (
            <p className="text-destructive">Không tải được danh sách công ty.</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground">Chưa có công ty nào.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((a) => (
                <li key={a.id} data-testid="crm-account-row" className="rounded-md border px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{a.name}</span>
                        <Badge variant="secondary">{STAGE_LABEL[a.stage]}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {a.taxCode ? `MST ${a.taxCode} · ` : ''}
                        cập nhật {formatVnDateTime(a.updatedAt)}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setOpenId(openId === a.id ? null : a.id)}>
                      Chi tiết
                    </Button>
                  </div>
                  {openId === a.id ? (
                    <AccountDetail accountId={a.id} onChanged={() => setReloadKey((k) => k + 1)} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AccountDetail({ accountId, onChanged }: { accountId: string; onChanged: () => void }) {
  const [account, setAccount] = React.useState<CrmAccount | null>(null);
  const [members, setMembers] = React.useState<CrmAccountMemberRow[]>([]);
  const [events, setEvents] = React.useState<CrmAccountEventRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [memberId, setMemberId] = React.useState('');
  const [discount, setDiscount] = React.useState('');
  const [usage, setUsage] = React.useState<{ trips: number; revenue: number } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    getCrmAccount(accountId)
      .then((d) => {
        if (cancelled) return;
        setAccount(d.account);
        setMembers(d.members);
        setEvents(d.events);
      })
      .catch((e) => !cancelled && toastApiError(e, 'Không tải được hồ sơ công ty'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [accountId, reloadKey]);

  const run = async (fn: () => Promise<unknown>, title: string) => {
    setBusy(true);
    try {
      await fn();
      setReloadKey((k) => k + 1);
      onChanged();
    } catch (e) {
      toastApiError(e, title);
    } finally {
      setBusy(false);
    }
  };

  if (loading || !account) return <p className="mt-2 text-xs text-muted-foreground">Đang tải…</p>;

  // Nút giai đoạn suy từ stage của CHÍNH hồ sơ này (mirror bảng BE), không từ bộ lọc.
  const next = ACCOUNT_ALLOWED_STAGE[account.stage] ?? [];

  return (
    <div className="mt-3 space-y-4 rounded-md border p-3" data-testid="crm-account-detail">
      <div className="space-y-1">
        <Label>Giai đoạn</Label>
        <div className="flex flex-wrap gap-2">
          {next.map((s) => (
            <Button
              key={s}
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => run(() => changeCrmAccountStage(account.id, s), 'Không đổi được giai đoạn')}
            >
              {STAGE_LABEL[s]}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor={`disc-${account.id}`}>Chiết khấu (%)</Label>
          <Input
            id={`disc-${account.id}`}
            className="w-[120px]"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            placeholder={account.discountPercent ?? '—'}
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !discount.trim()}
          onClick={() =>
            run(
              () => updateCrmAccountTerms(account.id, { discountPercent: Number(discount) }),
              'Không lưu được điều khoản',
            )
          }
        >
          Lưu điều khoản
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Nhân viên đặt xe ({members.length})</Label>
        <ul className="space-y-1 text-xs">
          {members.length === 0 ? (
            <li className="text-muted-foreground">Chưa gán nhân viên nào.</li>
          ) : (
            members.map((m) => (
              <li key={m.id} data-testid="crm-account-member">
                {m.fullName ?? 'Không rõ tên'} · {m.phone ?? '—'}
              </li>
            ))
          )}
        </ul>
        <div className="flex items-end gap-2">
          <Input
            className="w-[280px]"
            aria-label="ID nhân viên"
            placeholder="user id của nhân viên"
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !memberId.trim()}
            onClick={() =>
              run(async () => {
                await addCrmAccountMember(account.id, memberId.trim());
                setMemberId('');
              }, 'Không thêm được nhân viên')
            }
          >
            Gán nhân viên
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            // Kỳ mặc định: 30 ngày gần nhất theo NGÀY VN (không dùng giờ trình duyệt).
            const vnToday = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
            const vnFrom = new Date(Date.now() + 7 * 3600_000 - 30 * 86400_000)
              .toISOString()
              .slice(0, 10);
            try {
              setUsage(await getCrmAccountUsage(account.id, vnFrom, vnToday));
            } catch (e) {
              toastApiError(e, 'Không tải được số liệu kỳ');
            }
          }}
        >
          Xem chuyến 30 ngày
        </Button>
        {usage ? (
          <p className="text-xs" data-testid="crm-account-usage">
            {usage.trips} chuyến · {Number(usage.revenue).toLocaleString('vi-VN')}đ
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <Label>Lịch sử</Label>
        <ol className="space-y-1 border-l-2 border-muted pl-3 text-xs">
          {events.map((e) => (
            <li key={e.id} data-testid="crm-account-event">
              {ACCOUNT_EVENT_LABEL[e.type] ?? e.type} · {formatVnDateTime(e.createdAt)}
              {e.note ? ` · ${e.note}` : ''}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
