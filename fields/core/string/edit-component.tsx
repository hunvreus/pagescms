"use client";

import { forwardRef } from "react";
import { Input } from "@/components/ui/input";

const EditComponent = forwardRef((props: any, ref: React.Ref<HTMLTextAreaElement>) => {
  return <Input {...props} ref={ref} className="text-base" />;
});

export { EditComponent };