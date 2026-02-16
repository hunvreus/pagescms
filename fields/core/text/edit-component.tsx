"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";

const EditComponent = forwardRef((props: any, ref) => {
  const { value, field, onChange } = props;
  const internalRef = useRef<HTMLTextAreaElement | null>(null);

  useImperativeHandle(ref, () => internalRef.current);

  return <Textarea
    {...props}
    ref={internalRef}
    minLength={field.options?.minlength}
    maxLength={field.options?.maxlength}
    className="text-base min-h-19.5"
  />;
});

export { EditComponent };