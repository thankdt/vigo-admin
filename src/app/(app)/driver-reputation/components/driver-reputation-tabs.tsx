'use client';

import * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReputationRankingTab } from './reputation-ranking-tab';
import { RecentRatingsTab } from './recent-ratings-tab';
import { DriverReputationDialog } from './driver-reputation-dialog';
import type { SelectedDriver } from './select-driver';

/**
 * Hai tab của trang điểm uy tín + dialog chi tiết dùng chung.
 *
 * Mỗi tab tự quản bộ lọc/phân trang của mình. `TabsContent` chỉ mount tab đang
 * mở, nên đổi tab là tab kia unmount — không có request nền của tab ẩn.
 */
export function DriverReputationTabs() {
  const [selected, setSelected] = React.useState<SelectedDriver | null>(null);

  return (
    <>
      <Tabs defaultValue="ranking" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ranking">Bảng xếp hạng</TabsTrigger>
          <TabsTrigger value="recent">Đánh giá gần đây</TabsTrigger>
        </TabsList>

        <TabsContent value="ranking" className="mt-0">
          <ReputationRankingTab onSelectDriver={setSelected} />
        </TabsContent>

        <TabsContent value="recent" className="mt-0">
          <RecentRatingsTab onSelectDriver={setSelected} />
        </TabsContent>
      </Tabs>

      <DriverReputationDialog
        driverId={selected?.id ?? null}
        driverName={selected?.name}
        driverPhone={selected?.phone}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </>
  );
}
