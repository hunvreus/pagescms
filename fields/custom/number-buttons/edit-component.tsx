"use client";

import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const EditComponent = forwardRef((props: any, ref: React.Ref<HTMLInputElement>) => {
  const { value, onChange } = props;
  
  function changeValue(i) {
    onChange(+value + i);
  }
  
  return (
    <div className="flex items-center gap-1">
      <Button onClick={() => changeValue(-1)} type="button">-</Button>
      <Input {...props} ref={ref} type="number" className="text-base max-w-xs" />
      <Button onClick={() => changeValue(1)} type="button">+</Button>
    </div>
  );
});

export { EditComponent };