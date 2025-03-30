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
    zodSchema = z.enum(normalizedValues as [string, ...string[]]);
  } else {
    zodSchema = z.string().nullable();
  }

  if (field.options?.multiple) {
    zodSchema = z.preprocess(
      (val) => {
        if (val === "" || val === null) return [];
        // Ensure array values are converted to strings
        return Array.isArray(val) ? val.map(String) : val;
      },
      z.array(zodSchema)
    );
  }
  
  if (!field.required) {
    zodSchema = zodSchema.nullable();
  }
  
  return zodSchema;
};

export { schema, EditComponent };