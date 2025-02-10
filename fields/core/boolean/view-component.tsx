"use client";

const ViewComponent = ({ value }: { value: boolean}) => {
  if (value == null) return null;
  
  const firstValue = Array.isArray(value) ? value[0] : value;
  if (firstValue == null) return null;
  const extraValuesCount = Array.isArray(value) ? value.length - 1 : 0;

  return (
    <span className="flex items-center gap-x-1.5">
      {value
        ? <span className="inline-block rounded-full border border-primary bg-primary text-primary-foreground px-2 py-0.5 text-sm font-medium">True</span>
        : <span className="inline-block rounded-full border bg-muted px-2 py-0.5 text-sm font-medium">False</span>
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