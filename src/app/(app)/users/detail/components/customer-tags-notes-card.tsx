'use client';

import * as React from 'react';
import { Loader2, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toastApiError } from '@/hooks/use-api-error-toast';
import { useAuth } from '@/lib/auth-context';
import {
  addCrmCustomerNote,
  addCrmCustomerTag,
  getCrmCustomerNotes,
  getCrmCustomerTags,
  getCrmTagCatalog,
  removeCrmCustomerNote,
  removeCrmCustomerTag,
  type CrmNote,
  type CrmTag,
} from '@/lib/api';
import { formatVnDateTime } from '../../../leakage-review/leakage-labels';

/**
 * Nhãn + ghi chú tự do về KHÁCH (CRM GĐ2).
 *
 * Khuôn UI: `DriverCallTimeline` trong `drivers/components/driver-detail-dialog.tsx` —
 * ô nhập + nút ghi + `reloadKey` + danh sách mới→cũ. Nó đã chạy production.
 *
 * Nhãn CHỌN TỪ DANH MỤC, không cho gõ tự do: danh mục là thứ khiến nhãn thống kê được ở
 * GĐ4; cho gõ tự do là biến nó thành free-text thứ hai bên cạnh ghi chú.
 */
export function CustomerTagsNotesCard({ userId }: { userId: string }) {
  const { me } = useAuth();

  const [catalog, setCatalog] = React.useState<string[]>([]);
  const [tags, setTags] = React.useState<CrmTag[]>([]);
  const [notes, setNotes] = React.useState<CrmNote[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  const [pickedTag, setPickedTag] = React.useState<string>('');
  const [draftNote, setDraftNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFailed(false);
      try {
        // Danh mục đọc qua endpoint CRM riêng, KHÔNG qua `GET system-config`: key
        // CRM_CUSTOMER_TAGS rơi vào nhóm `settings.misc` mà không starter role nào có →
        // người chỉ có function `users` sẽ nhận 403 trắng khối này.
        const [cat, tg, nt] = await Promise.all([
          getCrmTagCatalog(),
          getCrmCustomerTags(userId),
          getCrmCustomerNotes(userId),
        ]);
        if (cancelled) return;
        setCatalog(cat);
        setTags(tg);
        setNotes(nt.data);
      } catch (e) {
        if (cancelled) return;
        setFailed(true);
        toastApiError(e, 'Không tải được nhãn và ghi chú');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  const handleAddTag = async () => {
    if (!pickedTag) return;
    setBusy(true);
    try {
      await addCrmCustomerTag(userId, pickedTag);
      setPickedTag('');
      setReloadKey((k) => k + 1);
    } catch (e) {
      // Nhãn trùng bị chặn bằng UNIQUE ở DB (409 CRM_TAG_DUP). FE PHẢN ÁNH lỗi đó chứ
      // không tự đoán trước — đoán trước thì hai tab mở song song vẫn lọt.
      toastApiError(e, 'Không gắn được nhãn');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    setBusy(true);
    try {
      await removeCrmCustomerTag(userId, tagId);
      setReloadKey((k) => k + 1);
    } catch (e) {
      toastApiError(e, 'Không gỡ được nhãn');
    } finally {
      setBusy(false);
    }
  };

  const handleAddNote = async () => {
    // Chặn ở FE để không bắn request rác; BE vẫn là chốt cuối.
    if (!draftNote.trim()) return;
    setBusy(true);
    try {
      await addCrmCustomerNote(userId, draftNote.trim());
      setDraftNote('');
      setReloadKey((k) => k + 1);
    } catch (e) {
      toastApiError(e, 'Không ghi được ghi chú');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveNote = async (noteId: string) => {
    setBusy(true);
    try {
      await removeCrmCustomerNote(userId, noteId);
      setReloadKey((k) => k + 1);
    } catch (e) {
      toastApiError(e, 'Không xoá được ghi chú');
    } finally {
      setBusy(false);
    }
  };

  // Nhãn đã gắn thì bỏ khỏi dropdown — chọn lại chỉ để nhận 409.
  const available = catalog.filter((c) => !tags.some((t) => t.tag === c));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Nhãn &amp; ghi chú</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {loading ? (
          <p className="text-muted-foreground">Đang tải…</p>
        ) : failed ? (
          <p className="text-destructive">Không tải được nhãn và ghi chú.</p>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {tags.length === 0 ? (
                  <span className="text-muted-foreground">Chưa gắn nhãn nào.</span>
                ) : (
                  tags.map((t) => (
                    <Badge key={t.id} variant="secondary" className="gap-1 pr-1">
                      {t.tag}
                      <button
                        type="button"
                        aria-label={`Gỡ nhãn ${t.tag}`}
                        disabled={busy}
                        onClick={() => handleRemoveTag(t.id)}
                        className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>

              <div className="flex items-center gap-2">
                <Select value={pickedTag} onValueChange={setPickedTag}>
                  <SelectTrigger className="h-9 w-[220px]" aria-label="Chọn nhãn">
                    <SelectValue placeholder="Chọn nhãn…" />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" disabled={!pickedTag || busy} onClick={handleAddTag}>
                  Gắn nhãn
                </Button>
              </div>
            </div>

            <div className="space-y-2 border-t pt-4">
              <Textarea
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                placeholder="Ghi chú về khách này…"
                rows={2}
              />
              <Button size="sm" disabled={busy} onClick={handleAddNote}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Ghi nhận
              </Button>

              <ul className="space-y-2 pt-1">
                {notes.length === 0 ? (
                  <li className="text-muted-foreground">Chưa có ghi chú nào.</li>
                ) : (
                  notes.map((n) => (
                    <li
                      key={n.id}
                      data-testid="crm-note"
                      className="rounded-md border px-3 py-2"
                    >
                      <p className="whitespace-pre-wrap">{n.note}</p>
                      <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{n.byAdminName ?? '—'}</span>
                        <span>·</span>
                        <span>{formatVnDateTime(n.createdAt)}</span>
                        {/* Nút xoá CHỈ hiện với ghi chú của chính mình. BE vẫn là chốt
                            cuối (chỉ người viết hoặc super admin xoá được). */}
                        {me?.id && n.byAdminUserId === me.id ? (
                          <button
                            type="button"
                            aria-label="Xoá ghi chú"
                            disabled={busy}
                            onClick={() => handleRemoveNote(n.id)}
                            className="underline underline-offset-2 hover:text-destructive"
                          >
                            Xoá
                          </button>
                        ) : null}
                      </p>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
