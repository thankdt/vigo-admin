'use client';

import { PageHeader } from "@/components/page-header";
import { BannerManager } from "./components/banner-manager";

export default function BannerPage() {
    return (
        <div className="space-y-6">
            <PageHeader
                title="Quản lý Banner"
                description="Quản lý các banner quảng cáo hiển thị trong ứng dụng."
            />
            <BannerManager />
        </div>
    );
}
