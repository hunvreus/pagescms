import { z } from "zod";
import { Field } from "@/types/field";
import { EditComponent } from "./edit-component";

const schema = (field: Field) => {
  let zodSchema = z.coerce.number();

  if (field.options?.min !== undefined) zodSchema = zodSchema.min(field.options.min as number, { message: `Minimum value is ${field.options.min}` });
  if (field.options?.max !== undefined) zodSchema = zodSchema.max(field.options.max as number, { message: `Maximum value is ${field.options.max}` });

  return z.literal("").refine(() => !field.required, { message: "This field is required" }).or(zodSchema);
};

export { schema, EditComponent };