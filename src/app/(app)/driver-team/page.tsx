'use client';

import { PageHeader } from '@/components/page-header';
import { DriverTeamScreen } from './components/driver-team-screen';

export default function DriverTeamPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Đội tài chuyên nghiệp"
        description="Tuyến nào đang có tài chạy hoàn thành, trong tuyến đó ai nổi trội, và đã chăm tới đâu. Ghi chú ở màn này RIÊNG TƯ — bộ phận vận hành và CSKH không đọc được."
      />
      <DriverTeamScreen />
    </div>
  );
}
