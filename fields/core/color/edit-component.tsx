"use client";

import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const HEX = /^#[0-9a-fA-F]{6}$/;

const EditComponent = forwardRef((props: any, ref: React.Ref<HTMLInputElement>) => {
  const { field, value, onChange, onBlur, name } = props;
  const readonly = field?.readonly;
  const current: string = typeof value === "string" ? value : "";
  // The native picker only understands #RRGGBB: drop the alpha channel and fall back to black.
  const pickerValue = HEX.test(current.slice(0, 7)) ? current.slice(0, 7).toLowerCase() : "#000000";
  const presets: string[] = Array.isArray(field?.options?.presets)
    ? field.options.presets.filter((preset: unknown) => typeof preset === "string")
    : [];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${field?.label || field?.name || "Color"} picker`}
          value={pickerValue}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          disabled={readonly}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Input
          ref={ref}
          name={name}
          value={current}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          placeholder={field?.options?.alpha ? "#rrggbbaa" : "#rrggbb"}
          spellCheck={false}
          autoComplete="off"
          readOnly={readonly}
          className={cn("text-base font-mono", readonly && "focus-visible:border-input focus-visible:ring-0")}
        />
      </div>
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Color presets">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              title={preset}
              aria-label={preset}
              aria-pressed={current.toLowerCase() === preset.toLowerCase()}
              disabled={readonly}
              onClick={() => onChange(preset)}
              className={cn(
                "size-6 rounded-md border border-input shadow-xs transition-shadow disabled:cursor-not-allowed disabled:opacity-50",
                current.toLowerCase() === preset.toLowerCase() && "ring-2 ring-ring ring-offset-1 ring-offset-background",
              )}
              style={{ backgroundColor: preset }}
            />
          ))}
        </div>
      )}
    </div>
  );
});

EditComponent.displayName = "ColorEditComponent";

export { EditComponent };
