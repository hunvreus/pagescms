/**
 * Helper functions for the schema defined in .pages.yml
 */

import slugify from "slugify";
import { defaultValues, schemas, fieldTypes } from "@/fields/registry";
import { z } from "zod";
import { Field } from "@/types/field";
import { format } from "date-fns";
import { deepMergeObjects } from "@/lib/helpers";

// Deep map a content object to a schema
const deepMap = (
  contentObject: Record<string, any>,
  fields: Field[],
  apply: (value: any, field: Field) => any
): Record<string, any> => {
  const traverse = (data: any, schema: Field[]): any => {
    const result: any = {};

    schema.forEach(field => {
      const value = data?.[field.name];

      if (field.list) {
        if (value === undefined || !Array.isArray(value)) {
          result[field.name] = apply(undefined, field);
        } else if (field.type === "object") {
          // List of objects
          result[field.name] = value.map(item => traverse(item, field.fields || []));
        } else if (Array.isArray(field.type)) {
          // List of mixed types
          result[field.name] = value.map(item => {
              if (item && typeof item === 'object' && 'type' in item && 'value' in item && field.type.includes(item.type)) {
                const processedInnerValue = apply(item.value, { ...field, type: item.type, list: false });
                return { type: item.type, value: processedInnerValue };
              }
              return item; // Return original if malformed
            });
        } else {
          // List of simple types
          result[field.name] = value.map(item => apply(item, { ...field, list: false }));
        }
      } else if (field.type === "object") {
        // Object
        result[field.name] = value !== undefined
          ? traverse(value, field.fields || [])
          : apply(undefined, field);
      } else if (Array.isArray(field.type)) {
        // Mixed type
        if (value && typeof value === 'object' && 'type' in value && 'value' in value && field.type.includes(value.type)) {
          const processedInnerValue = apply(value.value, { ...field, type: value.type });
          result[field.name] = { type: value.type, value: processedInnerValue };
        } else {
          result[field.name] = apply(undefined, field);
        }
      } else {
        // Simple type
        result[field.name] = apply(value, field);
      }
    });
    return result;
  };
  // Guard against null/undefined input object
  return traverse(contentObject || {}, fields);
};

// Create an initial state for an entry based on the schema fields and content
const initializeState = (
  fields: Field[] | undefined,
  contentObject: Record<string, any> = {}
): Record<string, any> => {
  if (!fields) return {};
  
  return deepMap(contentObject, fields, (value, field) => {
    let appliedValue = value;
    if (value === undefined) {
      appliedValue = field.list
        ? (typeof field.list === "object" && field.list.default)
          ? field.list.default
          : undefined
        : getDefaultValue(field);
    }
    return appliedValue;
  });
};

// Get the defeault value for a field
const getDefaultValue = (field: Record<string, any>) => {
  if (field.default !== undefined) {
    return field.default;
  } else if (field.type === "object") {
    return field.fields ? initializeState(field.fields, {}) : {};
  } else {
    const fieldType = field.type as string;
    const defaultValue = defaultValues?.[fieldType];
    return defaultValue instanceof Function
      ? defaultValue()
      : defaultValue !== undefined
        ? defaultValue
        : "";
  }
};

