'use client';

import * as React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RotateCcw, RotateCw } from 'lucide-react';

/**
 * Horizontal scrolling list of image thumbnails. Clicking a thumb opens a
 * full-screen lightbox dialog (instead of navigating to a new tab) so the
 * admin can quickly review images without losing context. The lightbox
 * supports 90° rotation so drivers' sideways / upside-down phone photos
 * (CCCD, license, vehicle plate) can be read without exporting them.
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

  // Reset rotation whenever the lightbox opens or switches to a new image,
  // so the admin doesn't see the next photo at whatever angle they left the
  // previous one.
  React.useEffect(() => {
    setRotation(0);
  }, [viewer]);

  if (urls.length === 0) return null;

  // When the image is on its side (90°/270°), the rotated bounding box
  // effectively swaps width and height — clamp the longest dimension to
  // 70vh so it doesn't overflow the dialog or get cut off behind the
  // rotation controls.
  const isSideways = rotation % 180 !== 0;

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
                    // Sideways: swap the max dimensions so the rotated photo
                    // still fits inside the 70vh viewport without clipping.
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
                {rotation !== 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRotation(0)}
                    aria-label="Đặt lại góc xoay"
                  >
                    Đặt lại
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
