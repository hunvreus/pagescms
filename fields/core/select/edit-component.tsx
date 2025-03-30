"use client";

import { forwardRef, useMemo, useState, useCallback, useEffect } from "react";
import "./edit-component.css";
import Select, { components } from "react-select";
import CreatableSelect from "react-select/creatable";
import AsyncSelect from "react-select/async";
import AsyncCreatableSelect from "react-select/async-creatable";
import { ChevronDown, X } from "lucide-react";
import { safeAccess, interpolate } from "@/lib/schema";

const Option = ({ children, ...props }: any) => {
  const { data } = props;
  return (
    <components.Option {...props}>
      <div className="flex items-center gap-2">
        {data.image && <img src={data.image} alt="" className="w-6 h-6 rounded-full" />}
        {children}
      </div>
    </components.Option>
  );
};

const SingleValue = ({ children, ...props }: any) => {
  const { data } = props;
  return (
    <components.SingleValue {...props}>
      <div className="flex items-center gap-2">
        {data.image && <img src={data.image} alt="" className="w-6 h-6 rounded-full" />}
        {children}
      </div>
    </components.SingleValue>
  );
};

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

type ParamValue = string | { value: 'input' } | { template: string };

type FetchConfig = {
  url: string;
  method?: string;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  results?: string;
  value?: string;
  label?: string;
  minlength?: number;
  image?: string;
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
        const searchParams = new URLSearchParams();
        
        // Handle params
        if (fetchConfig.params) {
          Object.entries(fetchConfig.params).forEach(([key, paramValue]) => {
            if (Array.isArray(paramValue)) {
              paramValue.forEach(value => {
                const interpolatedValue = interpolate(value, { input }, "fields");
                searchParams.append(key, interpolatedValue);
              });
            } else {
              const value = interpolate(paramValue, { input }, "fields");
              searchParams.append(key, value);
            }
          });
        }

        const queryString = searchParams.toString();
        const url = `${fetchConfig.url}${queryString ? `?${queryString}` : ''}`;
        
        const response = await fetch(url, {
          method: fetchConfig.method || "GET",
          headers: fetchConfig.headers || {},
        });
        if (!response.ok) throw new Error("Fetch failed");
        const data = await response.json();
        const results = fetchConfig.results ? safeAccess(data, fetchConfig.results) : data;
        if (!Array.isArray(results)) return [];
        return results.map((item: any) => ({
          value: fetchConfig.value ? 
            interpolate(fetchConfig.value, item, "fields")
            : item.id,
          label: fetchConfig.label ?
            interpolate(fetchConfig.label, item, "fields")
            : item.name,
          image: fetchConfig.image ? 
            interpolate(fetchConfig.image, item, "fields")
            : undefined,
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
      return values.map((val: any) => ({ value: val, label: val }));
    }
    if (!value) return null;
    return { value: value, label: value };
  });

  const handleChange = useCallback(
    (newValue: any) => {
      if (!field.options?.fetch) {
        setSelectedOptions(newValue);
      } else {
        const selectedValue = newValue 
          ? field.options?.multiple 
            ? newValue.map((item: any) => ({ value: item.value, label: item.value }))
            : { value: newValue.value, label: newValue.value }
          : field.options?.multiple ? [] : null;
        setSelectedOptions(selectedValue);
      }

      const output = field.options?.multiple
        ? newValue ? newValue.map((item: any) => item.value) : []
        : newValue ? newValue.value : null;
      onChange(output);
    },
    [onChange, field.options?.multiple, field.options?.fetch]
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
  
  // Determine if we should load options immediately based on minlength
  const shouldLoadInitially = fetchConfig?.minlength === undefined || fetchConfig?.minlength === 0;
  
  // Use field.options.default if defined, otherwise use our automatic behavior
  const defaultOptions = field.options?.default !== undefined 
    ? field.options.default 
    : shouldLoadInitially;

  return (
    <SelectComponent
      ref={ref}
      isMulti={field.options?.multiple}
      isClearable={true}
      classNamePrefix="react-select"
      placeholder={field.options?.placeholder || "Select..."}
      components={{ 
        DropdownIndicator, 
        ClearIndicator, 
        MultiValueRemove,
        Option,
        SingleValue,
      }}
      value={selectedOptions}
      onChange={handleChange}
      {...(fetchConfig
        ? {
            loadOptions,
            cacheOptions: field.options?.cache ?? true,
            defaultOptions: defaultOptions
          }
        : { options: staticOptions })}
    />
  );
});

export { EditComponent };