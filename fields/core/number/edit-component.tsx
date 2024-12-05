"use client";

import { forwardRef } from "react";
import { Input } from "@/components/ui/input";

const EditComponent = forwardRef((props: any, ref: React.Ref<HTMLInputElement>) => {
  return <Input {...props} ref={ref} type="number" className="text-base" />;
});

export { EditComponent };