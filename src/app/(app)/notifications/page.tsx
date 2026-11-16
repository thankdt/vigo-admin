import { PageHeader } from '@/components/page-header';
import { NotificationsManager } from './components/notifications-manager';

export default function NotificationsPage() {
    return (
        <div className="space-y-6">
            <PageHeader
                title="Thông báo"
                description="Quản lý thông báo đẩy gửi ngay hoặc đặt lịch gửi cho khách hàng và tài xế."
            />
            <NotificationsManager />
        </div>
    );
}
