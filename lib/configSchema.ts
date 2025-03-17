/**
 * The Zod schema for the configuration file. Used in the settings editor.
 * 
 * Look at the `lib/config.ts` file to understand how we use this schema.
 */

import { z } from "zod";

// Media configuration object schema (for single object)
const MediaConfigObject = z.object({
  input: z.string({
    message: "'input' is required."
  }).regex(/^[^/].*[^/]$|^$/, {
    message: "'input' must be a valid relative path (no leading or trailing slash)."
  }),
  output: z.string({
    message: "'output' is required."
  }).regex(/^(\/?[^/].*[^/]$|^\/?$)/, {
    message: "'output' must be a valid path with no trailing slash."
  }),
  path: z.string().regex(/^[^/].*[^/]$|^$/, {
    message: "'path' must be a valid relative path (no leading or trailing slash)."
  }).optional(),
  extensions: z.array(z.string({
    message: "Entries in the 'extensions' array must be strings."
  }), {
    message: "'extensions' must be an array of strings."
  }).optional(),
  categories: z.array(z.enum(["image", "document", "video", "audio", "compressed", "code", "font", "spreadsheet"], {
    message: "Entries in the 'categories' array must be 'image', 'document', 'video', 'audio', 'compressed', 'code', 'font', or 'spreadsheet'."
  }), {
    message: "'categories' must be an array of strings."
  }).optional(),
  name: z.string().optional(),
  label: z.string().optional(),
}).strict();

// Named media configuration schema (for array entries)
const NamedMediaConfig = MediaConfigObject.extend({
  name: z.string({
    required_error: "'name' is required for media configurations in array format.",
    invalid_type_error: "'name' must be a string.",
  }),
});

// Media schema
const MediaSchema = z.union([
  z.string().regex(/^[^/].*[^/]$|^$/, {
    message: "'media' must be a valid relative path (no leading or trailing slash)."
  }),
  MediaConfigObject,
  z.array(NamedMediaConfig, {
    message: "'media' must be a string, an object, or an array of named media configurations."
  })
]);

// Content entry fields schema
const FieldObjectSchema: z.ZodType<any> = z.lazy(() => z.object({
  name: z.string({
    required_error: "'name' is required.",
    invalid_type_error: "'name' must be a string.",
  }).regex(/^[a-zA-Z0-9-_]+$/, {
    message: "'name' must be alphanumeric with dashes and underscores.",
  }),
  label: z.union([
    z.literal(false),
    z.string({
      message: "'label' must be a string or 'false'."
    })
  ]).optional(),
  description: z.string().optional().nullable(),
  type: z.enum([
    "boolean", "code", "date", "file", "image", "number", "object", "rich-text",
    "select", "string", "text", "uuid"
  ], {
    message: "'type' is required and must be set to a valid field type (see documentation)."
  }),
  default: z.any().nullable().optional(),
  list: z.union([
    z.boolean(),
    z.object({
      min: z.number().min(0, "'min' must be a positive integer (minimum 0).").optional(),
      max: z.number().min(1, "'max' must be a positive integer (minimum 1).").optional(),
    }, {
      message: "'list' must be either a boolean or an object with 'min' and 'max' properties."
    }).strict()
  ]).optional(),
  hidden: z.boolean({
    message: "'hidden' must be a boolean."
  }).optional().nullable(),
  required: z.boolean({
    message: "'required' must be a boolean."
  }).optional().nullable(),
  pattern: z.union([
    z.string({
      message: "'pattern' must be a valid regex string."
    }),
    z.object({
      regex: z.string({
        required_error: "'regex' is required.",
        invalid_type_error: "'regex' must be a valid regex string."
      }),
      message: z.string({
        message: "'message' must be a string."
      }).optional(),
    }, {
      message: "'pattern' must be a string (regex) or an object with 'regex' and optionally 'message' properties."
    }).strict()
  ]).optional(),
  options: z.object({}).optional().nullable(),
  fields: z.array(z.lazy(() => FieldObjectSchema)).optional(),
}).strict());

// Content entry schema
const ContentObjectSchema = z.object({
  name: z.string({
    required_error: "'name' is required.",
    invalid_type_error: "'name' must be a string.",
  }).regex(/^[a-zA-Z0-9-_]+$/, {
    message: "'name' must be alphanumeric with dashes and underscores.",
  }),
  label: z.string().optional(),
  description: z.string().optional().nullable(),
  icon: z.string().optional(),
  type: z.enum(["collection", "file"], {
    required_error: "'type' is required.",
    message:  "'type' must be either 'collection' or 'file'."
  }),
  path: z.string({
    required_error: "'path' is required.",
    invalid_type_error: "'path' must be a string.",
  }).regex(/^[^/].*[^/]$|^$/, {
    message: "'path' must be a valid relative path (no leading or trailing slash)."
  }),
  filename: z.string({
    message: "'filename' must be a string."
  }).optional().nullable(),
  exclude: z.array(z.string({
    message: "Entries in the 'exclude' array must be strings."
  }), {
    message: "'exclude' must be an array of strings."
  }).optional(),
  view: z.object({
    fields: z.array(z.string({
      message: "Entries in the 'fields' array must be strings."
    }), {
      message: "'fields' must be an array of strings."
    }).optional(),
    primary: z.string({
      message: "'primary' must be a string."
    }).optional().nullable(),
    sort: z.array(z.string({
      message: "Entries in the 'sort' array must be strings."
    }), {
      message: "'sort' must be an array of strings."
    }).optional(),
    search: z.array(z.string({
      message: "Entries in the 'search' array must be strings."
    }), {
      message: "'search' must be an array of strings."
    }).optional(),
    default: z.object({
      search: z.string({
        message: "'search' must be a string."
      }).optional().nullable(),
      sort: z.string({
        message: "'sort' must be a string."
      }).optional().nullable(),
      order: z.enum(["asc", "desc"], {
        message:  "'order' must be either 'asc' or 'desc'."
      }).optional().nullable(),
    }, {
      message: "'default' must be an object with 'search', 'sort' and 'order' attributes."
    }).strict().optional().nullable(),
  }, {
    message: "'view' must be an object with 'fields', 'primary', 'sort', 'search' and 'default' attributes."
  }).strict().optional().nullable(),
  format: z.enum([
    "yaml-frontmatter", "json-frontmatter", "toml-frontmatter",
    "yaml", "json", "toml", "datagrid", "code", "raw"
  ], {
    message: "'format' must be 'yaml-frontmatter', 'json-frontmatter', 'tom-frontmatter', 'yaml', 'json', 'toml', 'datagrid', 'code' or 'raw'."
  }).optional().nullable(),
  delimiters: z.union([
    z.array(z.string({
      message: "Delimiters must be strings"
    })).length(2, "'delimiters' must contain exactly two string values."),
    z.string({
      message: "'delimiters' must be a string or array of 2 strings."
    })
  ]).optional(),
  subfolders: z.boolean({
    message: "'subfolders' must be a boolean."
  }).optional().nullable(),
  fields: z.array(FieldObjectSchema).optional(),
  list: z.boolean({
    message: "'list' must be a boolean."
  }).optional(),
}, {
  message: "YOP"
}).strict();

// Main schema with media and content
const ConfigSchema = z.object({
  media: MediaSchema.optional(),
  content: z.array(ContentObjectSchema, {
    message: "'content' must be an array of objects with at least one entry."
  }).optional(),
  settings: z.literal(false, {
    errorMap: () => ({ message: "'settings' must be 'false'." })
  }).optional(),
}).strict().nullable();

export { ConfigSchema };