'use client';

import { PageHeader } from "@/components/page-header";
import { NewsManager } from "./components/news-manager";

export default function NewsPage() {
    return (
        <div className="space-y-6">
            <PageHeader
                title="Quản lý Tin tức"
                description="Tạo và quản lý các bài viết tin tức và cập nhật cho ứng dụng."
            />
            <NewsManager />
        </div>
    );
}
