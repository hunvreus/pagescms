import { z } from "zod";
import { Field } from "@/types/field";
import { EditComponent } from "./edit-component";

const defaultValue = (): string => {
  return crypto.randomUUID();
};

const schema = (_: Field) => {
  let zodSchema = z.coerce.string().uuid();

  return zodSchema;
};

export { EditComponent, defaultValue, schema };