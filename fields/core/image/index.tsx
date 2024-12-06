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

const supportsList = true;

export { ViewComponent, EditComponent, read, write, supportsList };