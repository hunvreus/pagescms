"use client";

import { parse, format, isValid } from "date-fns";
import { Field } from "@/types/field";

const ViewComponent = ({
  value,
  field
}: {
  value: string,
  field: Field
}) => {
  if (!value) return null;

  const inputFormat = field.options?.time ? "yyyy-MM-dd'T'HH:mm" : "yyyy-MM-dd";
  const outputFormat = field.options?.time ? "MMM d, yyyy - HH:mm" : "MMM d, yyyy";
  const parsedDate = parse(value, inputFormat, new Date());
  
  if (!isValid(parsedDate)) {
    console.warn(`Date for field '${field.name}' is saved in the wrong format or invalid: ${value}.`);
    return null;
  }

  return <span>{format(parsedDate, outputFormat)}</span>;
}

export { ViewComponent };