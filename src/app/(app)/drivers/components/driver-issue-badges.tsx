import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export const ISSUE_LABELS: Record<string, string> = {
  missing_name: 'Thiếu tên',
  missing_license_images: 'Thiếu ảnh bằng lái',
  missing_cccd_images: 'Thiếu ảnh CCCD',
  missing_vehicle: 'Chưa có thông tin xe',
  incomplete_vehicle: 'Thông tin xe thiếu trường',
  invalid_plate: 'Biển số sai định dạng',
  unconfirmed_company: 'Đơn vị vận tải chưa xác nhận',
  no_transport_company: 'Chưa gán đơn vị vận tải',
};

const MAX_VISIBLE = 2;

function labelFor(code: string): string {
  return ISSUE_LABELS[code] ?? code;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
      <AlertTriangle className="h-3 w-3" />
      {children}
    </span>
  );
}

export function DriverIssueBadges({ issues }: { issues?: string[] }) {
  if (!issues || issues.length === 0) return null;

  const visible = issues.slice(0, MAX_VISIBLE);
  const overflow = issues.slice(MAX_VISIBLE);

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {visible.map((code) => (
        <Chip key={code}>{labelFor(code)}</Chip>
      ))}
      {overflow.length > 0 && (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-default items-center rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
                +{overflow.length}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <ul className="space-y-0.5">
                {overflow.map((code) => (
                  <li key={code}>{labelFor(code)}</li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
