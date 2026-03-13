"use client";

const getItemLabel = (item: unknown): string => {
  if (item == null) return "";
  if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
    return String(item);
  }
  if (typeof item === "object") {
    const value = item as { label?: unknown; value?: unknown };
    if (typeof value.label === "string" && value.label.length > 0) return value.label;
    if (value.value != null) return String(value.value);
  }
  return "";
};

const ViewComponent = ({ value }: { value: unknown }) => {
  if (value == null) return null;

  const values = Array.isArray(value) ? value : [value];
  const labels = values.map(getItemLabel).filter(Boolean);
  if (!labels.length) return null;

  const primaryLabel = labels[0];
  const extraValuesCount = labels.length - 1;

  return (
    <span className="flex items-center gap-x-1.5">
      <span className="truncate">{primaryLabel}</span>
      {extraValuesCount > 0 && (
        <span className="text-muted-foreground text-xs">
          +{extraValuesCount}
        </span>
      )}
    </span>
  );
};

export { ViewComponent };
