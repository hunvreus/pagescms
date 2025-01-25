import { z } from "zod";
import { Field } from "@/types/field";
import { EditComponent } from "./edit-component";
import { ViewComponent } from "./view-component";
import { parse, format, isValid, isBefore, isAfter } from "date-fns";

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

  const parsedDate = parse(value, inputFormat, new Date(0, 0));

  if (isValid(parsedDate)) {
    return format(parsedDate, saveFormat);
  } else {
    console.warn(`Invalid date for field ${field.name}: "${value}".`);
    return "";
  }
};

const schema = (field: Field) => {
  const inputType = field?.options?.time ? "datetime-local" : "date";
  const inputFormat = inputType === "datetime-local" ? "yyyy-MM-dd'T'HH:mm" : "yyyy-MM-dd";

  let zodSchema = z.string()
    .refine(val => {
      if (!val) return !field.required;
      return isValid(parse(val, inputFormat, new Date()));
    }, "Invalid date")
    .refine(val => {
      if (!val || !field.options?.min) return true;
      const date = parse(val, inputFormat, new Date());
      const minDate = parse(field.options.min as string, inputFormat, new Date());
      return isValid(minDate) && !isBefore(date, minDate);
    }, `Date must be after ${field.options?.min}`)
    .refine(val => {
      if (!val || !field.options?.max) return true;
      const date = parse(val, inputFormat, new Date());
      const maxDate = parse(field.options.max as string, inputFormat, new Date());
      return isValid(maxDate) && !isAfter(date, maxDate);
    }, `Date must be before ${field.options?.max}`);
  
  return zodSchema;
};

export { EditComponent, ViewComponent, schema, read, write };