"use client";
import { Badge } from "@/components/ui/badge";

const ViewComponent = ({ value }: { value: boolean}) => {
  if (value == null) return null;
  
  const firstValue = Array.isArray(value) ? value[0] : value;
  if (firstValue == null) return null;
  const extraValuesCount = Array.isArray(value) ? value.length - 1 : 0;

  return (
    <span className="flex items-center gap-x-1.5">
      {value
        ? <Badge>True</Badge>
        : <Badge variant="secondary">False</Badge>
      }
      {extraValuesCount > 0 && (
        <span className="text-muted-foreground text-xs">
          +{extraValuesCount}
        </span>
      )}
    </span>
  );
};

export { ViewComponent };