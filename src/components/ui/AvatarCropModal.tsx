import React, { useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, Move } from 'lucide-react';

interface AvatarCropModalProps {
  file: File | null;
  onCancel: () => void;
  onConfirm: (croppedFile: File, previewUrl: string) => void;
}

const VIEWPORT_SIZE = 240;
const OUTPUT_SIZE = 512;

export function AvatarCropModal({ file, onCancel, onConfirm }: AvatarCropModalProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number }>({
    x: 0,
    y: 0,
    ox: 0,
    oy: 0,
  });
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!file) {
      setImageSrc(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!file || !imageSrc) return null;

  const baseScale = Math.max(VIEWPORT_SIZE / naturalSize.w, VIEWPORT_SIZE / naturalSize.h);
  const effectiveScale = baseScale * zoom;
  const displayW = naturalSize.w * effectiveScale;
  const displayH = naturalSize.h * effectiveScale;

  const clampOffset = (nx: number, ny: number, nextZoom = zoom) => {
    const scale = baseScale * nextZoom;
    const maxX = Math.max(0, (naturalSize.w * scale - VIEWPORT_SIZE) / 2);
    const maxY = Math.max(0, (naturalSize.h * scale - VIEWPORT_SIZE) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, nx)),
      y: Math.min(maxY, Math.max(-maxY, ny)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setOffset(clampOffset(dragStartRef.current.ox + dx, dragStartRef.current.oy + dy));
  };

  const handlePointerUp = () => {
    setDragging(false);
  };

  const handleZoomChange = (nextZoom: number) => {
    setZoom(nextZoom);
    setOffset((prev) => clampOffset(prev.x, prev.y, nextZoom));
  };

  const handleApply = () => {
    const img = imgRef.current;
    if (!img) return;

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ratio = OUTPUT_SIZE / VIEWPORT_SIZE;
    const drawW = displayW * ratio;
    const drawH = displayH * ratio;
    const drawX = (OUTPUT_SIZE - drawW) / 2 + offset.x * ratio;
    const drawY = (OUTPUT_SIZE - drawH) / 2 + offset.y * ratio;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    const targetMime = file.type === 'image/webp' ? 'image/webp' : file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    const ext = targetMime === 'image/webp' ? 'webp' : targetMime === 'image/jpeg' ? 'jpg' : 'png';

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const croppedFile = new File([blob], `admin-avatar.${ext}`, { type: targetMime });
        const previewUrl = URL.createObjectURL(blob);
        onConfirm(croppedFile, previewUrl);
      },
      targetMime,
      0.92
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1F4E]/60 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-crop-title"
    >
      <div className="w-full max-w-md rounded-xl border border-[#DDE5F0] bg-white p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 id="avatar-crop-title" className="text-base font-semibold text-[#0D1F4E]">
              Position Profile Picture
            </h3>
            <p className="text-xs text-[#64748B] mt-0.5">
              Drag to position and zoom into a circular avatar.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-[#64748B] hover:bg-[#F4F7FC] hover:text-[#0F172A]"
            aria-label="Cancel crop"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Circular Crop Viewport */}
        <div className="flex flex-col items-center gap-3">
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE }}
            className={`relative overflow-hidden rounded-full border-2 border-[#1438B8] bg-[#F4F7FC] select-none touch-none ${
              dragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Crop preview"
              draggable={false}
              onLoad={(e) => {
                const target = e.currentTarget;
                setNaturalSize({ w: target.naturalWidth || 1, h: target.naturalHeight || 1 });
              }}
              style={{
                width: displayW,
                height: displayH,
                transform: `translate(${(VIEWPORT_SIZE - displayW) / 2 + offset.x}px, ${(VIEWPORT_SIZE - displayH) / 2 + offset.y}px)`,
                maxWidth: 'none',
              }}
              className="pointer-events-none select-none"
            />
          </div>

          <div className="inline-flex items-center gap-1.5 text-[11px] text-[#64748B]">
            <Move className="h-3.5 w-3.5" />
            Drag image to adjust framing
          </div>
        </div>

        {/* Zoom Slider */}
        <div className="flex items-center gap-3">
          <ZoomOut className="h-4 w-4 text-[#64748B] shrink-0" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => handleZoomChange(Number(e.target.value))}
            aria-label="Zoom profile photo"
            className="flex-1 accent-[#1438B8]"
          />
          <ZoomIn className="h-4 w-4 text-[#64748B] shrink-0" />
          <span className="font-mono text-xs tabular-nums text-[#475569] w-10 text-right">
            {zoom.toFixed(1)}x
          </span>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E2E8F0]">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[#DDE5F0] bg-white px-4 py-2 text-xs font-medium text-[#334155] hover:bg-[#F4F7FC]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="rounded-lg bg-[#1438B8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#102D96]"
          >
            Apply Crop
          </button>
        </div>
      </div>
    </div>
  );
}
