
'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { getSystemConfigs, updateSystemConfig } from '@/lib/api';
import type { SystemConfig } from '@/lib/types';
import { Loader2, Save, Search, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CONFIG_GROUPS, groupIdFor } from './system-config-groups';

export function SystemConfigManager() {
  const [configs, setConfigs] = React.useState<SystemConfig[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState<Record<string, boolean>>({});
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState<string[]>([]);
  const { toast } = useToast();

  const fetchConfigs = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getSystemConfigs();
      setConfigs(data);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không thể tải cấu hình', description: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  const handleValueChange = (key: string, value: string) => {
    setConfigs((current) => current.map((c) => (c.key === key ? { ...c, value } : c)));
  };

  const handleSave = async (config: SystemConfig) => {
    setIsSaving((prev) => ({ ...prev, [config.key]: true }));
    try {
      await updateSystemConfig(config.key, config.value, config.description);
      toast({ title: 'Thành công', description: `Cấu hình "${config.key}" đã được cập nhật.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không thể cập nhật cấu hình', description: err.message });
      fetchConfigs(); // revert UI to server state on failure
    } finally {
      setIsSaving((prev) => ({ ...prev, [config.key]: false }));
    }
  };

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  // Bucket every config into its group, applying the search filter.
  const grouped = React.useMemo(() => {
    const visible = q
      ? configs.filter((c) => c.key.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q))
      : configs;
    return CONFIG_GROUPS.map((g) => ({
      group: g,
      items: visible.filter((c) => groupIdFor(c.key) === g.id),
    })).filter((entry) => entry.items.length > 0);
  }, [configs, q]);

  // While searching, force every group with matches open so results are visible.
  const accordionValue = searching ? grouped.map((e) => e.group.id) : open;
  const matchCount = grouped.reduce((sum, e) => sum + e.items.length, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cấu hình hệ thống</CardTitle>
        <CardDescription>
          Quản lý các biến toàn hệ thống ({configs.length} mục, nhóm theo chức năng). Thay đổi có thể cần khởi động lại ứng dụng để có hiệu lực đầy đủ.
        </CardDescription>
        <div className="relative pt-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
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
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[28%]">Khóa</TableHead>
                            <TableHead className="w-[42%]">Mô tả</TableHead>
                            <TableHead className="w-[20%]">Giá trị</TableHead>
                            <TableHead className="w-[10%] text-right">Lưu</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((config) => (
                            <TableRow key={config.key}>
                              <TableCell className="font-mono text-sm">{config.key}</TableCell>
                              <TableCell className="text-muted-foreground">{config.description}</TableCell>
                              <TableCell>
                                <Input
                                  value={config.value}
                                  onChange={(e) => handleValueChange(config.key, e.target.value)}
                                  className="h-8"
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                <Button size="sm" onClick={() => handleSave(config)} disabled={isSaving[config.key]}>
                                  {isSaving[config.key] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </>
        )}
      </CardContent>
    </Card>
  );
}
