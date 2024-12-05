// TODO: split into separate files to improve bundling/tree-shaking?
import { Field } from "@/types/field";

let schemas: Record<string, any> = {};
let supportsList: Record<string, boolean> = {};
let readFns: Record<string, (value: any, field: Field, configObject?: Record<string, any>) => void> = {};
let writeFns: Record<string, (value: any, field: Field, configObject?: Record<string, any>) => void> = {};
let editComponents: Record<string, any> = {};
let defaultValues: Record<string, any> = {};
let viewComponents: Record<string, any> = {};

const importFieldComponents = (require as any).context('@/fields/core', true, /index\.(ts|tsx)$/);

importFieldComponents.keys().forEach((key: string) => {
  const fieldName = key.split('/')[1];
  const fieldModule = importFieldComponents(key);

  if (fieldModule.schema) schemas[fieldName] = fieldModule.schema;
  if (fieldModule.supportsList) supportsList[fieldName] = fieldModule.supportsList;
  if (fieldModule.read) readFns[fieldName] = fieldModule.read;
  if (fieldModule.write) writeFns[fieldName] = fieldModule.write;
  if (fieldModule.EditComponent) editComponents[fieldName] = fieldModule.EditComponent;
  if (fieldModule.defaultValue) defaultValues[fieldName] = fieldModule.defaultValue;
  if (fieldModule.ViewComponent) viewComponents[fieldName] = fieldModule.ViewComponent;
});

export { schemas, supportsList, readFns, writeFns, defaultValues, editComponents, viewComponents };