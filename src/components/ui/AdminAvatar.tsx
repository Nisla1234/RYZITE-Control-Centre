import React, { useEffect, useState } from 'react';

interface AdminAvatarProps {
  name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AdminAvatarProps['size']>, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-20 w-20 text-xl',
};

export function AdminAvatar({
  name,
  username,
  avatarUrl,
  size = 'md',
  className = '',
}: AdminAvatarProps) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  const initials = (name || username || 'RZ')
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name || username || 'Administrator'}
        onError={() => setImgError(true)}
        className={`${SIZE_CLASSES[size]} shrink-0 rounded-full object-cover border border-[#DDE5F0] bg-[#EEF3FC] ${className}`}
      />
    );
  }

  return (
    <div
      aria-label={name || username || 'Administrator'}
      className={`${SIZE_CLASSES[size]} flex shrink-0 items-center justify-center rounded-full bg-[#2563EB] font-semibold text-white select-none ${className}`}
    >
      {initials}
    </div>
  );
}
