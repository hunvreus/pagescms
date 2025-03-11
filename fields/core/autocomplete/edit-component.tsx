"use client";

import { forwardRef, useMemo, useState, useCallback, useEffect } from "react";
import "./edit-component.css";
import Select, { components } from "react-select";
import CreatableSelect from "react-select/creatable";
import AsyncSelect from "react-select/async";
import AsyncCreatableSelect from "react-select/async-creatable";
import { ChevronDown, X } from "lucide-react";
import { safeAccess } from "@/lib/schema";

const DropdownIndicator = (props: any) => (
  <components.DropdownIndicator {...props}>
    <ChevronDown className="w-4 h-4" />
  </components.DropdownIndicator>
);

const ClearIndicator = (props: any) => (
  <components.ClearIndicator {...props}>
    <X className="w-4 h-4" />
  </components.ClearIndicator>
);

const MultiValueRemove = (props: any) => (
  <components.MultiValueRemove {...props}>
    <X className="w-3 h-3 stroke-[2.5]" />
  </components.MultiValueRemove>
);

type FetchConfig = {
  url: string;
  method?: string;
  query?: string;
  headers?: Record<string, string>;
  results?: string;
  value?: string;
  label?: string;
  minlength?: number;
};

const EditComponent = forwardRef((props: any, ref: any) => {
  const { value, field, onChange } = props;
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => setIsMounted(true), []);

  const staticOptions = useMemo(
    () =>
      !field.options?.fetch && field.options?.values
        ? field.options.values.map((opt: any) =>
            typeof opt === "object"
              ? { value: opt.value, label: opt.label }
              : { value: opt, label: opt }
          )
        : [],
    [field.options?.values, field.options?.fetch]
  );

  const loadOptions = useCallback(
    async (input: string) => {
      const fetchConfig = field.options?.fetch as FetchConfig;
      const minLength = fetchConfig?.minlength || 0;
      if (!fetchConfig?.url || input.length < minLength) {
        return [];
      }

      try {
        const url = new URL(fetchConfig.url);
        if (fetchConfig.query) url.searchParams.append(fetchConfig.query, input);
        const response = await fetch(url, {
          method: fetchConfig.method || "GET",
          headers: fetchConfig.headers || {},
        });
        if (!response.ok) throw new Error("Fetch failed");
        const data = await response.json();
        const results = fetchConfig.results ? safeAccess(data, fetchConfig.results) : data;
        if (!Array.isArray(results)) return [];
        return results.map((item: any) => ({
          value: fetchConfig.value ? safeAccess(item, fetchConfig.value) : item.id,
          label: fetchConfig.label ? safeAccess(item, fetchConfig.label) : item.name,
        }));
      } catch (error) {
        console.error("Error loading options:", error);
        return [];
      }
    },
    [field.options?.fetch]
  );

  const [selectedOptions, setSelectedOptions] = useState(() => {
    if (field.options?.multiple) {
      const values = Array.isArray(value) ? value : [];
      return values.map((val: any) => staticOptions.find((opt: any) => opt.value === val) || { value: val, label: val });
    }
    if (!value) return null;
    return staticOptions.find((opt: any) => opt.value === value) || { value, label: value };
  });

  const handleChange = useCallback(
    (newValue: any) => {
      setSelectedOptions(newValue);
      const output = field.options?.multiple
        ? newValue ? newValue.map((item: any) => item.value) : []
        : newValue ? newValue.value : null;
      onChange(output);
    },
    [onChange, field.options?.multiple]
  );

  if (!isMounted) return null;

  const SelectComponent = field.options?.fetch
    ? field.options?.creatable
      ? AsyncCreatableSelect
      : AsyncSelect
    : field.options?.creatable
    ? CreatableSelect
    : Select;

  const fetchConfig = field.options?.fetch as FetchConfig;
  return (
    <SelectComponent
      ref={ref}
      isMulti={field.options?.multiple}
      classNamePrefix="react-select"
      placeholder={field.options?.placeholder || "Select..."}
      components={{ DropdownIndicator, ClearIndicator, MultiValueRemove }}
      value={selectedOptions}
      onChange={handleChange}
      {...(fetchConfig
        ? {
            loadOptions,
            cacheOptions: false,
          }
        : { options: staticOptions })}
    />
  );
});

export { EditComponent };