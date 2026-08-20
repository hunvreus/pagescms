"use client";

import { useMemo } from "react";
import { Field } from "@/types/field";
import { File } from "lucide-react";
import { getFileName } from "@/lib/utils/file";

const ViewComponent = ({
  value,
  field
}: {
  value: string;
  field: Field;
}) => {
  const extraValuesCount = value && Array.isArray(value) ? value.length - 1 : 0;

  const filename = useMemo(() => {
    return !value
      ? null
      : Array.isArray(value)
        ? getFileName(value[0])
        : getFileName(value);
  }, [value]);

  if (!filename) return null;

  return (
    <span className="flex items-center gap-x-1.5">
      <span className="inline-flex rounded-full border px-2 py-0.5 text-sm font-medium items-center gap-x-1.5">
        <File className="w-3 h-3 shrink-0"/>
        <span className="text-ellipsis overflow-hidden whitespace-nowrap">
          {filename}
        </span>
      </span>
      {extraValuesCount > 0 && (
        <span className="text-muted-foreground text-xs">
          +{extraValuesCount}
        </span>
      )}
    </span>
  );
}

export { ViewComponent };