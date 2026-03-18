import { z } from "zod";
import { Field } from "@/types/field";
import { EditComponent } from "./edit-component";

const schema = (field: Field) => {
  const normalizedValues = Array.isArray(field.options?.values)
    ? field.options.values.map((item) => (
        typeof item === "object"
          ? String(item.value ?? item.name ?? "")
          : String(item)
      ))
    : [];

  const optionSchema = z.string().refine(
    (value) => normalizedValues.includes(value),
    { message: normalizedValues.length === 0 ? "This select field requires options.values" : "Invalid option" }
  );

  if (field.options?.multiple) {
    let zodSchema = z.array(optionSchema);

    if (field.required) zodSchema = zodSchema.min(1, "This field is required");

    return z.preprocess(
      (val) => {
        if (val === "" || val === null) return [];
        return Array.isArray(val) ? val.map(String) : val;
      },
      zodSchema
    );
  }

  return field.required
    ? optionSchema
    : z.union([z.literal(""), optionSchema]).optional().nullable();
};

const label = "Select";

export { label, schema, EditComponent };