// Generate a Zod schema for validation
// nestArrays allows us to nest arrays to work around RHF's inability to handle flat field arrays
// See https://react-hook-form.com/docs/usefieldarray#rules
const generateZodSchema = (
  fields: Field[],
  ignoreHidden: boolean = false,
  blocks: Record<string, Field> = {}
): z.ZodTypeAny => {
  const buildSchema = (currentFields: Field[], currentBlocks: Record<string, Field>): Record<string, z.ZodTypeAny> => {
    return currentFields.reduce((acc: Record<string, z.ZodTypeAny>, field) => {
      if (ignoreHidden && field.hidden) return acc;

      let fieldSchema: z.ZodTypeAny;

      if (Array.isArray(field.type)) {
        const unionOptions = field.type.map((typeName): z.ZodDiscriminatedUnionOption<"type"> | null => {
          let valueSchema: z.ZodTypeAny;
          const blockDefinition = currentBlocks[typeName];

          if (blockDefinition) {
            const actualBlockType = blockDefinition.type || 'text';
            if (Array.isArray(actualBlockType)) {
              console.warn(`Block "${typeName}" defines mixed type within mixed field "${field.name}". Validation limited.`);
              valueSchema = z.any();
            } else if (actualBlockType === 'object') {
              valueSchema = z.object(buildSchema(blockDefinition.fields || [], currentBlocks));
            } else {
              const primitiveSchemaFn = schemas?.[actualBlockType] || schemas['text'];
              valueSchema = primitiveSchemaFn({ ...blockDefinition, name: field.name, required: field.required, type: actualBlockType });
            }
          } else {
            const primitiveSchemaFn = schemas?.[typeName] || schemas['text'];
            valueSchema = primitiveSchemaFn({ ...field, type: typeName });
          }
          return z.object({ type: z.literal(typeName), value: valueSchema });
        }).filter(Boolean) as z.ZodDiscriminatedUnionOption<"type">[];

        if (unionOptions.length > 0) {
          fieldSchema = z.discriminatedUnion("type", [unionOptions[0], ...unionOptions.slice(1)]);
        } else {
          console.error(`Mixed type field "${field.name}" resulted in empty union.`);
          fieldSchema = z.any();
        }
      } else {
        const typeName = field.type;
        const blockDefinition = currentBlocks[typeName];

        if (blockDefinition) {
          const actualBlockType = blockDefinition.type || 'text';
          if (Array.isArray(actualBlockType)) {
            console.warn(`Block "${typeName}" defining mixed type used as single field type "${field.name}". Validation limited.`);
            fieldSchema = z.any();
          } else if (actualBlockType === 'object') {
            fieldSchema = z.object(buildSchema(blockDefinition.fields || [], currentBlocks));
          } else {
            const primitiveSchemaFn = schemas?.[actualBlockType] || schemas['text'];
            fieldSchema = primitiveSchemaFn({ ...blockDefinition, name: field.name, required: field.required, type: actualBlockType });
          }
        } else {
          let fieldSchemaFn = schemas?.[typeName] || schemas["text"];

          fieldSchema = typeName === "object"
              ? z.object(buildSchema(field.fields || [], currentBlocks))
              : fieldSchemaFn(field);
        }
      }

      const blockDefForListCheck = typeof field.type === 'string' ? currentBlocks?.[field.type] : undefined;
      const isAlreadyList = fieldSchema instanceof z.ZodArray || blockDefForListCheck?.list === true;

      if (field.list && fieldSchema && !isAlreadyList) {
        let listSchema = z.array(fieldSchema);
        if (typeof field.list === "object") {
          if (field.list.min !== undefined) listSchema = listSchema.min(field.list.min);
          if (field.list.max !== undefined) listSchema = listSchema.max(field.list.max);
        }
        fieldSchema = listSchema;
      } else if (field.list && !fieldSchema) {
         fieldSchema = z.array(z.any());
      }

      if (!field.required && fieldSchema && typeof fieldSchema.optional === 'function' && typeof fieldSchema.nullable === 'function') {
        fieldSchema = fieldSchema.optional().nullable();
      } else if (!field.required) {
        fieldSchema = z.any().optional().nullable();
      }

      acc[field.name] = fieldSchema;
      return acc;
    }, {});
  };

  return z.object(buildSchema(fields, blocks));
};

// Traverse the object and remove all empty/null/undefined values
const sanitizeObject = (object: any): any => {
  const isEmpty = (val: any) => val == null || val === "";

  if (Array.isArray(object)) {
    return object
      .map(val => (val && typeof val === "object" && !(val instanceof Date) ? sanitizeObject(val) : val))
      .filter(val => !isEmpty(val));
  }

  if (object && typeof object === "object" && !(object instanceof Date)) {
    const objectCopy = { ...object };

    Object.keys(objectCopy).forEach((key) => {
      const val = objectCopy[key];

      if (val && typeof val === "object" && !(val instanceof Date)) {
        objectCopy[key] = sanitizeObject(val);
      }

      if (
        (Array.isArray(objectCopy[key]) && objectCopy[key].every(isEmpty))
        || (typeof objectCopy[key] === "object" && !Array.isArray(objectCopy[key]) && !(objectCopy[key] instanceof Date) && objectCopy[key] != null && !Object.keys(objectCopy[key]).length)
        || isEmpty(objectCopy[key])
      ) {
        delete objectCopy[key];
      }
    });

    return objectCopy;
  }

  return object;
};

// Retrieve the deepest matching content schema in the config for a file
const getSchemaByPath = (config: Record<string, any>, path: string) => {
  if (!config || !config.content) return null;
  
  const normalizedPath = `/${path}/`.replace(/\/\/+/g, "/");
  
  // Sort the entries by the depth of their path, and normalize them
  const matches = config.content
    .map((item: Record<string, any>) => {
      const normalizedConfigPath = `/${item.path}/`.replace(/\/\/+/g, "/");
      return { ...item, path: normalizedConfigPath };
    })
    .filter((item: Record<string, any>)  => normalizedPath.startsWith(item.path))
    .sort((a:  Record<string, any>, b:  Record<string, any>) => b.path.length - a.path.length);
  
    // Return the first item in the sorted array which will be the deepest match, or undefined if no match.
  const schema = matches[0];

  // We deep clone the object to avoid mutating config if schema is modified.
  return schema ? JSON.parse(JSON.stringify(schema)) : null;
};

