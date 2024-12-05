import { z } from "zod";
import { ViewComponent } from "./view-component";
import { EditComponent } from "./edit-component";
import { Field } from "@/types/field";
import { swapPrefix } from "@/lib/githubImage";

const read = (value: any, field: Field, config: Record<string, any>) => {
  if (!value) return null;
  
  const prefixInput = field.options?.input ?? config.object.media?.input;
  const prefixOutput = field.options?.output ?? config.object.media?.output;

  return swapPrefix(value, prefixOutput, prefixInput, true);
};

const write = (value: any, field: Field, config: Record<string, any>) => {
  if (!value) return null;

  const prefixInput = field.options?.input ?? config.object.media?.input;
  const prefixOutput = field.options?.output ?? config.object.media?.output;

  return swapPrefix(value, prefixInput, prefixOutput);
};

// TODO: add image validation
// const schema = (field: Field) => {
//   let zodSchema = z.coerce.string();
  
//   if (field.required) zodSchema = zodSchema.min(1, "This field is required");
//   if (field.pattern) {
//     if (typeof field.pattern === "string") {
//       zodSchema = zodSchema.regex(new RegExp(field.pattern), "Invalid format");
//     } else {
//       zodSchema = zodSchema.regex(new RegExp(field.pattern.regex), field.pattern.message || "Invalid pattern format");
//     }
//   }
  
//   return zodSchema;
// };

const supportsList = true;

export { ViewComponent, EditComponent, read, write, supportsList };