"use client";
import { Badge } from "@/components/ui/badge";

const ViewComponent = ({ value }: { value: string | string[] }) => {
  if (!value) return null;

  const firstValue = Array.isArray(value) ? value[0] : value;
  if (firstValue == null || firstValue === "") return null;
  const extraValuesCount = Array.isArray(value) ? value.length - 1 : 0;

  return (
    <span className="flex items-center gap-x-1.5">
      <Badge variant="secondary" className="font-mono">
        <span
          className="size-3 rounded-sm border border-black/10"
          style={{ backgroundColor: firstValue }}
          aria-hidden="true"
        />
        {firstValue}
      </Badge>
      {extraValuesCount > 0 && (
        <Badge variant="secondary" className="px-1">
          +{extraValuesCount}
        </Badge>
      )}
    </span>
  );
};

export { ViewComponent };
