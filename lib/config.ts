/**
 * Functions to parse, normalize and validate the configuration file.
 * 
 * Look at the `lib/utils/config.ts` file to understand how the config is
 * retrieved, saved and updated in the DB.
 */

import YAML from "yaml";
import { getFileExtension, extensionCategories } from "@/lib/utils/file";
import { ConfigSchema } from "@/lib/configSchema";
import { z } from "zod";
import { fieldTypes } from "@/fields/registry";
import { deepMergeObjects } from "@/lib/helpers";

const configVersion = "2.1";

// Parse the config file (YAML to JSON)
const parseConfig = (content: string) => {
  const document = YAML.parseDocument(content, { strict: false, prettyErrors: false });

  let errors = document.errors.map(error => {
    return {
      severity: "error",
      from: error.pos ? error.pos[0] : null,
      to: error.pos ? error.pos[1] : null,
      message: error.message, // TODO: refine error messages
      yaml: error,
    };
  });
  
  return { document, errors };
};

// Creates a map of blocks definitions by name
const mapBlocks = (configObject: any): Record<string, any> => {
  const blocksMap: Record<string, any> = {};
  if (configObject?.blocks && Array.isArray(configObject.blocks)) {
    configObject.blocks.forEach((block: any) => {
      if (block?.name) {
        // TODO: add validation for block definition (extend to all config in normalizeConfig)
        blocksMap[block.name] = block;
      }
    });
  }
  // TODO: extend to support content level blocks
  return blocksMap;
}

// Normalize the config object (e.g. convert media.input to a relative path, set
// default values for filename, extension, format, etc.)
const normalizeConfig = (configObject: any) => {
  if (!configObject) return {};

  const configObjectCopy = JSON.parse(JSON.stringify(configObject));
  
  const blocksMap = mapBlocks(configObjectCopy);
  
  // Resolve blocks within the main blocks definition
  if (configObjectCopy.blocks && Array.isArray(configObjectCopy.blocks)) {
    configObjectCopy.blocks = configObjectCopy.blocks.map((block: any) => {
      if (block?.fields && Array.isArray(block.fields)) {
        // Resolve this block's fields using the initial map
        block.fields = resolveBlocks(block.fields, blocksMap);
      }
      return block;
    });
  }

  if (configObjectCopy?.media) {
    if (typeof configObjectCopy.media === "string") {
      // Ensure media.input is a relative path (and add name and label)
      const relativePath = configObjectCopy.media.replace(/^\/|\/$/g, "");
      configObjectCopy.media = [{
        name: "default",
        label: "Media",
        input: relativePath,
        output: `/${relativePath}`,
      }];
    } else if (typeof configObjectCopy.media === "object" && !Array.isArray(configObjectCopy.media)) {
      // Ensure it's an array of media configurations (and add name and label)
      configObjectCopy.media = [{
        name: "default",
        label: "Media",
        ...configObjectCopy.media
      }];
    }

    // We normalize each media configuration
    configObjectCopy.media = configObjectCopy.media.map((mediaConfig: any) => {
      if (mediaConfig.input != null && typeof mediaConfig.input === "string") {
        // Make sure input is relative
        mediaConfig.input = mediaConfig.input.replace(/^\/|\/$/g, "");
      }
      if (mediaConfig.output != null && mediaConfig.output !== "/" && typeof mediaConfig.output === "string") {
        // Make sure output doesn"t have a trailing slash
        mediaConfig.output = mediaConfig.output.replace(/\/$/, "");
      }
      if (mediaConfig.categories != null) {
        if (mediaConfig.extensions != null) {
          delete mediaConfig.categories;
        } else if (Array.isArray(mediaConfig.categories)) {
          mediaConfig.extensions = [];
          mediaConfig.categories.map((category: string) => {
            if (extensionCategories[category] != null) {
              mediaConfig.extensions = mediaConfig.extensions.concat(extensionCategories[category]);
            }
          });
          delete mediaConfig.categories;
        }
      }

      return mediaConfig;
    });
  }

  if (configObjectCopy.content && Array.isArray(configObjectCopy?.content) && configObjectCopy.content.length > 0) {
    configObjectCopy.content = configObjectCopy.content.map((item: any) => {
      if (item.path != null) {
        item.path = item.path.replace(/^\/|\/$/g, "");
      }
      if (item.filename == null && item.type === "collection") {
        item.filename = "{year}-{month}-{day}-{primary}.md";
      }
      if (item.extension == null) {
        const filename = item.type === "file" ? item.path : item.filename;
        item.extension = getFileExtension(filename);
      }
      if (item.format == null) {
        item.format = "raw";
        const codeExtensions = ["yaml", "yml", "javascript", "js", "jsx", "typescript", "ts", "tsx", "json", "html", "htm", "markdown", "md", "mdx"];
        if (item.fields?.length > 0) {
          switch (item.extension) {
            case "json":
              item.format = "json";
              break;
            case "toml":
              item.format = "toml";
              break;
            case "yaml":
            case "yml":
              item.format = "yaml";
              break;
            default:
              // TODO: should we default to this or only consider "markdown", "md", "mdx" and "html"
              // This may catch things like csv or xml for example, which is acceptable IMO (e.g. sitemap.xml)
              item.format = "yaml-frontmatter";
              break;
          }
        } else if (codeExtensions.includes(item.extension)) {
          item.format = "code";
        } else if (item.extension === "csv") {
          item.format = "datagrid";
        }
      }
      
      // Process content fields to resolve block references
      if (Array.isArray(item.fields)) {
        item.fields = resolveBlocks(item.fields, blocksMap);
      }
      
      return item;
    });
  }

  return configObjectCopy;
}

