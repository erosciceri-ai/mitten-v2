import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Slot } from 'radix-ui';

const buttonVariants = cva(
  'group/button inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent px-4 text-sm font-semibold tracking-[0.01em] whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform,filter] duration-150 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-[linear-gradient(100deg,#1d7dff_0%,#1695f4_42%,#02c7e8_76%,#00d3dd_100%)] text-primary-foreground font-bold shadow-[0_10px_28px_rgb(22_149_244_/_0.22)] hover:brightness-110 hover:shadow-[0_14px_32px_rgb(22_149_244_/_0.28)]',
        outline:
          'border-border bg-surface text-text hover:border-signal/60 hover:bg-primary-light hover:text-white aria-expanded:bg-primary-light',
        secondary:
          'bg-mist text-text border-border hover:bg-primary-light hover:text-white',
        ghost:
          'text-text-muted hover:bg-mist hover:text-text aria-expanded:bg-mist',
        destructive:
          'border-error/30 bg-error-light text-error hover:bg-error/20 focus-visible:ring-error/30',
        light:
          'bg-white text-background font-bold hover:bg-[#dffbff]',
        link: 'text-primary-text underline-offset-4 hover:text-white hover:underline',
      },
      size: {
        default: 'min-h-11 px-4',
        xs: 'min-h-10 rounded-md px-3 text-xs',
        sm: 'min-h-11 rounded-md px-3.5 text-[0.85rem]',
        lg: 'min-h-12 px-5 text-base',
        icon: 'size-11 min-h-11 min-w-11 px-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
