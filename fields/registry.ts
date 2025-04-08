// TODO: split into separate files to improve bundling/tree-shaking?
import { Field } from "@/types/field";
import { z } from "zod";

const fieldTypes = new Set<string>();
let labels: Record<string, string> = {};
let schemas: Record<string, (field: Field, configObject?: Record<string, any>) => z.ZodTypeAny> = {};
let defaultValues: Record<string, any> = {};
let readFns: Record<string, (value: any, field: Field, configObject?: Record<string, any>) => void> = {};
let writeFns: Record<string, (value: any, field: Field, configObject?: Record<string, any>) => void> = {};
let editComponents: Record<string, React.ComponentType<any>> = {};
let viewComponents: Record<string, React.ComponentType<any>> = {};

const importCoreFieldComponents = (require as any).context('@/fields/core', true, /index\.(ts|tsx)$/);
const importCustomFieldComponents = (require as any).context('@/fields/custom', true, /index\.(ts|tsx)$/);

[importCoreFieldComponents, importCustomFieldComponents].forEach(importComponents => {
  importComponents.keys().forEach((key: string) => {
    const fieldName = key.split('/')[1];
    const fieldModule = importComponents(key);

    fieldTypes.add(fieldName);

    if (fieldModule.label) labels[fieldName] = fieldModule.label;
    if (fieldModule.schema) schemas[fieldName] = fieldModule.schema;
    if (fieldModule.defaultValue) defaultValues[fieldName] = fieldModule.defaultValue;
    if (fieldModule.read) readFns[fieldName] = fieldModule.read;
    if (fieldModule.write) writeFns[fieldName] = fieldModule.write;
    if (fieldModule.EditComponent) editComponents[fieldName] = fieldModule.EditComponent;
    if (fieldModule.ViewComponent) viewComponents[fieldName] = fieldModule.ViewComponent;
  });
});

export { labels, schemas, readFns, writeFns, defaultValues, editComponents, viewComponents, fieldTypes };