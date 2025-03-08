import { z } from "zod";
import { Field } from "@/types/field";
import { EditComponent } from "./edit-component";

const schema = (field: Field) => {
  let zodSchema;
  
  if (!field.options?.creatable && field.options?.values && Array.isArray(field.options.values)) {
    const normalizedValues = field.options.values.map((item) => {
      return typeof item === "object"
        ? item.value
        : item;
    });
    zodSchema = z.enum(normalizedValues as [string, ...string[]]);
  } else {
    zodSchema = z.string();
  }

  if (!field.required) zodSchema = zodSchema.optional();
  
  return zodSchema;
};

const supportsList = true;

export { schema, EditComponent, supportsList };