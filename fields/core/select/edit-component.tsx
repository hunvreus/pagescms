"use client";

import { useMemo } from "react";
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

type Option = {
  value: string;
  label: string;
};

const normalizeOption = (option: any): Option => {
  if (typeof option === "object" && option !== null) {
    const value = option.value ?? option.name;
    return {
      value: String(value ?? ""),
      label: String(option.label ?? value ?? ""),
    };
  }

  return { value: String(option), label: String(option) };
};

const EditComponent = (props: any) => {
  const { value, field, onChange } = props;
  const isReadonly = Boolean(field?.readonly);
  const multiple = Boolean(field.options?.multiple);
  const storeAsObject =
    field?.type === "reference" && field.options?.store === "object";
  const anchor = useComboboxAnchor();

  const options = useMemo(
    () =>
      Array.isArray(field.options?.values)
        ? field.options.values.map(normalizeOption)
        : [],
    [field.options?.values],
  );

  const selectedValue = useMemo(() => {
    if (multiple) {
      const values = Array.isArray(value) ? value : [];
      return values.map((item) => {
        const option =
          typeof item === "object" && item !== null
            ? normalizeOption(item)
            : null;
        const optionValue = option?.value ?? String(item);
        return (
          options.find((candidate: Option) => candidate.value === optionValue) ??
          option ??
          normalizeOption(item)
        );
      });
    }

    if (value === null || value === undefined || value === "") {
      return null;
    }

    const option =
      typeof value === "object" && value !== null
        ? normalizeOption(value)
        : null;
    const optionValue = option?.value ?? String(value);
    return (
      options.find((candidate: Option) => candidate.value === optionValue) ??
      option ??
      normalizeOption(value)
    );
  }, [multiple, options, value]);

  const handleValueChange = (nextValue: Option[] | Option | null) => {
    if (isReadonly) return;
    const toOutput = (option: Option) =>
      storeAsObject ? option : option.value;

    if (multiple) {
      onChange(Array.isArray(nextValue) ? nextValue.map(toOutput) : []);
      return;
    }

    onChange(nextValue ? toOutput(nextValue as Option) : null);
  };

  return (
    <Combobox
      items={options}
      multiple={multiple}
      value={selectedValue as any}
      onValueChange={handleValueChange as any}
      readOnly={isReadonly}
      isItemEqualToValue={(item, selected) => item.value === selected?.value}
      autoHighlight
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
                    <ComboboxChip key={option.value} showRemove={!isReadonly}>
                      {option.label}
                    </ComboboxChip>
                  ))}
                  <ComboboxChipsInput
                    placeholder={field.options?.placeholder || "Select..."}
                    readOnly={isReadonly}
                    className={cn(isReadonly && "cursor-default")}
                  />
                </>
              )}
            </ComboboxValue>
          </ComboboxChips>
          <ComboboxContent anchor={anchor}>
            <ComboboxEmpty>No options found.</ComboboxEmpty>
            <ComboboxList>
              {(option: Option) => (
                <ComboboxItem key={option.value} value={option}>
                  {option.label}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </>
      ) : (
        <>
          <ComboboxInput
            placeholder={field.options?.placeholder || "Select..."}
            className={cn(isReadonly && "has-[[data-slot=input-group-control]:focus-visible]:border-input has-[[data-slot=input-group-control]:focus-visible]:ring-0")}
            showTrigger={!isReadonly}
            readOnly={isReadonly}
          />
          <ComboboxContent>
            <ComboboxEmpty>No options found.</ComboboxEmpty>
            <ComboboxList>
              {(option: Option) => (
                <ComboboxItem key={option.value} value={option}>
                  {option.label}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </>
      )}
    </Combobox>
  );
};

export { EditComponent };
