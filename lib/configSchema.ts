/**
 * The Zod schema for the configuration file. Used in the settings editor.
 * 
 * Look at the `lib/config.ts` file to understand how we use this schema.
 */

import { z } from "zod";
import { fieldTypes } from "@/fields/registry";

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

// Schema for list attribute (used in both field and content entries)
const ListSchema = z.union([
  z.boolean(),
  z.object({
    min: z.number().min(0, "'min' must be a positive integer (minimum 0).").optional(),
    max: z.number().min(1, "'max' must be a positive integer (minimum 1).").optional(),
    collapsible: z.union([
      z.boolean(),
      z.object({
        collapsed: z.boolean().optional(),
        summary: z.string().optional(),
      }, {
        message: "'collapsbile' must be either a boolean or an object with 'collapsed' and 'summary' properties."
      }),
    ]),
  }, {
    message: "'list' must be either a boolean or an object with 'min' and 'max' properties."
  }).strict()
]);

// Generator for Field Object Schema (components do not have a `name` field)
const generateFieldObjectSchema = (isComponent?: boolean, isBlock?: boolean): z.ZodType<any> => {
  let baseObjectSchema = {
    label: z.union([
      z.literal(false),
      z.string({
        message: "'label' must be a string or 'false'."
      })
    ]).optional(),
    description: z.string().optional().nullable(),
    component: z.string({
      invalid_type_error: "'component' must be a string."
    }).regex(/^[a-zA-Z0-9-_]+$/, {
      message: "Component key must be alphanumeric with dashes and underscores."
    }).optional(),
    default: z.any().nullable().optional(),
    fields: z.array(
      z.lazy(() => generateFieldObjectSchema()),
      { message: "'fields' must be an array of field definitions." }
    ).optional(),
  };

  if (!isComponent) {
    baseObjectSchema = {
      ...{
        name: z.string({
          required_error: "'name' is required.",
          invalid_type_error: "'name' must be a string.",
        }).regex(/^[a-zA-Z0-9-_]+$/, {
          message: "'name' must be alphanumeric with dashes and underscores.",
        })
      },
      ...baseObjectSchema
    }
  }

  if (!isBlock) {
    baseObjectSchema = {
      ...{
        type: z.string({
          invalid_type_error: "'type' must be a string."
        }).min(1, { message: "'type' cannot be empty." })
          .refine(val => fieldTypes.has(val) || ['object', 'block'].includes(val), {
            message: "'type' must be a valid field type.",
            path: ['type']
          })
          .optional(),
        list: ListSchema.optional(),
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
        blocks: z.array(
          z.lazy(() => generateFieldObjectSchema(false, true)),
          { message: "'blocks' must be an array of field definitions." }
        ).optional(),
        blockKey: z.string({
          message: "'blockKey' must be a string."
        }).min(1, { 
           message: "'blockKey' cannot be empty."
        }).optional()
      },
      ...baseObjectSchema
    }
  }
  
  return z.lazy(() => z.object(baseObjectSchema).strict()
    .superRefine((data: any, ctx: any) => {
      if (!isBlock) {
        const hasType = data.type !== undefined;
        const hasComponent = data.component !== undefined;
        if (hasType === hasComponent) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Field must have exactly one of 'type' or 'component'.",
            path: ['type', 'component']
          });
        }
      }

      if (data.type === 'block' && data.blocks === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Fields with type 'block' must have a 'blocks' attribute.",
          path: ['blocks']
        });
      }

      if (data.type === 'object' && data.fields === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Fields with type 'object' must have a 'fields' attribute.",
          path: ['fields']
        });
      }

      if (isBlock && data.fields === undefined && data.component === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Blocks must have a 'fields' attribute or inherit one from a component.",
          path: ['fields', 'component']
        });
      }

      if (data.blockKey !== undefined && data.type !== 'block') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "'blockKey' attribute is only valid when 'type' is 'block'.",
          path: ['blockKey']
        });
      }
    })
  );
};

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
    layout: z.enum(["tree", "list"], {
      message: "'layout' must be either 'tree' or 'list'."
    }).optional(),
    node: z.union([
      z.object({
        filename: z.string({
          required_error: "'filename' is required.",
          invalid_type_error: "'filename' must be a string."
        }),
        hideDirs: z.enum(["all", "nodes", "others"], {
          message: "'hideDirs' must be one of 'nodes', 'others', or 'all'."
        }).optional()
      }, {
        message: "'node' must contain 'filename' and optionally 'hideDirs'."
      }),
      z.string({
        message: "'node' must be a string or an object with 'filename' and optionally 'hideDirs' attributes."
      }),
    ], {
      message: "'node' must be a string or an object with 'filename' and 'hideDirs'."
    }).optional(),
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
  fields: z.array(
    generateFieldObjectSchema(),
    { message: "'fields' must be an array of field definitions." }
  ).optional(),
  list: ListSchema.optional(),
}).strict();

// Main schema with media and content
const ConfigSchema = z.object({
  media: MediaSchema.optional(),
  content: z.array(ContentObjectSchema, {
    message: "'content' must be an array of objects with at least one entry."
  }).optional(),
  components: z.record(
    z.string().regex(/^[a-zA-Z0-9-_]+$/, {
      message: "Component key must be alphanumeric with dashes and underscores.",
    }),
    generateFieldObjectSchema(true)
  ).optional(),
  settings: z.union([
    z.object({
      hide: z.boolean({
        message: "'hide' must be a boolean."
      }).optional(),
      content: z.object({
        merge: z.boolean({
          message: "'merge' must be a boolean."
        }).optional(),
      }, {
        message: "'content' must be an object."
      }).optional(),
    }, {
      message: "'settings' must be an object."
    }).strict().optional(),
    z.boolean({
      message: "'settings' must be a boolean or an object."
    }),
  ]).optional(),
}).strict().nullable();

export { ConfigSchema };