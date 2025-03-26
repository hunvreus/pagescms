import { z } from "zod";
import { ViewComponent } from "./view-component";
import { EditComponent } from "./edit-component";
import { Field } from "@/types/field";
import { swapPrefix } from "@/lib/githubImage";
import { getSchemaByName } from "@/lib/schema";

const read = (value: any, field: Field, config: Record<string, any>): string | string[] | null => {
  if (!value) return null;
  if (Array.isArray(value) && !value.length) return null;
  
  const mediaConfig = field.options?.media === false
    ? undefined
    : field.options?.media && typeof field.options.media === 'string'
      ? getSchemaByName(config.object, field.options.media, "media")
      : config.object.media[0];

  if (!mediaConfig) return value;

  if (Array.isArray(value)) {
    return value.map(v => read(v, field, config)) as string[];
  }

  return swapPrefix(value, mediaConfig.output, mediaConfig.input, true);
};

const write = (value: any, field: Field, config: Record<string, any>): string | string[] | null => {
  if (!value) return null;
  if (Array.isArray(value) && !value.length) return null;

  const mediaConfig = field.options?.media === false
    ? undefined
    : field.options?.media && typeof field.options.media === 'string'
      ? getSchemaByName(config.object, field.options.media, "media")
      : config.object.media[0];

  if (!mediaConfig) return value;

  if (Array.isArray(value)) {
    return value.map(v => write(v, field, config)) as string[];
  }

  return swapPrefix(value, mediaConfig.input, mediaConfig.output);
};

// TODO: add validation for media path and file extension
const schema = (field: Field) => {
  let zodSchema: z.ZodTypeAny = z.coerce.string();

  if (field.options?.multiple) zodSchema = z.array(zodSchema);
  
  if (!field.required) zodSchema = zodSchema.optional();
  
  return zodSchema;
};

export { schema, ViewComponent, EditComponent, read, write };