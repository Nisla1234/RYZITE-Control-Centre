import React, { useEffect, useState } from 'react';
import { FileText, ImageOff, Loader2, RefreshCw } from 'lucide-react';

interface MediaThumbnailProps {
  src?: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  objectPosition?: string;
  isPdf?: boolean;
  compact?: boolean;
  onClick?: () => void;
  showErrorHint?: boolean;
}

export function MediaThumbnail({
  src,
  alt,
  className = '',
  imgClassName = 'w-full h-full object-cover',
  objectPosition,
  isPdf = false,
  compact = false,
  onClick,
  showErrorHint = false,
}: MediaThumbnailProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(src ? 'loading' : 'error');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setStatus(src ? 'loading' : 'error');
    setRetryCount(0);
  }, [src]);

  if (isPdf) {
    return (
      <div
        onClick={onClick}
        className={`flex flex-col items-center justify-center gap-1.5 bg-[#F4F7FC] text-[#1438B8] ${className}`}
      >
        <FileText className={compact ? 'w-6 h-6' : 'w-10 h-10'} />
        <span className="text-[11px] font-semibold uppercase tracking-wide">PDF Document</span>
      </div>
    );
  }

  const resolvedSrc = src
    ? retryCount > 0
      ? `${src}${src.includes('?') ? '&' : '?'}retry=${retryCount}`
      : src
    : '';

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!src) return;
    setStatus('loading');
    setRetryCount((c) => c + 1);
  };

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden bg-[#F4F7FC] ${className}`}
    >
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-[#F4F7FC] text-[#64748B] z-10">
          <Loader2 className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} animate-spin text-[#1438B8]`} />
          {!compact && <span className="text-[11px] font-medium">Loading image…</span>}
        </div>
      )}

      {status === 'error' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 text-center bg-[#F8FAFC] text-[#64748B]">
          <ImageOff className={`${compact ? 'w-5 h-5' : 'w-6 h-6'} text-[#94A3B8]`} />
          <span className="text-[11px] font-semibold text-[#475569]">Image unavailable</span>
          {showErrorHint && !compact && (
            <span className="text-[10px] leading-snug text-[#64748B] max-w-[240px]">
              Source file not cached yet. Configure GITHUB_TOKEN or use Replace File.
            </span>
          )}
          {src && (
            <button
              type="button"
              onClick={handleRetry}
              className="mt-0.5 inline-flex items-center gap-1 rounded-md border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-medium text-[#334155] transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          )}
        </div>
      ) : (
        resolvedSrc && (
          <img
            key={`${resolvedSrc}`}
            src={resolvedSrc}
            alt={alt}
            loading="lazy"
            style={objectPosition ? { objectPosition } : undefined}
            className={`${imgClassName} transition-opacity duration-200 ${
              status === 'loaded' ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => setStatus('loaded')}
            onError={() => setStatus('error')}
          />
        )
      )}
    </div>
  );
}
