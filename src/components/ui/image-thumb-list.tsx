'use client';

import * as React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RotateCcw, RotateCw, Save, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { rotateUploadImage } from '@/lib/api';

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
 * context. Supports 90° rotation; "Lưu lại" persists the new orientation back to
 * S3 (rotated + recompressed) so the image opens upright next time. Thumbnails
 * are served resized (?w=400) for fast grid loads.
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
  const { toast } = useToast();
  const [viewer, setViewer] = React.useState<string | null>(null);
  const [rotation, setRotation] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  // Per-URL cache-bust counter, bumped after a save so the new (rotated) image is
  // re-fetched instead of the browser-cached old one.
  const [bust, setBust] = React.useState<Record<string, number>>({});

  // Reset rotation whenever the lightbox opens or switches to a new image.
  React.useEffect(() => {
    setRotation(0);
  }, [viewer]);

  if (urls.length === 0) return null;

  const isSideways = rotation % 180 !== 0;
  const viewerKey = viewer ? deriveUploadKey(viewer) : null;

  const handleSave = async () => {
    if (!viewer || !viewerKey || rotation === 0) return;
    setSaving(true);
    try {
      await rotateUploadImage(viewerKey, rotation);
      setBust((b) => ({ ...b, [viewer]: (b[viewer] ?? 0) + 1 }));
      setRotation(0);
      toast({ title: 'Đã lưu ảnh theo hướng mới' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Lưu ảnh thất bại', description: e?.message });
    } finally {
      setSaving(false);
    }
  };

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
                src={withParams(url, { w: isUpload ? 400 : undefined, v: bust[url] })}
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
                  src={withParams(viewer, { v: bust[viewer] })}
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
                  disabled={saving}
                  onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
                  aria-label="Xoay trái 90°"
                >
                  <RotateCcw className="h-4 w-4 mr-1" /> Xoay trái
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  aria-label="Xoay phải 90°"
                >
                  <RotateCw className="h-4 w-4 mr-1" /> Xoay phải
                </Button>
                {rotation !== 0 && viewerKey && (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    disabled={saving}
                    onClick={handleSave}
                    aria-label="Lưu ảnh theo hướng mới"
                  >
                    {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                    Lưu lại
                  </Button>
                )}
              </div>
              {rotation !== 0 && !viewerKey && (
                <p className="text-xs text-muted-foreground">
                  Ảnh ngoài hệ thống — không lưu được hướng mới.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
