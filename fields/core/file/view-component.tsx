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
  const extraValuesCount = value && Array.isArray(value) ? value.length - 1 : 0;

  const path = useMemo(() => {
    return !value
      ? null
      : Array.isArray(value)
        ? value[0]
        : value;
  }, [value]);

  return (
    <span className="flex items-center gap-x-1.5">
      <Thumbnail path={path} className="w-8 rounded-md"/>
      {extraValuesCount > 0 && (
        <span className="text-muted-foreground text-xs">
          +{extraValuesCount}
        </span>
      )}
    </span>
  );
}

export { ViewComponent };