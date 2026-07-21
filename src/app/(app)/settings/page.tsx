import { PageHeader } from "@/components/page-header";
import { SystemConfigManager } from "./components/system-config-manager";

// Chỉ còn "Cấu hình hệ thống" (spec §5.4): 3 tab mock cũ (Hồ sơ / Tích hợp API /
// Thông báo) đã bỏ. Không còn Tabs — render thẳng SystemConfigManager (tự chia nhóm,
// mỗi nhóm gate theo settings.<group>).
export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Cài đặt"
        description="Quản lý cấu hình hệ thống."
      />
      <SystemConfigManager />
    </div>
  );
}
