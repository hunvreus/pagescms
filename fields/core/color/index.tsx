import { z } from "zod";
import { Field } from "@/types/field";
import { EditComponent } from "./edit-component";
import { ViewComponent } from "./view-component";

const HEX = /^#[0-9a-fA-F]{6}$/;
const HEX_ALPHA = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

const schema = (field: Field, configObject?: Record<string, any>) => {
  const pattern = field.options?.alpha ? HEX_ALPHA : HEX;
  const message = field.options?.alpha
    ? "Invalid color, expected #RRGGBB or #RRGGBBAA"
    : "Invalid color, expected #RRGGBB";
  const zodSchema = z.string().regex(pattern, message);

  return z.literal("").refine(() => !field.required, { message: "This field is required" }).or(zodSchema);
};

const defaultValue = "";

const label = "Color";

export { label, schema, defaultValue, EditComponent, ViewComponent };
