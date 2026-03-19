"use client";

import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { useConfig } from "@/contexts/config-context";
import { getSchemaByName, interpolate } from "@/lib/schema";
import { Field } from "@/types/field";

const extractTemplateFields = (template: string) =>
  Array.from(template.matchAll(/\{([^}]+)\}/g))
    .map((match) => match[1])
    .filter((token) => token.startsWith("fields.") || token === "name" || token === "path");

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
  return Array.isArray(json?.data?.contents) ? json.data.contents : [];
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
  const fieldList = Array.from(new Set([
    ...extractTemplateFields(valueTemplate),
    ...extractTemplateFields(labelTemplate),
  ]));

  const params = collection ? new URLSearchParams({
    path: collection.path,
    type: "search",
    fields: fieldList.join(",") || "name",
  }) : null;

  const { data } = useSWR(
    config && collection
      ? `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collections/${collectionName}?${params?.toString()}`
      : null,
    fetcher
  );

  const labelsByValue = new Map<string, string>();
  data?.forEach((item: Record<string, unknown>) => {
    labelsByValue.set(
      String(interpolate(valueTemplate, item, "fields")),
      String(interpolate(labelTemplate, item, "fields"))
    );
  });

  const labels = values.map((item) => {
    const normalized = normalizeValue(item);
    return labelsByValue.get(normalized) || normalized;
  }).filter(Boolean);

  if (!labels.length) return null;

  return (
    <span className="flex items-center gap-x-1.5">
      <Badge variant="secondary" className="max-w-full">
        <span className="truncate">{labels[0]}</span>
      </Badge>
      {labels.length > 1 && (
        <Badge variant="secondary" className="px-1">
          +{labels.length - 1}
        </Badge>
      )}
    </span>
  );
};

export { ViewComponent };
