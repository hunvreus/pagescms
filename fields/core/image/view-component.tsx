"use client";

import { useMemo } from "react";
import { Thumbnail } from "@/components/thumbnail";
import { Field } from "@/types/field";

const ViewComponent = ({
  value,
  field
}: {
  value: string;
  field: Field;
}) => {
  
  const path = useMemo(() => {
    return !value
      ? null
      : Array.isArray(value)
        ? value[0]
        : value;
  }, [value]);

  return <Thumbnail path={path} className="w-8 rounded-md"/>;
}

export { ViewComponent };