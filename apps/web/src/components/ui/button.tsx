import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent px-4 text-sm font-semibold tracking-[0.01em] whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-150 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/35 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-[linear-gradient(100deg,#1167ff_0%,#1695f4_42%,#02c3e9_78%,#00d3dd_100%)] text-primary-foreground shadow-[0_12px_30px_rgb(22_149_244_/_0.24)] hover:brightness-110 hover:shadow-[0_15px_36px_rgb(22_149_244_/_0.3)]",
        outline:
          "border-border bg-surface text-text hover:border-signal/60 hover:bg-primary-light hover:text-white aria-expanded:bg-primary-light",
        secondary:
          "bg-mist text-text hover:bg-primary-light hover:text-white",
        ghost:
          "text-text-muted hover:bg-mist hover:text-text aria-expanded:bg-mist",
        destructive:
          "bg-error-light text-error hover:bg-error/15 focus-visible:ring-error/25",
        link: "text-signal underline-offset-4 hover:text-white hover:underline",
      },
      size: {
        default:
          "min-h-11 px-4",
        xs: "min-h-9 rounded-md px-3 text-xs",
        sm: "min-h-10 rounded-md px-3.5 text-[0.82rem]",
        lg: "min-h-12 px-5 text-base",
        icon: "size-11 min-h-11 px-0",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-12 min-h-12 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
