"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader } from "lucide-react";
import { cn } from "@/lib/utils";
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

const optionsEqual = (a: Option[], b: Option[]) =>
  a.length === b.length && a.every((item, index) =>
    item.value === b[index]?.value &&
    item.label === b[index]?.label &&
    item.resolved === b[index]?.resolved
  );

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
  const isReadonly = Boolean(field?.readonly);
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

        const nextOptions = contents.map((item: any) => ({
          value: String(item.value ?? ""),
          label: String(item.label ?? item.value ?? ""),
          resolved: true,
        }));
        setOptions((previous) => optionsEqual(previous, nextOptions) ? previous : nextOptions);
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
  const selectedValuesKey = useMemo(
    () => selectedValues.join("\u0000"),
    [selectedValues],
  );

  useEffect(() => {
    if (!url || !collectionPath) return;
    const selectedValuesForRequest = selectedValuesKey
      ? selectedValuesKey.split("\u0000")
      : [];

    if (selectedValuesForRequest.length === 0) {
      setSelectedOptions([]);
      return;
    }

    let cancelled = false;

    const loadSelectedOptions = async () => {
      const searchParams = new URLSearchParams({
        valueTemplate,
        labelTemplate,
      });
      selectedValuesForRequest.forEach((selectedValue) => {
        searchParams.append("value", selectedValue);
      });

      try {
        const response = await fetch(`${url}?${searchParams.toString()}`);
        if (!response.ok) throw new Error("Fetch failed");

        const json = await response.json();
        const contents = Array.isArray(json?.data?.options) ? json.data.options : [];
        if (cancelled) return;

        const nextSelectedOptions = contents.map((item: any) => ({
          value: String(item.value ?? ""),
          label: String(item.label ?? item.value ?? ""),
          resolved: true,
        }));
        setSelectedOptions((previous) => optionsEqual(previous, nextSelectedOptions) ? previous : nextSelectedOptions);
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
    selectedValuesKey,
    valueTemplate,
    labelTemplate,
  ]);

  const mergedOptions = useMemo(() => {
    const byValue = new Map<string, Option>();
    options.forEach((option) => {
      byValue.set(option.value, option);
    });
    selectedOptions.forEach((option) => {
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
  const placeholder = isReadonly
    ? undefined
    : field.options?.placeholder || "Select...";

  const handleValueChange = (nextValue: Option[] | Option | null) => {
    if (isReadonly) return;
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
      onInputValueChange={isReadonly ? undefined : setSearchTerm}
      readOnly={isReadonly}
      isItemEqualToValue={(item, selected) => item.value === selected?.value}
      autoHighlight
      filter={null}
    >
      {multiple ? (
        <>
          <ComboboxChips
            ref={anchor}
            className={cn(
              isReadonly && "focus-within:border-input focus-within:ring-0",
            )}
          >
            <ComboboxValue>
              {(values: Option[]) => (
                <>
                  {values.map((option) => (
                    <ComboboxChip
                      key={option.value}
                      showRemove={!isReadonly}
                      className={option.resolved === false ? "animate-pulse" : undefined}
                    >
                      {option.label}
                    </ComboboxChip>
                  ))}
                  <ComboboxChipsInput
                    placeholder={placeholder}
                    readOnly={isReadonly}
                    className={cn(isReadonly && "cursor-default")}
                  />
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
            placeholder={placeholder}
            className={cn(
              singleSelected?.resolved === false && "animate-pulse",
              isReadonly && "has-[[data-slot=input-group-control]:focus-visible]:border-input has-[[data-slot=input-group-control]:focus-visible]:ring-0",
            )}
            showTrigger={!isReadonly}
            readOnly={isReadonly}
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
