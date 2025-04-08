import { z } from "zod";
import { Field } from "@/types/field";
import { EditComponent } from "./edit-component";

const defaultValue = (): string => {
  return crypto.randomUUID();
};

const schema = (field: Field, configObject?: Record<string, any>) => {
  let zodSchema = z.coerce.string().uuid();

  if (field.required) zodSchema = zodSchema.min(1, "This field is required");

  return zodSchema;
};

const label = "UUID";

export { label, EditComponent, defaultValue, schema };