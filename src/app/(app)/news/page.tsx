'use client';

import { PageHeader } from "@/components/page-header";
import { NewsManager } from "./components/news-manager";

export default function NewsPage() {
    return (
        <div className="space-y-6">
            <PageHeader
                title="News Management"
                description="Create and manage news articles and updates for the user application."
            />
            <NewsManager />
        </div>
    );
}
