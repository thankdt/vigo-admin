'use client';

import * as React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

/**
 * Horizontal scrolling list of image thumbnails. Clicking a thumb opens a
 * full-screen lightbox dialog (instead of navigating to a new tab) so the
 * admin can quickly review images without losing context.
 */
export function ImageThumbList({
  urls,
  altPrefix = 'Image',
  thumbClassName = 'h-32 object-cover rounded-md border',
}: {
  urls: string[];
  altPrefix?: string;
  thumbClassName?: string;
}) {
  const [viewer, setViewer] = React.useState<string | null>(null);

  if (urls.length === 0) return null;

  return (
    <>
      <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 -mx-1 px-1">
        {urls.map((url, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setViewer(url)}
            className="shrink-0 cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-ring rounded-md"
          >
            <img
              src={url}
              alt={`${altPrefix} ${idx + 1}`}
              className={thumbClassName}
              loading="lazy"
            />
          </button>
        ))}
      </div>

      <Dialog open={!!viewer} onOpenChange={(open) => { if (!open) setViewer(null); }}>
        <DialogContent
          className="max-w-[95vw] sm:max-w-4xl p-2 sm:p-4"
          aria-describedby={undefined}
        >
          {viewer && (
            <img
              src={viewer}
              alt="Xem ảnh"
              className="w-full h-auto max-h-[85vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
