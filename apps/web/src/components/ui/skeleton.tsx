import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Subtle dark-surface skeleton placeholder respecting reduced-motion preferences. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-lg bg-surface-elevated/80 motion-reduce:animate-none', className)}
      {...props}
    />
  );
}
