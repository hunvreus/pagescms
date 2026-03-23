"use client";

import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const EditComponent = forwardRef((props: any, ref: React.Ref<HTMLInputElement>) => {
  const { field, value, onChange } = props;

  return (
    <Input
      min={field?.options?.min ?? undefined}
      max={field?.options?.max ?? undefined}
      step={field?.options?.step ?? undefined}
      ref={ref}
      type={field?.options?.time ? "datetime-local" : "date"}
      value={value}
      onChange={onChange}
      className={cn("w-auto text-base", field?.readonly && "focus-visible:border-input focus-visible:ring-0")}
      readOnly={field?.readonly}
    />
  );
});

export { EditComponent };
