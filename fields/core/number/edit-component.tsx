"use client";

import { forwardRef } from "react";
import { Input } from "@/components/ui/input";

const EditComponent = forwardRef((props: any, ref: React.Ref<HTMLInputElement>) => {
  const { field, value, onChange, ...restProps } = props;

  return (
    <Input
      {...restProps}
      ref={ref}
      type="number"
      min={field?.options?.min ?? undefined}
      max={field?.options?.max ?? undefined}
      step={field?.options?.step ?? undefined}
      value={value}
      onChange={onChange}
      className="text-base"
    />
  );
});

export { EditComponent };
