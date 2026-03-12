'use client';

import { PageHeader } from "@/components/page-header";
import { BannerManager } from "./components/banner-manager";

export default function BannerPage() {
    return (
        <div className="space-y-6">
            <PageHeader
                title="Banner Management"
                description="Manage promotional banners displayed in the user application."
            />
            <BannerManager />
        </div>
    );
}
