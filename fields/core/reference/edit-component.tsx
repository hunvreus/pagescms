"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader } from "lucide-react";
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
import { getSchemaByName } from "@/lib/schema";

type Option = {
  value: string;
  label: string;
  resolved?: boolean;
};

const normalizeInputValues = (input: any, multiple: boolean): string[] => {
  const normalizeOne = (item: any) =>
    typeof item === "object" && item !== null
      ? String(item.value ?? "")
      : String(item ?? "");

  if (multiple) {
    return (Array.isArray(input) ? input : []).map(normalizeOne).filter(Boolean);
  }

  if (input == null || input === "") return [];
  return [normalizeOne(input)].filter(Boolean);
};

const normalizeSelected = (input: any, options: Option[], multiple: boolean) => {
  const normalizeOne = (item: any): Option => {
    if (typeof item === "object" && item !== null) {
      const value = String(item.value ?? "");
      return options.find((option) => option.value === value) ?? {
        value,
        label: String(item.label ?? item.value ?? ""),
        resolved: false,
      };
    }

    const value = String(item ?? "");
    return options.find((option) => option.value === value) ?? { value, label: value, resolved: false };
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
  const collectionName = typeof field.options?.collection === "string" ? field.options.collection : null;
  const collectionPath = config && collectionName ? getSchemaByName(config.object, collectionName)?.path || null : null;
  const url = config && collectionName
    ? `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/references/${collectionName}`
    : null;
  const searchFields = typeof field.options?.search === "string" ? field.options.search : "name";
  const valueTemplate = typeof field.options?.value === "string" ? field.options.value : "{path}";
  const labelTemplate = typeof field.options?.label === "string" ? field.options.label : "{name}";

  const [searchTerm, setSearchTerm] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<Option[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!url || !collectionPath) return;

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      if (!cancelled) setIsLoading(true);

      const searchParams = new URLSearchParams({
        query: searchTerm,
        searchFields,
        valueTemplate,
        labelTemplate,
      });

      try {
        const response = await fetch(`${url}?${searchParams.toString()}`);
        if (!response.ok) throw new Error("Fetch failed");

        const json = await response.json();
        const contents = Array.isArray(json?.data?.options) ? json.data.options : [];
        if (cancelled) return;

        setOptions(contents.map((item: any) => ({
          value: String(item.value ?? ""),
          label: String(item.label ?? item.value ?? ""),
          resolved: true,
        })));
      } catch (error) {
        console.error("Error loading references:", error);
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    url,
    collectionPath,
    searchTerm,
    searchFields,
    valueTemplate,
    labelTemplate,
  ]);

  const selectedValues = useMemo(
    () => normalizeInputValues(value, multiple),
    [value, multiple],
  );

  useEffect(() => {
    if (!url || !collectionPath) return;
    if (selectedValues.length === 0) {
      setSelectedOptions([]);
      return;
    }

    let cancelled = false;

    const loadSelectedOptions = async () => {
      const searchParams = new URLSearchParams({
        valueTemplate,
        labelTemplate,
      });
      selectedValues.forEach((selectedValue) => {
        searchParams.append("value", selectedValue);
      });

      try {
        const response = await fetch(`${url}?${searchParams.toString()}`);
        if (!response.ok) throw new Error("Fetch failed");

        const json = await response.json();
        const contents = Array.isArray(json?.data?.options) ? json.data.options : [];
        if (cancelled) return;

        setSelectedOptions(contents.map((item: any) => ({
          value: String(item.value ?? ""),
          label: String(item.label ?? item.value ?? ""),
          resolved: true,
        })));
      } catch (error) {
        console.error("Error resolving selected references:", error);
        if (!cancelled) setSelectedOptions([]);
      }
    };

    loadSelectedOptions();

    return () => {
      cancelled = true;
    };
  }, [
    url,
    collectionPath,
    selectedValues,
    valueTemplate,
    labelTemplate,
  ]);

  const mergedOptions = useMemo(() => {
    const byValue = new Map<string, Option>();
    selectedOptions.forEach((option) => {
      byValue.set(option.value, option);
    });
    options.forEach((option) => {
      byValue.set(option.value, option);
    });
    return Array.from(byValue.values());
  }, [options, selectedOptions]);

  const selectedValue = useMemo(
    () => normalizeSelected(value, mergedOptions, multiple),
    [value, mergedOptions, multiple],
  );

  const singleSelected = !multiple && selectedValue && !Array.isArray(selectedValue)
    ? selectedValue
    : null;

  const handleValueChange = (nextValue: Option[] | Option | null) => {
    if (multiple) {
      onChange(Array.isArray(nextValue) ? nextValue.map((option) => option.value) : []);
      return;
    }

    onChange(nextValue ? (nextValue as Option).value : null);
  };

  if (!config || !collectionPath) return null;

  return (
    <Combobox
      items={mergedOptions}
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
                    <ComboboxChip
                      key={option.value}
                      className={option.resolved === false ? "animate-pulse" : undefined}
                    >
                      {option.label}
                    </ComboboxChip>
                  ))}
                  <ComboboxChipsInput placeholder={field.options?.placeholder || "Select..."} />
                </>
              )}
            </ComboboxValue>
          </ComboboxChips>
          <ComboboxContent anchor={anchor}>
            {!isLoading && <ComboboxEmpty>No options found.</ComboboxEmpty>}
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-2 text-center text-sm text-muted-foreground">
                <Loader className="h-4 w-4 animate-spin" />
                Loading options...
              </div>
            )}
            <ComboboxList>
              {(option: Option) => (
                <ComboboxItem key={option.value} value={option}>{option.label}</ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </>
      ) : (
        <>
          <ComboboxInput
            placeholder={field.options?.placeholder || "Select..."}
            className={singleSelected?.resolved === false ? "animate-pulse" : undefined}
          />
          <ComboboxContent>
            {!isLoading && <ComboboxEmpty>No options found.</ComboboxEmpty>}
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-2 text-center text-sm text-muted-foreground">
                <Loader className="h-4 w-4 animate-spin" />
                Loading options...
              </div>
            )}
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
