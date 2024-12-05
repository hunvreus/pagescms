"use client";

import { forwardRef } from "react";
import { Switch } from "@/components/ui/switch";

const EditComponent = forwardRef((props: any, ref: React.Ref<HTMLInputElement>) => {
  return (
    <div>
      <Switch
        {...props}
        ref={ref}
        checked={props.value}
        onCheckedChange={props.onChange}
      />
    </div>
  );
});

export { EditComponent };