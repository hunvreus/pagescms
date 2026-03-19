"use client";

import { useMemo } from "react";
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
          options.find((candidate) => candidate.value === optionValue) ??
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
      options.find((candidate) => candidate.value === optionValue) ??
      option ??
      normalizeOption(value)
    );
  }, [multiple, options, value]);

  const handleValueChange = (nextValue: Option[] | Option | null) => {
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
      isItemEqualToValue={(item, selected) => item.value === selected?.value}
      autoHighlight
    >
      {multiple ? (
        <>
          <ComboboxChips ref={anchor}>
            <ComboboxValue>
              {(values: Option[]) => (
                <>
                  {values.map((option) => (
                    <ComboboxChip key={option.value}>
                      {option.label}
                    </ComboboxChip>
                  ))}
                  <ComboboxChipsInput
                    placeholder={field.options?.placeholder || "Select..."}
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
