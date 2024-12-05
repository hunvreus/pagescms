import { z } from "zod";
import { Field } from "@/types/field";
import { EditComponent } from "./edit-component";
import { ViewComponent } from "./view-component";

const defaultValue = false;

const schema = (field: Field) => {
  let zodSchema = z.coerce.boolean();

  return zodSchema;
};

export { EditComponent, ViewComponent, defaultValue, schema };