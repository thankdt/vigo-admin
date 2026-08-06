'use client';

import { PageHeader } from '@/components/page-header';
import { DriverReputationTabs } from './components/driver-reputation-tabs';

export default function DriverReputationPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Điểm & đánh giá tài xế"
        description="Xếp hạng theo sao khách chấm và theo dõi các đánh giá mới nhất. Chỉ để tham khảo — điểm/sao KHÔNG dùng để chặn hay ưu tiên gán chuyến."
      />
      <DriverReputationTabs />
    </div>
  );
}
