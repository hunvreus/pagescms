"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { useConfig } from "@/contexts/config-context";
import { getSchemaByName, interpolate } from "@/lib/schema";

type Option = {
  value: string;
  label: string;
};

const normalizeSelected = (input: any, options: Option[], multiple: boolean) => {
  const normalizeOne = (item: any): Option => {
    if (typeof item === "object" && item !== null) {
      const value = String(item.value ?? "");
      return options.find((option) => option.value === value) ?? {
        value,
        label: String(item.label ?? item.value ?? ""),
      };
    }

    const value = String(item ?? "");
    return options.find((option) => option.value === value) ?? { value, label: value };
  };

  if (multiple) {
    return (Array.isArray(input) ? input : []).map(normalizeOne);
  }

  if (input == null || input === "") return null;
  return normalizeOne(input);
};

const EditComponent = (props: any) => {
  const { value, field, onChange } = props;
  const { config } = useConfig();
  const anchor = useComboboxAnchor();
  const multiple = Boolean(field.options?.multiple);
  const collection = config ? getSchemaByName(config.object, field.options.collection) : null;
  const url = config && collection
    ? `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collections/${field.options.collection}`
    : null;

  const [searchTerm, setSearchTerm] = useState("");
  const [options, setOptions] = useState<Option[]>([]);

  useEffect(() => {
    if (!url || !collection) return;

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      const searchParams = new URLSearchParams({
        path: collection.path,
        type: "search",
        query: searchTerm,
        fields: field.options?.search || "name",
      });

      try {
        const response = await fetch(`${url}?${searchParams.toString()}`);
        if (!response.ok) throw new Error("Fetch failed");

        const json = await response.json();
        const contents = Array.isArray(json?.data?.contents) ? json.data.contents : [];
        if (cancelled) return;

        setOptions(contents.map((item: any) => ({
          value: String(interpolate(field.options?.value || "{path}", item, "fields")),
          label: String(interpolate(field.options?.label || "{name}", item, "fields")),
        })));
      } catch (error) {
        console.error("Error loading references:", error);
        if (!cancelled) setOptions([]);
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    url,
    collection,
    searchTerm,
    field.options?.search,
    field.options?.value,
    field.options?.label,
  ]);

  const selectedValue = useMemo(
    () => normalizeSelected(value, options, multiple),
    [value, options, multiple],
  );

  const handleValueChange = (nextValue: Option[] | Option | null) => {
    if (multiple) {
      onChange(Array.isArray(nextValue) ? nextValue.map((option) => option.value) : []);
      return;
    }

    onChange(nextValue ? (nextValue as Option).value : null);
  };

  if (!config || !collection) return null;

  return (
    <Combobox
      items={options}
      multiple={multiple}
      value={selectedValue as any}
      onValueChange={handleValueChange as any}
      onInputValueChange={setSearchTerm}
      isItemEqualToValue={(item, selected) => item.value === selected?.value}
      autoHighlight
      filter={null}
    >
      {multiple ? (
        <>
          <ComboboxChips ref={anchor}>
            <ComboboxValue>
              {(values: Option[]) => (
                <>
                  {values.map((option) => (
                    <ComboboxChip key={option.value}>{option.label}</ComboboxChip>
                  ))}
                  <ComboboxChipsInput placeholder={field.options?.placeholder || "Select..."} />
                </>
              )}
            </ComboboxValue>
          </ComboboxChips>
          <ComboboxContent anchor={anchor}>
            <ComboboxEmpty>No options found.</ComboboxEmpty>
            <ComboboxList>
              {(option: Option) => (
                <ComboboxItem key={option.value} value={option}>{option.label}</ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </>
      ) : (
        <>
          <ComboboxInput placeholder={field.options?.placeholder || "Select..."} />
          <ComboboxContent>
            <ComboboxEmpty>No options found.</ComboboxEmpty>
            <ComboboxList>
              {(option: Option) => (
                <ComboboxItem key={option.value} value={option}>{option.label}</ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </>
      )}
    </Combobox>
  );
};

export { EditComponent };
