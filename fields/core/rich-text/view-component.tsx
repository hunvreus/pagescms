"use client";

import { Field } from "@/types/field";

const ViewComponent = ({
  value,
  field
}: {
  value: string,
  field: Field
}) => {
  return value.replace(/<\/?[^>]+(>|$)/g, " ");
}

export { ViewComponent };