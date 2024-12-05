"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";

const EditComponent = forwardRef((props: any, ref) => {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);

  const adjustHeight = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    const totalBorderWidth = 2;
    el.style.height = `${el.scrollHeight + totalBorderWidth}px`;
  };

  useImperativeHandle(ref, () => internalRef.current);

  useEffect(() => {
    if (internalRef.current) adjustHeight(internalRef.current);
  }, []);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    adjustHeight(event.target);
  };

  return <Textarea {...props} ref={internalRef} rows={props.rows ?? 6} onInput={handleInput} className="text-base" />;
});

export { EditComponent };