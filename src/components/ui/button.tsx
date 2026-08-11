import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#458fff] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white shadow-button active:bg-primary-active",
        secondary: "border border-hairline bg-canvas text-ink active:bg-surface-soft",
        ghost: "bg-transparent text-ink active:bg-surface-soft",
        dark: "bg-white text-ink active:bg-surface-strong",
        danger: "bg-danger text-white active:opacity-90",
      },
      size: {
        sm: "h-9 min-h-9 rounded-sm px-3 text-xs",
        md: "h-11 px-4",
        lg: "h-12 px-6 text-base",
        icon: "h-10 min-h-10 w-10 rounded-full p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);

Button.displayName = "Button";

export { Button, buttonVariants };
