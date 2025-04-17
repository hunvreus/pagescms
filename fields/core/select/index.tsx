import { z } from "zod";
import { Field } from "@/types/field";
import { EditComponent } from "./edit-component";

const schema = (field: Field) => {
  let zodSchema;
  
  if (!field.options?.creatable && !field.options?.fetch && field.options?.values && Array.isArray(field.options.values)) {
    const normalizedValues = field.options.values.map((item) => {
      return typeof item === "object"
        ? String(item.value)
        : String(item);
    });

    zodSchema = z.enum(
      normalizedValues as [string, ...string[]],
      { message: "This field is required" }
    );

    zodSchema = field.required
      ? zodSchema
      : z.union([z.literal(""), zodSchema]).optional().nullable();
  } else {
    zodSchema = z.string();
    if (field.required) zodSchema = zodSchema.min(1, "This field is required");
  }

  if (field.options?.multiple) {
    zodSchema = z.array(zodSchema);

    if (field.required) zodSchema = zodSchema.min(1, "This field is required");

    zodSchema = z.preprocess(
      (val) => {
        if (val === "" || val === null) return [];
        // Ensure array values are converted to strings
        return Array.isArray(val) ? val.map(String) : val;
      },
      zodSchema
    );
  }
  
  return zodSchema;
};

const label = "Select";

export { label, schema, EditComponent };