// Retrieve the matching schema for a media or content entry
const getSchemaByName = (config: Record<string, any> | null | undefined, name: string, type: string = "content") => {
  if (!config || !config.content || !name) return null;
  
  const schema = (type === "media")
    ? config.media.find((item: Record<string, any>) => item.name === name)
    : config.content.find((item: Record<string, any>) => item.name === name);

  // We deep clone the object to avoid mutating config if schema is modified.
  return schema ? JSON.parse(JSON.stringify(schema)) : null;
};

// Safely access nested properties in an object
function safeAccess(obj: Record<string, any>, path: string) {
  return path.split(".").reduce((acc, part) => {
    if (part.endsWith("]")) {
      const [arrayPath, index] = part.split("[");
      return (acc[arrayPath] || [])[parseInt(index.replace("]", ""), 10)];
    }
    return acc && acc[part];
  }, obj);
}

// Interpolate a string with a data object, with optional prefix fallback (e.g. "fields")
function interpolate(input: string, data: Record<string, any>, prefixFallback?: string): string {
  return input.replace(/(?<!\\)\{([^}]+)\}/g, (_, token) => {
    // First try direct access
    let value = safeAccess(data, token);
    
    // If value is undefined and we have a prefix fallback, try with prefix
    if (value === undefined && prefixFallback) {
      value = safeAccess(data, `${prefixFallback}.${token}`);
    }
    
    return value !== undefined ? String(value) : '';
  }).replace(/\\([{}])/g, '$1');
}

// Get a field by its path
function getFieldByPath(schema: Field[], path: string): Field | undefined {
  const [first, ...rest] = path.split('.');
  const field = schema.find(f => f.name === first);
  
  return !field ? undefined
    : rest.length === 0 ? field
    : field.type === 'object' && field.fields ? getFieldByPath(field.fields, rest.join('.'))
    : undefined;
}

// Get the primary field for a schema
const getPrimaryField = (schema: Record<string, any>) => {
  return schema?.view?.primary
    || schema?.fields?.find((item: any) => item.name === "title")
      ? "title"
      : schema.fields?.[0]?.name;
}

// Generate a filename for an entry
const generateFilename = (
  pattern: string,
  schema: Record<string, any>,
  state: Record<string, any>
) => {
  // Replace date placeholders
  const now = new Date();
  pattern = pattern.replace(/\{year\}/g, format(now, 'yyyy'))
    .replace(/\{month\}/g, format(now, 'MM'))
    .replace(/\{day\}/g, format(now, 'dd'))
    .replace(/\{hour\}/g, format(now, 'HH'))
    .replace(/\{minute\}/g, format(now, 'mm'))
    .replace(/\{second\}/g, format(now, 'ss'));

  // Replace `{primary}` with the actual name of the primary field
  const primaryField = getPrimaryField(schema);
  pattern = pattern.replace(/\{primary\}/g, primaryField ? `{fields.${primaryField}}` : "untitled");
  
  // Replace field placeholders
  return pattern.replace(/\{fields\.([^}]+)\}/g, (_, fieldName) => {
    const value = safeAccess(state, fieldName);
    return value ? slugify(String(value), { lower: true, strict: true }) : "";
  });
};

// Extract a date from a filename when possible
function getDateFromFilename(filename: string) {
  const pattern = /^(\d{4})-(\d{2})-(\d{2})-/;
  const match = filename.match(pattern);

  if (match) {
    const [ , year, month, day ] = match;
    const date = new Date(`${year}-${month}-${day}`);
    if (!isNaN(date.getTime())) {
      return { year, month, day, string: `${year}-${month}-${day}` };
    }
  }

  return undefined;
}

// Resolve blocks references in a field config
const resolveBlocks = (field: Field, blocks: Record<string, any>): Field => {
  if (
    typeof field.type !== 'string'
    || fieldTypes.has(field.type)
    || !blocks?.[field.type]
  ) {
    // Not a block reference
    return field;
  }

  const blockDefinition = blocks[field.type];
  const resolvedConfig = JSON.parse(JSON.stringify(field)); 

  // Merge block properties into the field
  deepMergeObjects(resolvedConfig, blockDefinition); 

  // Take on block's type
  resolvedConfig.type = blockDefinition.type || 'text'; 

  if (resolvedConfig.type === 'object' && blockDefinition.fields) {
    // Block is an object, make sure we inherit its fields
    resolvedConfig.fields = JSON.parse(JSON.stringify(blockDefinition.fields));
  } else if (resolvedConfig.type !== 'object') {
    // Block is not an object, make sure we have no fields
    delete resolvedConfig.fields;
  }
  
  return resolvedConfig;
}

export {
  deepMap,
  initializeState,
  getDefaultValue,
  sanitizeObject,
  getSchemaByPath,
  getSchemaByName,
  getFieldByPath,
  getPrimaryField,
  generateFilename,
  getDateFromFilename,
  generateZodSchema,
  safeAccess,
  interpolate,
  resolveBlocks
};