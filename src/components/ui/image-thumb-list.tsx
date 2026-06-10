'use client';

import * as React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RotateCcw, RotateCw } from 'lucide-react';

// Append query params to an image URL (resize ?w=, cache-bust ?v=). Falls back to
// the raw url if URL parsing isn't available (e.g. during SSR).
function withParams(url: string, params: Record<string, string | number | undefined>): string {
  try {
    const u = new URL(url, window.location.origin);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') u.searchParams.set(k, String(v));
    }
    return u.toString();
  } catch {
    return url;
  }
}

// Derive the S3 key (uploads/...) from an image URL, or null if it isn't an
// uploads-served image (external link) — only uploads images can be rotated/saved.
function deriveUploadKey(url: string): string | null {
  try {
    const path = new URL(url, window.location.origin).pathname.replace(/^\/+/, '');
    return path.startsWith('uploads/') ? path : null;
  } catch {
    return null;
  }
}

/**
 * Horizontal scrolling list of image thumbnails. Clicking a thumb opens a
 * full-screen lightbox dialog so the admin can review images without losing
 * context. Supports 90° view-only rotation (CSS transform) for the current review
 * — not persisted, since admins rarely re-open an image after approving it.
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
  const [rotation, setRotation] = React.useState(0);

  // Reset rotation whenever the lightbox opens or switches to a new image.
  React.useEffect(() => {
    setRotation(0);
  }, [viewer]);

  if (urls.length === 0) return null;

  const isSideways = rotation % 180 !== 0;

  return (
    <>
      <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 -mx-1 px-1">
        {urls.map((url, idx) => {
          // Only request a resized thumbnail for uploads-served images — appending
          // ?w to an external (possibly pre-signed) URL could break it.
          const isUpload = deriveUploadKey(url) !== null;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setViewer(url)}
              className="shrink-0 cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-ring rounded-md"
            >
              <img
                src={withParams(url, { w: isUpload ? 400 : undefined })}
                alt={`${altPrefix} ${idx + 1}`}
                className={thumbClassName}
                loading="lazy"
              />
            </button>
          );
        })}
      </div>

      <Dialog open={!!viewer} onOpenChange={(open) => { if (!open) setViewer(null); }}>
        <DialogContent
          className="max-w-[95vw] sm:max-w-4xl p-2 sm:p-4"
          aria-describedby={undefined}
        >
          {viewer && (
            <div className="flex flex-col items-center gap-3">
              <div
                className="flex items-center justify-center overflow-hidden w-full"
                style={{ height: '70vh' }}
              >
                <img
                  src={viewer}
                  alt="Xem ảnh"
                  className="rounded transition-transform duration-200 ease-out"
                  style={{
                    transform: `rotate(${rotation}deg)`,
                    transformOrigin: 'center',
                    maxWidth: isSideways ? '70vh' : '100%',
                    maxHeight: isSideways ? '100%' : '70vh',
                    objectFit: 'contain',
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
                  aria-label="Xoay trái 90°"
                >
                  <RotateCcw className="h-4 w-4 mr-1" /> Xoay trái
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  aria-label="Xoay phải 90°"
                >
                  <RotateCw className="h-4 w-4 mr-1" /> Xoay phải
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Xoay chỉ để xem khi duyệt — không lưu lại.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
