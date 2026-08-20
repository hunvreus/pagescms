"use client";

import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { useConfig } from "@/contexts/config-context";
import { getSchemaByName } from "@/lib/schema";
import { Field } from "@/types/field";

const normalizeValue = (item: unknown): string => {
  if (item == null) return "";
  if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
    return String(item);
  }
  if (typeof item === "object" && item !== null && "value" in item) {
    return String((item as { value?: unknown }).value ?? "");
  }
  return "";
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to load references");
  const json = await response.json();
  return Array.isArray(json?.data?.options) ? json.data.options : [];
};

type ResolvedLabel = {
  label: string;
  resolved: boolean;
};

const ViewComponent = ({ value, field }: { value: unknown; field: Field }) => {
  const { config } = useConfig();
  const collectionName = typeof field.options?.collection === "string"
    ? field.options.collection
    : null;
  const collection = config && collectionName
    ? getSchemaByName(config.object, collectionName)
    : null;
  const values = Array.isArray(value) ? value : value == null || value === "" ? [] : [value];

  const valueTemplate = typeof field.options?.value === "string"
    ? field.options.value
    : "{path}";
  const labelTemplate = typeof field.options?.label === "string"
    ? field.options.label
    : "{name}";
  const selectedValues = values.map(normalizeValue).filter(Boolean);
  const params = collection ? new URLSearchParams({
    valueTemplate,
    labelTemplate,
  }) : null;
  selectedValues.forEach((item) => params?.append("value", item));

  const { data } = useSWR(
    config && collection && selectedValues.length > 0
      ? `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/references/${collectionName}?${params?.toString()}`
      : null,
    fetcher
  );

  const labelsByValue = new Map<string, string>();
  data?.forEach((item: Record<string, unknown>) => {
    labelsByValue.set(
      String(item.value ?? ""),
      String(item.label ?? item.value ?? "")
    );
  });

  const labels: ResolvedLabel[] = values.map((item) => {
    const normalized = normalizeValue(item);
    const resolved = labelsByValue.get(normalized);
    return {
      label: resolved || normalized,
      resolved: Boolean(resolved),
    };
  }).filter(Boolean);

  if (!labels.length) return null;

  return (
    <span className="flex items-center gap-x-1.5">
      <Badge variant="secondary" className={labels[0]?.resolved === false ? "max-w-full animate-pulse" : "max-w-full"}>
        <span className="truncate">{labels[0]?.label}</span>
      </Badge>
      {labels.length > 1 && (
        <Badge
          variant="secondary"
          className={labels.slice(1).some((item) => item.resolved === false) ? "px-1 animate-pulse" : "px-1"}
        >
          +{labels.length - 1}
        </Badge>
      )}
    </span>
  );
};

export { ViewComponent };
