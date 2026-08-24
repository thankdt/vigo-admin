'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toastApiError } from '@/hooks/use-api-error-toast';
import { useToast } from '@/hooks/use-toast';
import {
  createCrmCampaign,
  getCrmCampaignStats,
  getCrmCampaigns,
  getCrmSegmentSize,
  getCrmSegments,
  sendCrmCampaign,
  type CrmCampaign,
  type CrmCampaignStats,
  type CrmSegmentDef,
} from '@/lib/api';
import { formatVnDateTime } from '../leakage-review/leakage-labels';
import {
  CAMPAIGN_STATUS_LABEL,
  DELIVERY_STATUS_LABEL,
  SKIP_REASON_LABEL,
} from './campaign-labels';

/**
 * Chiến dịch chăm sóc (CRM GĐ5) — màn DUY NHẤT trong admin gửi tin ra ngoài cho khách thật.
 *
 * 🚨 Trước khi bấm gửi, người vận hành phải thấy SỐ KHÁCH SẼ NHẬN. Backend còn hai chốt
 * chặn nữa (danh sách chặn + giới hạn tần suất) nên con số thực nhận thường NHỎ HƠN —
 * và màn kết quả nói rõ ai bị bỏ qua vì lý do gì.
 */
export default function CrmCampaignsPage() {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = React.useState<CrmCampaign[]>([]);
  const [segments, setSegments] = React.useState<CrmSegmentDef[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [openStats, setOpenStats] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const [c, s] = await Promise.all([getCrmCampaigns(), getCrmSegments()]);
        if (cancelled) return;
        setCampaigns(c);
        setSegments(s);
      } catch (e) {
        if (cancelled) return;
        setFailed(true);
        toastApiError(e, 'Không tải được chiến dịch');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const segName = (id: string) => segments.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Chiến dịch chăm sóc</h1>
        <p className="text-sm text-muted-foreground">
          Gửi ZNS hoặc push cho một phân khúc. Hệ thống tự bỏ qua khách đã yêu cầu ngừng nhận
          và khách đã nhận đủ số tin trong tuần.
        </p>
      </div>

      <CampaignBuilder
        segments={segments}
        onCreated={() => {
          toast({ title: 'Đã tạo chiến dịch (nháp)' });
          setReloadKey((k) => k + 1);
        }}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Chiến dịch</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {loading ? (
            <p className="text-muted-foreground">Đang tải…</p>
          ) : failed ? (
            <p className="text-destructive">Không tải được chiến dịch.</p>
          ) : campaigns.length === 0 ? (
            <p className="text-muted-foreground">Chưa có chiến dịch nào.</p>
          ) : (
            <ul className="space-y-2">
              {campaigns.map((c) => (
                <li key={c.id} data-testid="crm-campaign-row" className="rounded-md border px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{c.name}</span>
                        <Badge variant="secondary">{CAMPAIGN_STATUS_LABEL[c.status]}</Badge>
                        <Badge variant="outline">{c.channel}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Tệp: {segName(c.segmentId)} · tạo {formatVnDateTime(c.createdAt)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setOpenStats(c.id)}>
                        Kết quả
                      </Button>
                      {/*
                        `SENDING` VẪN cho bấm gửi: một lượt gửi bị đứt giữa chừng (deploy,
                        mất kết nối) để chiến dịch kẹt ở trạng thái đó, và backend chạy lại
                        an toàn — ai đã nhận thì bỏ qua. Ẩn nút ở đây nghĩa là chiến dịch
                        dở dang không có đường nào chạy tiếp.
                      */}
                      {c.status === 'DRAFT' || c.status === 'SENDING' ? (
                        <SendButton
                          campaign={c}
                          onSent={(r) => {
                            toast({
                              title: 'Đã nhận lệnh gửi',
                              description:
                                `Đang gửi cho tối đa ${r.total} khách trong nền. ` +
                                'Bấm "Kết quả" sau ít phút để xem số thực nhận.',
                            });
                            setOpenStats(c.id);
                            setReloadKey((k) => k + 1);
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                  {openStats === c.id ? <CampaignStats campaignId={c.id} /> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Nút GỬI có bước xác nhận INLINE.
 *
 * Không dùng modal lồng modal (Radix đánh dấu mọi thứ ngoài Dialog modal là inert — đã dính
 * ở GĐ3). Câu xác nhận nêu rõ: gửi cho tệp nào, và KHÔNG hoàn tác được.
 */
function SendButton({
  campaign,
  onSent,
}: {
  campaign: CrmCampaign;
  onSent: (r: { queued: true; total: number }) => void;
}) {
  const [confirm, setConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  if (!confirm) {
    return (
      <Button size="sm" onClick={() => setConfirm(true)}>
        Gửi
      </Button>
    );
  }

  return (
    <span className="flex items-center gap-2" data-testid="crm-send-confirm">
      <span className="text-xs text-destructive">Gửi thật cho khách — không hoàn tác được.</span>
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            onSent(await sendCrmCampaign(campaign.id));
          } catch (e) {
            toastApiError(e, 'Không gửi được chiến dịch');
          } finally {
            setBusy(false);
            setConfirm(false);
          }
        }}
      >
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Xác nhận gửi
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirm(false)}>
        Huỷ
      </Button>
    </span>
  );
}

/** Kết quả — nói rõ ai bị bỏ qua vì lý do gì, không chỉ đếm số đã gửi. */
function CampaignStats({ campaignId }: { campaignId: string }) {
  const [data, setData] = React.useState<CrmCampaignStats | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    getCrmCampaignStats(campaignId)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && toastApiError(e, 'Không tải được kết quả'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  if (loading) return <p className="mt-2 text-xs text-muted-foreground">Đang tải kết quả…</p>;
  if (!data) return null;

  return (
    <div className="mt-3 space-y-2 rounded-md border p-3" data-testid="crm-campaign-stats">
      <ul className="space-y-1 text-xs">
        {data.breakdown.map((b, i) => (
          <li key={i} data-testid="crm-breakdown-row">
            {DELIVERY_STATUS_LABEL[b.deliveryStatus] ?? b.deliveryStatus}
            {b.skipReason ? ` — ${SKIP_REASON_LABEL[b.skipReason] ?? b.skipReason}` : ''}:{' '}
            <b>{b.n}</b>
          </li>
        ))}
      </ul>
      <p className="text-xs">
        Phát sinh chuyến trong {data.campaign.attributionDays} ngày:{' '}
        <b>{data.attributedCustomers}</b> khách ·{' '}
        <b>{Number(data.attributedRevenue).toLocaleString('vi-VN')}đ</b>
      </p>
    </div>
  );
}

/** Dựng chiến dịch: phân khúc → kênh → nội dung. Xem trước SỐ KHÁCH của tệp trước khi tạo. */
function CampaignBuilder({
  segments,
  onCreated,
}: {
  segments: CrmSegmentDef[];
  onCreated: () => void;
}) {
  const [name, setName] = React.useState('');
  const [segmentId, setSegmentId] = React.useState('');
  const [channel, setChannel] = React.useState<'ZNS' | 'PUSH'>('PUSH');
  const [znsTemplateId, setZnsTemplateId] = React.useState('');
  const [pushTitle, setPushTitle] = React.useState('');
  const [pushBody, setPushBody] = React.useState('');
  const [audience, setAudience] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Đổi tệp thì con số cũ không còn đúng.
  React.useEffect(() => {
    setAudience(null);
  }, [segmentId]);

  const checkAudience = async () => {
    const seg = segments.find((s) => s.id === segmentId);
    if (!seg) return;
    setBusy(true);
    try {
      const res = await getCrmSegmentSize(seg.id);
      setAudience(res.total);
    } catch (e) {
      toastApiError(e, 'Không đếm được tệp');
    } finally {
      setBusy(false);
    }
  };

  const canSave =
    !!name.trim() &&
    !!segmentId &&
    (channel === 'ZNS' ? !!znsTemplateId.trim() : !!pushTitle.trim() && !!pushBody.trim());

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Tạo chiến dịch</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="camp-name">Tên chiến dịch</Label>
            <Input
              id="camp-name"
              className="w-[240px]"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Phân khúc</Label>
            <Select value={segmentId} onValueChange={setSegmentId}>
              <SelectTrigger className="h-9 w-[240px]" aria-label="Chọn phân khúc">
                <SelectValue placeholder="Chọn tệp khách…" />
              </SelectTrigger>
              <SelectContent>
                {segments.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Kênh</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as 'ZNS' | 'PUSH')}>
              <SelectTrigger className="h-9 w-[140px]" aria-label="Chọn kênh">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PUSH">Push</SelectItem>
                <SelectItem value="ZNS">ZNS (Zalo)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" disabled={!segmentId || busy} onClick={checkAudience}>
            Đếm tệp
          </Button>
        </div>

        {audience !== null ? (
          <p className="text-xs" data-testid="camp-audience">
            Tệp có <b>{audience.toLocaleString('vi-VN')}</b> khách. Số thực nhận sẽ NHỎ HƠN:
            hệ thống bỏ qua khách đã chặn và khách đã nhận đủ tin trong tuần.
          </p>
        ) : null}

        {channel === 'ZNS' ? (
          <div className="space-y-1">
            <Label htmlFor="camp-tpl">Mã ZNS template (đã duyệt)</Label>
            <Input
              id="camp-tpl"
              className="w-[280px]"
              value={znsTemplateId}
              onChange={(e) => setZnsTemplateId(e.target.value)}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="camp-title">Tiêu đề push</Label>
              <Input
                id="camp-title"
                value={pushTitle}
                onChange={(e) => setPushTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="camp-body">Nội dung push</Label>
              <Textarea
                id="camp-body"
                rows={2}
                value={pushBody}
                onChange={(e) => setPushBody(e.target.value)}
              />
            </div>
          </div>
        )}

        <Button
          disabled={!canSave || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await createCrmCampaign({
                name: name.trim(),
                segmentId,
                channel,
                ...(channel === 'ZNS'
                  ? { znsTemplateId: znsTemplateId.trim() }
                  : { pushTitle: pushTitle.trim(), pushBody: pushBody.trim() }),
              });
              setName('');
              setZnsTemplateId('');
              setPushTitle('');
              setPushBody('');
              setAudience(null);
              onCreated();
            } catch (e) {
              toastApiError(e, 'Không tạo được chiến dịch');
            } finally {
              setBusy(false);
            }
          }}
        >
          Lưu nháp
        </Button>
        <p className="text-xs text-muted-foreground">
          Lưu ra bản NHÁP — chưa gửi gì. Bấm “Gửi” ở danh sách bên dưới mới gửi thật.
        </p>
      </CardContent>
    </Card>
  );
}
