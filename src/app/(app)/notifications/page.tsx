import { NotificationsManager } from './components/notifications-manager';

export default function NotificationsPage() {
    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Notifications</h2>
                <div className="flex items-center space-x-2">
                    {/* Add any page-level actions here if needed */}
                </div>
            </div>
            <div className="hidden h-full flex-1 flex-col space-y-8 md:flex">
                <NotificationsManager />
            </div>
        </div>
    );
}
