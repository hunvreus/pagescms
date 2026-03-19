import { z } from "zod";
import { Field } from "@/types/field";
import { EditComponent } from "./edit-component";
import { ViewComponent } from "./view-component";

const schema = (field: Field) => {
  const min = typeof field.options?.min === "number" ? field.options.min : undefined;
  const max = typeof field.options?.max === "number" ? field.options.max : undefined;

  const singleValueSchema = z.preprocess(
    (val) => {
      if (val == null || val === "") return "";
      if (typeof val === "object" && val !== null && "value" in val) {
        return String((val as { value: unknown }).value ?? "");
      }
      return String(val);
    },
    z.string(),
  );

  if (field.options?.multiple) {
    let zodSchema = z.array(singleValueSchema.refine((value) => value.length > 0, {
      message: "Invalid reference",
    }));
    if (field.required) zodSchema = zodSchema.min(1, "This field is required");
    if (min !== undefined) zodSchema = zodSchema.min(min, `Select at least ${min} reference${min === 1 ? "" : "s"}`);
    if (max !== undefined) zodSchema = zodSchema.max(max, `Select at most ${max} reference${max === 1 ? "" : "s"}`);

    return z.preprocess(
      (val) => {
        if (val === "" || val === null || val === undefined) return [];
        return Array.isArray(val) ? val : [val];
      },
      zodSchema
    );
  }

  return z.preprocess(
    (val) => (val === null || val === undefined ? "" : val),
    field.required
      ? singleValueSchema.refine((value) => value.length > 0, { message: "This field is required" })
      : z.union([z.literal(""), singleValueSchema]).optional()
  );
};

const label = "Reference";

export { label, schema, EditComponent, ViewComponent };
