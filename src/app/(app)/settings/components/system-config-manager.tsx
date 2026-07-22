
'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { getSystemConfigs, updateSystemConfig } from '@/lib/api';
import type { SystemConfig } from '@/lib/types';
import { Loader2, Save, Search, AlertTriangle, Undo2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { buildConfigGroups } from './system-config-groups';
import { ConfigFieldRow, CONFIG_GRID } from './config-field-row';
import { applyEdit, normalizeValue, summarizeSaveResults } from './system-config-edits';
import { useAuth } from '@/lib/auth-context';

export function SystemConfigManager() {
  // Ẩn nhóm mà user không có settings.<group> (defense-in-depth: backend redact secret
  // + chặn ghi; đây là UX). Super thấy tất. Chiều ĐỌC backend không lọc (spec §4.3) nên
  // ẩn ở FE là lớp che duy nhất cho giá trị nhóm khác — chấp nhận vì config không phải secret.
  const { me } = useAuth();
  const canSettings = React.useCallback(
    (groupId: string) => !!me && (me.isSuperAdmin || me.functions.includes('settings.' + groupId)),
    [me],
  );
  // `original` = immutable server snapshot; `edits` = only the changed keys. A field
  // is dirty iff its key is in `edits`. Displayed value = edits[key] ?? original ?? ''.
  const [original, setOriginal] = React.useState<SystemConfig[]>([]);
  const [edits, setEdits] = React.useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState<Record<string, boolean>>({});
  const [savingAll, setSavingAll] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState<string[]>([]);
  const { toast } = useToast();
  const searchRef = React.useRef<HTMLInputElement>(null);

  const originalByKey = React.useMemo(() => {
    const m = new Map<string, SystemConfig>();
    for (const c of original) m.set(c.key, c);
    return m;
  }, [original]);

  const fetchConfigs = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getSystemConfigs();
      setOriginal(data);
      setEdits({}); // fresh server state — drop any stale edits
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không thể tải cấu hình', description: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  const dirtyKeys = Object.keys(edits);
  const dirtyCount = dirtyKeys.length;

  // Warn on tab-close / reload while there are unsaved edits. (Tab-switch inside
  // /settings is handled by forceMount in page.tsx; in-app SPA nav is a known limit.)
  React.useEffect(() => {
    if (dirtyCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // browsers ignore custom text; empty string triggers the prompt
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirtyCount]);

  const displayValue = (key: string) =>
    edits[key] ?? normalizeValue(originalByKey.get(key)?.value);

  const handleChange = (key: string, value: string) => {
    setEdits((prev) => applyEdit(prev, originalByKey.get(key)?.value, key, value));
  };

  const handleRevert = (key: string) => {
    setEdits((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleRevertAll = () => setEdits({});

  // Commit the saved value into the server snapshot for the given keys.
  const commitOriginal = (saved: Map<string, string>) => {
    setOriginal((prev) =>
      prev.map((c) => (saved.has(c.key) ? { ...c, value: saved.get(c.key)! } : c)),
    );
  };

  // Drop keys from `edits` FUNCTIONALLY — never wipe the whole map, or an edit the
  // user made to a clean field mid-save would be destroyed.
  const clearEdits = (keys: string[]) => {
    setEdits((prev) => {
      const next = { ...prev };
      for (const k of keys) delete next[k];
      return next;
    });
  };

  const handleSaveOne = async (key: string) => {
    const value = edits[key];
    if (value === undefined) return;
    const description = originalByKey.get(key)?.description ?? '';
    setIsSaving((prev) => ({ ...prev, [key]: true }));
    try {
      await updateSystemConfig(key, value, description);
      commitOriginal(new Map([[key, value]]));
      clearEdits([key]);
      toast({ title: 'Đã lưu', description: `Cấu hình "${key}" đã được cập nhật.` });
    } catch (err: any) {
      // Keep the edit so the user doesn't lose it. Do NOT refetch (would wipe other edits).
      toast({ variant: 'destructive', title: 'Không thể lưu', description: err.message });
    } finally {
      setIsSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleSaveAll = async () => {
    // Snapshot the batch BEFORE awaiting so post-await state reads can't corrupt it.
    const batch = dirtyKeys.map((key) => ({
      key,
      value: edits[key],
      description: originalByKey.get(key)?.description ?? '',
    }));
    if (batch.length === 0) return;

    setSavingAll(true);
    setIsSaving((prev) => {
      const next = { ...prev };
      for (const b of batch) next[b.key] = true;
      return next;
    });
    try {
      const settled = await Promise.allSettled(
        batch.map((b) => updateSystemConfig(b.key, b.value, b.description)),
      );
      const { okKeys, failKeys } = summarizeSaveResults(batch.map((b) => b.key), settled);

      if (okKeys.length > 0) {
        const savedByKey = new Map(batch.filter((b) => okKeys.includes(b.key)).map((b) => [b.key, b.value]));
        commitOriginal(savedByKey);
        clearEdits(okKeys);
      }

      if (failKeys.length === 0) {
        toast({ title: 'Đã lưu', description: `${okKeys.length} mục đã được cập nhật.` });
        // Bar unmounts (dirty→0) and had focus; move it somewhere sensible.
        searchRef.current?.focus();
      } else {
        toast({
          variant: 'destructive',
          title: `Lưu thất bại ${failKeys.length}/${batch.length} mục`,
          description: `Chưa lưu: ${failKeys.join(', ')}. Đã lưu ${okKeys.length} mục.`,
        });
      }
    } finally {
      setSavingAll(false);
      setIsSaving((prev) => {
        const next = { ...prev };
        for (const b of batch) delete next[b.key];
        return next;
      });
    }
  };

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  // Bucket every config into its group, applying the search filter + RBAC gate.
  const grouped = React.useMemo(
    () => buildConfigGroups(original, query, canSettings),
    [original, query, canSettings],
  );

  // While searching, force every group with matches open so results are visible.
  const accordionValue = searching ? grouped.map((e) => e.group.id) : open;
  const matchCount = grouped.reduce((sum, e) => sum + e.items.length, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cấu hình hệ thống</CardTitle>
        <CardDescription>
          Quản lý các biến toàn hệ thống ({original.length} mục, nhóm theo chức năng). Thay đổi có thể cần khởi động lại ứng dụng để có hiệu lực đầy đủ.
        </CardDescription>
        <div className="relative pt-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            className="pl-9 max-w-md"
            placeholder="Tìm theo khóa hoặc mô tả… (vd: STRICT, pricing, referral)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : grouped.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Không có cấu hình nào khớp “{query}”.
          </div>
        ) : (
          <>
            {searching && (
              <p className="mb-3 text-sm text-muted-foreground">{matchCount} mục khớp “{query}”.</p>
            )}
            <Accordion
              type="multiple"
              value={accordionValue}
              onValueChange={searching ? undefined : setOpen}
              className="space-y-2"
            >
              {grouped.map(({ group, items }) => {
                const Icon = group.icon;
                return (
                  <AccordionItem key={group.id} value={group.id} className="rounded-lg border px-3">
                    <AccordionTrigger className="hover:no-underline">
                      <span className="flex items-center gap-2 text-left">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{group.label}</span>
                        {group.danger && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                        <Badge variant="secondary" className="ml-1">{items.length}</Badge>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      {/* Header row — desktop only; shares CONFIG_GRID so columns align */}
                      <div className={`${CONFIG_GRID} hidden px-2 pb-2 text-xs font-medium text-muted-foreground md:grid`}>
                        <span>Khóa</span>
                        <span>Mô tả</span>
                        <span>Giá trị</span>
                        <span className="text-right">Lưu</span>
                      </div>
                      <div className="space-y-2 md:space-y-0">
                        {items.map((config) => (
                          <ConfigFieldRow
                            key={config.key}
                            config={config}
                            value={displayValue(config.key)}
                            dirty={config.key in edits}
                            saving={!!isSaving[config.key]}
                            onChange={(v) => handleChange(config.key, v)}
                            onSave={() => handleSaveOne(config.key)}
                            onRevert={() => handleRevert(config.key)}
                          />
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </>
        )}

        {/* Sticky save bar — only when there are unsaved edits. Full-bleed to cancel
            CardContent's p-6 so the border/background spans the card width. */}
        {dirtyCount > 0 && (
          <div className="sticky bottom-0 z-20 -mx-6 -mb-6 mt-4 rounded-b-lg border-t bg-background/95 px-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <span aria-live="polite" className="flex items-center gap-2 text-sm font-medium">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                {dirtyCount} thay đổi chưa lưu
              </span>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={handleRevertAll} disabled={savingAll}>
                  <Undo2 className="mr-1.5 h-4 w-4" />
                  Hoàn tác
                </Button>
                <Button type="button" size="sm" onClick={handleSaveAll} disabled={savingAll} aria-busy={savingAll}>
                  {savingAll ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                  Lưu tất cả
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
