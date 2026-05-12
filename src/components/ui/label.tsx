import * as React from "react";
import { cn } from "@/lib/utils";

type Props = React.LabelHTMLAttributes<HTMLLabelElement>;

export const Label = React.forwardRef<HTMLLabelElement, Props>(function Label(
  { className, ...props },
  ref,
) {
  return (
    <label
      ref={ref}
      className={cn("text-sm font-medium text-slate-700", className)}
      {...props}
    />
  );
});
