'use client';

import { PageHeader } from "@/components/page-header";
import { AppPopupManager } from "./components/app-popup-manager";

export default function AppPopupPage() {
    return (
        <div className="space-y-6">
            <PageHeader
                title="Popup quảng cáo"
                description="Quản lý popup hiển thị khi người dùng vào ứng dụng."
            />
            <AppPopupManager />
        </div>
    );
}
