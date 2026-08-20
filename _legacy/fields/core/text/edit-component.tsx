"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const EditComponent = forwardRef((props: any, ref) => {
  const { field, ...restProps } = props;
  const internalRef = useRef<HTMLTextAreaElement | null>(null);

  useImperativeHandle(ref, () => internalRef.current);

  return <Textarea
    {...restProps}
    ref={internalRef}
    minLength={field.options?.minlength}
    maxLength={field.options?.maxlength}
    className={cn("text-base min-h-19.5", field?.readonly && "focus-visible:border-input focus-visible:ring-0")}
    readOnly={field?.readonly}
  />;
});

export { EditComponent };
