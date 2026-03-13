import { z } from "zod";
import { Field } from "@/types/field";
import { EditComponent } from "./edit-component";
import { ViewComponent } from "./view-component";

const schema = (field: Field) => {
  const storeMode = field.options?.store === "object" ? "object" : "value";

  let zodSchema: z.ZodTypeAny = storeMode === "object"
    ? z.object({
        value: z.coerce.string(),
        label: z.coerce.string(),
        image: z.coerce.string().optional(),
        meta: z.unknown().optional(),
      })
    : z.coerce.string();

  if (storeMode === "object") {
    zodSchema = z.preprocess((val) => {
      if (val == null || val === "") return val;
      if (typeof val === "string") return { value: val, label: val };
      return val;
    }, zodSchema);
  }

  if (field.options?.multiple) zodSchema = z.array(zodSchema);
  
  if (!field.required) zodSchema = zodSchema.optional();
  
  return zodSchema;
};

const label = "Reference";

export { label, schema, EditComponent, ViewComponent };