// Helper function to resolve block references in field types
function resolveBlocks(fields: any[], blocksMap: Record<string, any>): any[] {
  return fields.map(field => {
    const result = JSON.parse(JSON.stringify(field));
    const originalFieldType = field.type;

    // We leave mixed types for runtime processing
    if (
      originalFieldType
      && typeof originalFieldType === 'string'
      && !fieldTypes.has(originalFieldType) // Protect field types
      && blocksMap[originalFieldType]
    ) {
      // Deep merge block properties into resulting field
      const block = JSON.parse(JSON.stringify(blocksMap[originalFieldType]));
      deepMergeObjects(result, block);

      // Set type to block type if it exists
      if (block.type) {
        result.type = block.type;
      } else {
        console.error("Block has no type", originalFieldType);
        result.type = 'text';
      }
    } else if (
      originalFieldType
      && typeof originalFieldType === 'string'
      && fieldTypes.has(originalFieldType)
      && blocksMap[originalFieldType]
    ) {
      console.error(`Block definition ignored for "${originalFieldType}" because it conflicts with a field type name.`);
    }

    // Process nested fields recursively
    if (Array.isArray(result.fields)) {
      result.fields = resolveBlocks(result.fields, blocksMap);
    }

    return result;
  });
}

// Check if the config is valid with the the Zoc schema (lib/configSchema.ts).
// This is used in the settings editor.
const validateConfig = (document: YAML.Document.Parsed) => {
  const content = document.toJSON();
  let errors: any[] = [];

  try {
    ConfigSchema.parse(content);
  } catch (zodError: any) {
    if (zodError instanceof z.ZodError) {
      zodError.errors.forEach(error => {
        processZodError(error, document, errors);    
      });
    }
  }
  
  return errors;
};

// Process the Zod errors from the validateConfig function. Helps us display errors
// in the settings editor.
const processZodError = (error: any, document: YAML.Document.Parsed, errors: any[]) => {
  let path = error.path;
  let yamlNode: any = document.getIn(path, true);
  let range = [0, 0];

  switch (error.code) {
    case "invalid_union":
      let invalidUnionCount = 0;
      let invalidUnionMessage = "";
      error.unionErrors.forEach((unionError: any) => {
        unionError.issues.forEach((issue: any) => {
          if (issue.path.length === error.path.length) {
            invalidUnionCount++;
            invalidUnionMessage = issue.message;
          } else {
            processZodError(issue, document, errors);
          }
        });
      });
      if (invalidUnionCount === error.unionErrors.length) {
        // If all entries in the union were invalid types, assume none of the schemas could validate the type.
        yamlNode = document.getIn(error.path, true);
        if (!yamlNode || yamlNode?.range == null) {
          yamlNode = document.getIn(error.path.slice(0, -1), true);
        }
        range = yamlNode && yamlNode.range ? yamlNode.range : [0, 0];
        errors.push({
          code: error.code,
          severity: "error",
          from: range[0] || null,
          to: range[1] || null,
          message: invalidUnionMessage,
        });
      }
      break;

    case "unrecognized_keys":
      error.keys.forEach((key: string) => {
        const parentNode = yamlNode && yamlNode.items && yamlNode.items.find((item: any) => item.key.value === key);
        if (parentNode) {
          // TODO: investigate why/when parentNode isn't defined, we may want to leave to YAML parser error
          errors.push({
            severity: "warning",
            from: parentNode.key.range[0] || null,
            to: parentNode.key.range[1] || null,
            message: `Property '${parentNode.key.value}' isn't valid and will be ignored.`,
          });
        }
      });
      break;

    default:
      if (yamlNode?.range == null) {
        path = error.path.slice(0, -1);
        yamlNode = document.getIn(path, true);
      }
      range = yamlNode && yamlNode.range ? yamlNode.range : [0, 0];
      errors.push({
        code: error.code,
        severity: "error",
        from: range[0] || null,
        to: range[1] || null,
        message: error.message,
      });
      break;
  }
};

// Parse the config file and validate it (used in the settings editor).
const parseAndValidateConfig = (content: string) => {
  const { document, errors: parseErrors } = parseConfig(content);
  const validationErrors = validateConfig(document);
  return { document, parseErrors, validationErrors };
};

export { configVersion, parseConfig, normalizeConfig, validateConfig, parseAndValidateConfig, mapBlocks, deepMergeObjects };