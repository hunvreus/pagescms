import { z } from "zod";
import { Field } from "@/types/field";
import { EditComponent } from "./edit-component";
import { ViewComponent } from "./view-component";
import { parse, format, isValid } from "date-fns";

const read = (value: any, field: Field) => {
  const inputType = field?.options?.time ? "datetime-local" : "date";
  const inputFormat = inputType === "datetime-local" ? "yyyy-MM-dd'T'HH:mm" : "yyyy-MM-dd";
  const saveFormat = field?.options?.format as string || inputFormat;

  if (!value) return "";

  const parsedDate = parse(value, saveFormat, new Date());

  if (isValid(parsedDate)) {
    return format(parsedDate, inputFormat);
  } else {
    console.warn(`Invalid date for field ${field.name}: "${value}" does not match format "${saveFormat}".`);
    return "";
  }
};

const write = (value: any, field: Field) => {
  const inputType = field?.options?.time ? "datetime-local" : "date";
  const inputFormat = inputType === "datetime-local" ? "yyyy-MM-dd'T'HH:mm" : "yyyy-MM-dd";
  const saveFormat = field?.options?.format as string || inputFormat;

  if (isValid(value)) {
    return format(value, saveFormat);
  } else {
    console.warn(`Invalid date for field ${field.name}: "${value}".`);
    return "";
  }
};

const schema = (field: Field) => {
  let zodSchema = z.coerce.date().transform((date) => new Date(date.toISOString()));
  
  if (field.options?.min) zodSchema = zodSchema.min(new Date(field.options.min as string), { message: `Minimum value is ${field.options.min}` });
  if (field.options?.max) zodSchema = zodSchema.max(new Date(field.options.max as string), { message: `Maximum value is ${field.options.max}` });

  return z.literal("").refine(() => !field.required, { message: "This field is required" }).or(zodSchema);
};

export { EditComponent, ViewComponent, schema, read, write };