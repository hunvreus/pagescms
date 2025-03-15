import { z } from "zod";
import { ViewComponent } from "./view-component";
import { EditComponent } from "./edit-component";
import { Field } from "@/types/field";
import { swapPrefix } from "@/lib/githubImage";

const read = (value: any, field: Field, config: Record<string, any>): string | string[] | null => {
  if (!value) return null;
  if (Array.isArray(value) && !value.length) return null;
  
  const prefixInput = field.options?.input ?? config.object.media?.input;
  const prefixOutput = field.options?.output ?? config.object.media?.output;

  if (Array.isArray(value)) {
    return value.map(v => read(v, field, config)) as string[];
  }

  return swapPrefix(value, prefixOutput, prefixInput, true);
};

const write = (value: any, field: Field, config: Record<string, any>): string | string[] | null => {
  if (!value) return null;
  if (Array.isArray(value) && !value.length) return null;

  const prefixInput = field.options?.input ?? config.object.media?.input;
  const prefixOutput = field.options?.output ?? config.object.media?.output;

  if (Array.isArray(value)) {
    return value.map(v => write(v, field, config)) as string[];
  }

  return swapPrefix(value, prefixInput, prefixOutput);
};

const schema = (field: Field) => {
  let zodSchema: z.ZodTypeAny = z.coerce.string();

  if (field.options?.multiple) zodSchema = z.array(zodSchema);
  
  if (!field.required) zodSchema = zodSchema.optional();
  
  return zodSchema;
};


const supportsList = true;

export { schema, ViewComponent, EditComponent, read, write, supportsList };