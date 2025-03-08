"use client";

import { forwardRef, useMemo, useState, useCallback, useEffect } from "react";
import "./edit-component.css";
import Select, { components } from "react-select"
import CreatableSelect from 'react-select/creatable';
import AsyncSelect from 'react-select/async';
import AsyncCreatableSelect from 'react-select/async-creatable';
import { ChevronDown, X } from "lucide-react";

const DropdownIndicator = (props: any) => {
  return (
    <components.DropdownIndicator {...props}>
      <ChevronDown className="w-4 h-4"/>
    </components.DropdownIndicator>
  );
};

const ClearIndicator = (props: any) => {
  return (
    <components.ClearIndicator {...props}>
      <X className="w-4 h-4" />
    </components.ClearIndicator>
  );
};

const MultiValueRemove = (props: any) => {
  return (
    <components.MultiValueRemove {...props}>
      <X className="w-3 h-3 stroke-[2.5]" />
    </components.MultiValueRemove>
  );
};

const EditComponent = forwardRef((props: any, ref: any) => {
  const { value, field, onChange } = props;
  const [isMounted, setIsMounted] = useState(false);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Only create static options if not using fetch
  const options = useMemo(() => 
    !field.options?.fetch && field.options?.values
      ? field.options.values.map((option: any) => {
          if (typeof option === "object") {
            return { value: option.value, label: option.label };
          }
          return { value: option, label: option };
        }) 
      : [], 
    [field.options?.values, field.options?.fetch]
  );

  // Handle fetching options
  const loadOptions = useCallback(
    async (inputValue: string) => {
      if (!field.options?.fetch?.url) return [];
      
      try {
        // Process URL - either replace template or add query parameter
        let urlString = field.options.fetch.url;
        
        // Check if URL has a template pattern like {input}
        if (urlString.includes('{input}')) {
          // Replace the template with the encoded input value
          urlString = urlString.replace('{input}', encodeURIComponent(inputValue));
        } else {
          // Add query parameter to URL
          const url = new URL(urlString);
          if (inputValue) {
            url.searchParams.append(field.options.fetch.queryParam || 'q', inputValue);
          }
          urlString = url.toString();
        }
        
        const response = await fetch(urlString, {
          method: field.options.fetch.method || 'GET',
          headers: field.options.fetch.headers || {},
        });
        
        if (!response.ok) throw new Error('Failed to fetch options');
        
        const data = await response.json();
        
        // Extract options from response using the provided path
        let results = data;
        if (field.options.fetch.resultsPath) {
          const path = field.options.fetch.resultsPath.split('.');
          for (const segment of path) {
            results = results[segment];
          }
        }
        
        // Map results to option format
        return results.map((item: any) => {
          const valuePath = field.options.fetch.valuePath || 'id';
          const labelPath = field.options.fetch.labelPath || 'name';
          
          const getValue = (obj: any, path: string) => {
            const parts = path.split('.');
            return parts.reduce((o, key) => (o && o[key] !== undefined) ? o[key] : null, obj);
          };
          
          return {
            value: getValue(item, valuePath),
            label: getValue(item, labelPath),
          };
        });
      } catch (error) {
        console.error('Error loading options:', error);
        return [];
      }
    },
    [field.options?.fetch]
  );

  // Internal state to manage the react-select format
  const [selectedOptions, setSelectedOptions] = useState(() => {
    if (field.list) {
      if (!value) return [];
      
      // Handle nested array structure
      const valueToUse = Array.isArray(value[0]) ? value[0] : value;
      
      // Map each value to an option object
      return valueToUse.map((val: any) => {
        const option = options.find((opt: any) => opt.value === val);
        return option || { value: val, label: val };
      });
    } else {
      if (!value) return null;
      const option = options.find((opt: any) => opt.value === value);
      return option || { value, label: value };
    }
  });

  const handleChange = useCallback((newValue: any) => {
    setSelectedOptions(newValue);
    if (field.list) {
      const values = newValue ? newValue.map((item: any) => item.value) : [];
      onChange(values);
    } else {
      onChange(newValue ? newValue.value : null);
    }
  }, [onChange, field.list]);

  const handleInputChange = useCallback((newValue: string) => {
    setInputValue(newValue);
  }, []);

  if (!isMounted) return null;

  // Determine which Select component to use based on options
  let SelectComponent;
  if (field.options?.fetch) {
    SelectComponent = field.options?.creatable ? AsyncCreatableSelect : AsyncSelect;
  } else {
    SelectComponent = field.options?.creatable ? CreatableSelect : Select;
  }

  // Common props for all select variants
  const selectProps = {
    ref,
    isMulti: field.list,
    classNamePrefix: "react-select",
    placeholder: field.options?.placeholder || "Select...",
    components: { 
      DropdownIndicator,
      ClearIndicator,
      MultiValueRemove
    },
    value: selectedOptions,
    onChange: handleChange,
    onInputChange: handleInputChange,
    inputValue: inputValue,
  };

  // Add specific props based on component type
  if (field.options?.fetch) {
    return (
      <SelectComponent
        {...selectProps}
        loadOptions={loadOptions}
        defaultOptions={field.options.fetch.preloadOptions}
        cacheOptions={field.options.fetch.cacheOptions !== false}
      />
    );
  } else {
    return (
      <SelectComponent
        {...selectProps}
        options={options}
      />
    );
  }
});

export { EditComponent };