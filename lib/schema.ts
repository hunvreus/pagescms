/**
 * Helper functions for the schema defined in .pages.yml
 */

import slugify from "slugify";
import { defaultValues, schemas } from "@/fields/registry";
import { z } from "zod";
import { Field } from "@/types/field";
import { format } from "date-fns";

// Deep map a content object to a schema
const deepMap = (
  contentObject: Record<string, any>,
  fields: Field[],
  apply: (value: any, field: Field) => any
): Record<string, any> => {
  const traverse = (data: any, schema: Field[]): any => {
    const result: any = {};
    const currentData = data || {}; // Ensure data is an object

    schema.forEach(field => {
      const value = currentData[field.name];

      if (field.list) {
        if (value === undefined) {
          result[field.name] = apply(value, field);
        } else {
          result[field.name] = Array.isArray(value)
            ? value.map(item => {
                if (field.type === "object") {
                  return traverse(item, field.fields || []);
                } else if (field.type === "block") {
                  const blockKey = field.blockKey || "_block";
                  const blockName = item?.[blockKey];
                  const blockDef = field.blocks?.find(b => b.name === blockName);
                  if (blockDef) {
                    const innerResult = traverse(item, blockDef.fields || []);
                    // Merge discriminator back after processing inner fields
                    return { [blockKey]: blockName, ...innerResult }; 
                  }
                  return item;
                } else {
                  return apply(item, field);
                }
              })
            : [];
        }
      } else if (field.type === "object") {
        result[field.name] = traverse(value, field.fields || []);
      } else if (field.type === "block") {
        const blockKey = field.blockKey || "_block";
        const blockName = value?.[blockKey];
        const blockDef = field.blocks?.find(b => b.name === blockName);
        if (blockDef && value) {
          const innerResult = traverse(value, blockDef.fields || []);
          // Merge discriminator back after processing inner fields
          result[field.name] = { [blockKey]: blockName, ...innerResult };
        } else {
          result[field.name] = value;
        }
      } else {
        result[field.name] = apply(value, field);
      }
    });
    
    return result;
  };

  return traverse(contentObject, fields);
};

// Create an initial state for an entry based on the schema fields and content
const initializeState = (
  fields: Field[] | undefined,
  contentObject: Record<string, any> = {}
): Record<string, any> => {
  if (!fields) return {};
  
  // Ensure deepMap gets a valid object even if contentObject is null/undefined
  const sanitizedContent = contentObject || {};

  return deepMap(sanitizedContent, fields, (value, field) => {
    let appliedValue = value;
    if (value === undefined) {
      appliedValue = field.list
        ? (typeof field.list === "object" && field.list.default)
          ? field.list.default
          : undefined
        : getDefaultValue(field);
    }
    // Handle potential null values passed from traverse if the object didn't exist
    else if (appliedValue === null && field.type !== 'object' && !field.list) {
       appliedValue = getDefaultValue(field);
    }
    return appliedValue;
  });
};

// Get the default value for a field
const getDefaultValue = (field: Record<string, any>) => {
  if (field.default !== undefined) {
    return field.default;
  } else if (field.type === "object") {
    return initializeState(field.fields, {});
  } else if (field.type === "block") {
    return null;
  } else {
    const defaultValue = defaultValues?.[field.type];
    return defaultValue instanceof Function
      ? defaultValue(field)
      : defaultValue !== undefined ? defaultValue : "";
  }
};

// Generate a Zod schema for validation
const generateZodSchema = (
  fields: Field[],
  ignoreHidden: boolean = false
): z.ZodTypeAny => {
  const buildSchemaObject = (currentFields: Field[]): Record<string, z.ZodTypeAny> => {
    return currentFields.reduce((acc: Record<string, z.ZodTypeAny>, field) => {
      if (ignoreHidden && field.hidden) return acc;

      let fieldSchema: z.ZodTypeAny;

      if (field.type === 'object') {
        // Object field
        fieldSchema = z.object(buildSchemaObject(field.fields || []));
      } else if (field.type === 'block') {
        // Block field
        if (!field.blocks || field.blocks.length === 0) {
          console.warn(`Block field "${field.name}" has no 'blocks' defined. Allowing any object.`);
          fieldSchema = z.object({}).passthrough();
        } else {
          const discriminator = field.blockKey || "_block";
          const blockTypeSchemas = field.blocks.map(blockDef => {
            if (!blockDef.name) {
              console.warn(`Block definition within field "${field.name}" is missing a 'name'. Skipping.`);
              return null;
            }
            const base = z.object({
              [discriminator]: z.literal(blockDef.name) 
            });
            const blockFieldsSchema = z.object(buildSchemaObject(blockDef.fields || []));
            return base.merge(blockFieldsSchema); 
          }).filter(schema => schema !== null) as z.ZodObject<any>[];

          if (blockTypeSchemas.length === 0) {
            console.warn(`Block field "${field.name}" has no valid block definitions in 'blocks'. Allowing any object.`);
            fieldSchema = z.object({}).passthrough();
          } else if (blockTypeSchemas.length === 1) {
            fieldSchema = blockTypeSchemas[0].optional().nullable();
          } else {
            fieldSchema = z.discriminatedUnion(
              discriminator,
              blockTypeSchemas as [z.ZodObject<any>, z.ZodObject<any>, ...z.ZodObject<any>[]]
            ).optional().nullable();
          }
        }
      } else if (field.type && schemas[field.type]) {
        // Standard registered field type (e.g. text, number, ...)
        const fieldSchemaFn = schemas[field.type];
        fieldSchema = fieldSchemaFn(field);
      } else {
        console.warn(`Unknown or invalid type "${field.type}" for field "${field.name}". Defaulting to text validation.`);
        fieldSchema = schemas["text"](field);
      }

      if (field.list) {
        let arraySchema = z.array(fieldSchema);
        if (typeof field.list === "object") {
          if (field.list.min && typeof field.list.min === "number" && field.list.min > 0) {
            arraySchema = arraySchema.min(field.list.min);
          }
          if (field.list.max && typeof field.list.max === "number" && field.list.max > 0) {
            arraySchema = arraySchema.max(field.list.max);
          }
        }
        if (field.required) {
          arraySchema = arraySchema.min(1, { message: `Field requires at least one item.` });
        }
        fieldSchema = arraySchema;
      }
      
      if (!field.list) {
        if (!field.required) {
          fieldSchema = fieldSchema.optional();
        } else {
          if (field.type === 'block') {
            fieldSchema = fieldSchema.refine(
              (val) => val != null && typeof val === 'object' && Object.keys(val).length > 0,
              { message: "Please select a block." }
            );
          }
        }
      }

      acc[field.name] = fieldSchema;
      return acc;
    }, {});
  };

  return z.object(buildSchemaObject(fields));
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
  if (
    !config
    || (type === "media" && !config.media)
    || (type === "content" && !config.content)
    || !name
  ) return null;
  
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
    || (
      schema?.fields?.some((field: any) => field.name === "title")
        ? "title"
        : schema?.fields?.[0]?.name
    )
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
  interpolate
};