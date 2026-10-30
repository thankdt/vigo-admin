'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  getZaloPassConfig,
  getZaloPassGroups,
  updateZaloPassConfig,
  type VizioZaloChannel,
  type VizioZaloGroup,
  type ZaloPassProvinceCatalogEntry,
} from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, RotateCcw, Save, Search, Settings2 } from 'lucide-react';

export function ZaloPassConfigDialog() {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [fetchingGroups, setFetchingGroups] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [vizioUrl, setVizioUrl] = React.useState('https://chat.vizio.vn');
  const [mcpKey, setMcpKey] = React.useState('');
  const [channelId, setChannelId] = React.useState('');
  const [defaultGroupId, setDefaultGroupId] = React.useState('');
  const [defaultGroupName, setDefaultGroupName] = React.useState('');
  const [mentionAll, setMentionAll] = React.useState(true);
  const [autoPassOnCreate, setAutoPassOnCreate] = React.useState(true);
  const [provinceGroupMap, setProvinceGroupMap] = React.useState<
    Record<string, { groupId: string; groupName?: string }>
  >({});
  const [catalog, setCatalog] = React.useState<ZaloPassProvinceCatalogEntry[]>([]);

  const [channels, setChannels] = React.useState<VizioZaloChannel[]>([]);
  const [groups, setGroups] = React.useState<VizioZaloGroup[]>([]);
  const [provinceQuery, setProvinceQuery] = React.useState('');
  const { toast } = useToast();

  const loadConfigAndGroups = React.useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await getZaloPassConfig();
      setVizioUrl(cfg.vizioUrl || 'https://chat.vizio.vn');
      setMcpKey(cfg.mcpKey || '');
      setChannelId(cfg.channelId || '');
      setDefaultGroupId(cfg.defaultGroupId || '');
      setDefaultGroupName(cfg.defaultGroupName || '');
      setMentionAll(cfg.mentionAll ?? true);
      setAutoPassOnCreate(cfg.autoPassOnCreate ?? true);
      setProvinceGroupMap(cfg.provinceGroupMap || {});
      setCatalog(cfg.provinceCatalog || []);

      try {
        setFetchingGroups(true);
        const live = await getZaloPassGroups({
          vizioUrl: cfg.vizioUrl,
          mcpKey: cfg.mcpKey,
          channelId: cfg.channelId || undefined,
        });
        setChannels(live.channels || []);
        setGroups(live.groups || []);
      } catch (err: any) {
        toast({
          variant: 'destructive',
          title: 'Chưa tải được danh sách nhóm trực tiếp từ Vizio',
          description: err.message,
        });
      } finally {
        setFetchingGroups(false);
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Không thể tải cấu hình Zalo Pass',
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    if (open) {
      loadConfigAndGroups();
    }
  }, [open, loadConfigAndGroups]);

  const handleRefreshGroups = async () => {
    setFetchingGroups(true);
    try {
      const live = await getZaloPassGroups({
        vizioUrl,
        mcpKey,
        channelId: channelId || undefined,
        refresh: true,
      });
      setChannels(live.channels || []);
      setGroups(live.groups || []);
      toast({
        title: 'Đã đồng bộ danh sách nhóm Zalo',
        description: `Tìm thấy ${live.groups?.length ?? 0} nhóm Zalo trên Vizio.`,
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Kết nối Vizio MCP thất bại',
        description: err.message,
      });
    } finally {
      setFetchingGroups(false);
    }
  };

  const handleResetDefaultMap = () => {
    const next: Record<string, { groupId: string; groupName?: string }> = {};
    for (const item of catalog) {
      if (item.defaultGroupId) {
        next[item.provinceKey] = {
          groupId: item.defaultGroupId,
          groupName: item.defaultGroupName,
        };
      }
    }
    setProvinceGroupMap(next);
    toast({
      title: 'Đã khôi phục ánh xạ nhóm tỉnh mặc định',
      description: 'Bấm "Lưu cấu hình" để áp dụng.',
    });
  };

  const handleProvinceGroupChange = (provinceKey: string, selectedGroupId: string) => {
    const found = groups.find((g) => g.id === selectedGroupId);
    const catItem = catalog.find((c) => c.provinceKey === provinceKey);
    const groupName =
      found?.name ||
      (selectedGroupId === catItem?.defaultGroupId ? catItem?.defaultGroupName : undefined);

    setProvinceGroupMap((prev) => ({
      ...prev,
      [provinceKey]: {
        groupId: selectedGroupId,
        groupName,
      },
    }));
  };

  const handleDefaultGroupChange = (selectedGroupId: string) => {
    setDefaultGroupId(selectedGroupId);
    const found = groups.find((g) => g.id === selectedGroupId);
    if (found) {
      setDefaultGroupName(found.name);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await updateZaloPassConfig({
        vizioUrl,
        mcpKey,
        channelId,
        defaultGroupId,
        defaultGroupName,
        mentionAll,
        autoPassOnCreate,
        provinceGroupMap,
      });
      setVizioUrl(saved.vizioUrl);
      setMcpKey(saved.mcpKey);
      setChannelId(saved.channelId);
      setDefaultGroupId(saved.defaultGroupId);
      setDefaultGroupName(saved.defaultGroupName);
      setMentionAll(saved.mentionAll);
      setAutoPassOnCreate(saved.autoPassOnCreate ?? true);
      setProvinceGroupMap(saved.provinceGroupMap);
      toast({
        title: 'Đã lưu cấu hình Pass chuyến Zalo',
        description: saved.autoPassOnCreate
          ? 'Hệ thống sẽ tự động @All và bắn thông tin chuyến mới chưa có tài xế vào nhóm Zalo khớp tỉnh.'
          : 'Đã lưu cấu hình. Chế độ tự động pass khi tạo chuyến đang tắt (vẫn có thể bấm Pass thủ công).',
      });
      setOpen(false);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Lưu cấu hình thất bại',
        description: err.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const filteredCatalog = React.useMemo(() => {
    const q = provinceQuery.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (c) =>
        c.provinceLabel.toLowerCase().includes(q) ||
        c.provinceKey.toLowerCase().includes(q) ||
        (provinceGroupMap[c.provinceKey]?.groupName ?? '').toLowerCase().includes(q),
    );
  }, [catalog, provinceQuery, provinceGroupMap]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <Settings2 className="h-4 w-4 text-blue-600" />
          Cấu hình Zalo Pass
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cấu hình Pass chuyến vào Nhóm Zalo (Vizio MCP)</DialogTitle>
          <DialogDescription>
            Tự động tag <code>@All</code> và bắn thông tin chuyến mới chưa có tài xế vào đúng nhóm Zalo theo tỉnh ngay khi khách/admin/đại lý tạo chuyến (hoặc bấm <b>Pass nhóm Zalo</b> bất kỳ lúc nào).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* 1. Kết nối Vizio MCP */}
            <div className="rounded-lg border p-4 space-y-3 bg-muted/20">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">1. Thông tin kết nối Vizio MCP</h4>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleRefreshGroups}
                  disabled={fetchingGroups}
                  className="h-8 gap-1.5 text-xs"
                >
                  {fetchingGroups ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Đồng bộ danh sách nhóm ({groups.length})
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="vizio-url" className="text-xs">
                    URL máy chủ Vizio
                  </Label>
                  <Input
                    id="vizio-url"
                    value={vizioUrl}
                    onChange={(e) => setVizioUrl(e.target.value)}
                    placeholder="https://chat.vizio.vn"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vizio-mcp-key" className="text-xs">
                    MCP API Key (<code>vizio_mcp_...</code>)
                  </Label>
                  <Input
                    id="vizio-mcp-key"
                    value={mcpKey}
                    onChange={(e) => setMcpKey(e.target.value)}
                    placeholder="vizio_mcp_..."
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <Label htmlFor="vizio-channel" className="text-xs">
                    Kênh Zalo cá nhân gửi tin
                  </Label>
                  <select
                    id="vizio-channel"
                    value={channelId}
                    onChange={(e) => setChannelId(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="">Tự động chọn kênh Zalo đang kết nối</option>
                    {channels.map((ch) => (
                      <option key={ch.channel_id} value={ch.channel_id}>
                        {ch.name} ({ch.channel_id}) — {ch.status}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="vizio-default-group" className="text-xs">
                    Nhóm Zalo mặc định (khi không khớp tỉnh)
                  </Label>
                  <select
                    id="vizio-default-group"
                    value={defaultGroupId}
                    onChange={(e) => handleDefaultGroupChange(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  >
                    {defaultGroupId && !groups.some((g) => g.id === defaultGroupId) && (
                      <option value={defaultGroupId}>
                        {defaultGroupName || defaultGroupId} ({defaultGroupId})
                      </option>
                    )}
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.totalMember ?? 0} TV)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <Label htmlFor="vizio-auto-pass" className="text-sm font-medium">
                    Tự động pass vào nhóm Zalo ngay khi có chuyến mới (chưa có tài xế)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Khi khách / Admin / Đại lý tạo chuyến mới chưa gán tài xế (Đang tìm hoặc Đã đặt lịch), hệ thống tự động bắn tin nhắn kèm <code>@All</code> vào nhóm Zalo khớp tỉnh.
                  </p>
                </div>
                <Switch
                  id="vizio-auto-pass"
                  checked={autoPassOnCreate}
                  onCheckedChange={setAutoPassOnCreate}
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <Label htmlFor="vizio-mention-all" className="text-sm font-medium">
                    Tự động tag <code>@All</code> khi gửi vào nhóm Zalo
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Thông báo cho toàn bộ tài xế trong nhóm Zalo ngay khi pass chuyến.
                  </p>
                </div>
                <Switch
                  id="vizio-mention-all"
                  checked={mentionAll}
                  onCheckedChange={setMentionAll}
                />
              </div>
            </div>

            {/* 2. Ánh xạ Tỉnh -> Nhóm Zalo */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold">
                    2. Nhóm Zalo theo Tỉnh / Tuyến đường
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Chuyến đi HN ↔ Tỉnh X sẽ tự động gửi vào nhóm của Tỉnh X. Chuyến Nội đô/Sân bay HN sẽ gửi vào nhóm Hà Nội.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResetDefaultMap}
                  className="h-8 gap-1.5 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Khôi phục mặc định
                </Button>
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={provinceQuery}
                  onChange={(e) => setProvinceQuery(e.target.value)}
                  placeholder="Tìm tỉnh/thành phố hoặc tên nhóm Zalo..."
                  className="pl-8 h-9 text-sm"
                />
              </div>

              <div className="max-h-[300px] overflow-y-auto divide-y border rounded-md">
                {filteredCatalog.map((item) => {
                  const current = provinceGroupMap[item.provinceKey];
                  const selectedId = current?.groupId ?? '';
                  const selectedLabel = current?.groupName || item.defaultGroupName || selectedId;
                  return (
                    <div
                      key={item.provinceKey}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/30"
                    >
                      <div className="flex items-center gap-2 min-w-[180px]">
                        <span className="font-medium">{item.provinceLabel}</span>
                        {selectedId ? (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Đã gán
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                            Dùng mặc định
                          </Badge>
                        )}
                      </div>
                      <select
                        value={selectedId}
                        onChange={(e) => handleProvinceGroupChange(item.provinceKey, e.target.value)}
                        className="flex h-8 w-full sm:max-w-[380px] rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-sm"
                      >
                        <option value="">— Dùng nhóm Zalo mặc định —</option>
                        {selectedId && !groups.some((g) => g.id === selectedId) && (
                          <option value={selectedId}>
                            {selectedLabel} ({selectedId})
                          </option>
                        )}
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name} ({g.totalMember ?? 0} TV)
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Đóng
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || loading} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Lưu cấu hình
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

