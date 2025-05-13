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
import { deepMergeObjects } from "@/lib/helpers";

const configVersion = "2.3";

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

// Normalize the config object (e.g. convert media.input to a relative path, set
// default values for filename, extension, format, etc.)
const normalizeConfig = (configObject: any) => {
  if (!configObject) return {};

  const configObjectCopy = JSON.parse(JSON.stringify(configObject));

  // Resolve component references in `components`
  if (configObjectCopy.components && typeof configObjectCopy.components === 'object') {
    Object.keys(configObjectCopy.components).forEach((componentKey: string) => {
      configObjectCopy.components[componentKey] = resolveComponent(configObjectCopy.components[componentKey], configObjectCopy.components);
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

  // Normalize content
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
      if (item.view?.node && typeof item.view.node === "string") {
        item.view.node = {
          filename: item.view.node,
          hideDirs: "nodes"
        };
      }
      
      // Process content fields to resolve component references
      if (Array.isArray(item.fields)) {
        item.fields = item.fields.map((field: any) => {
          return resolveComponent(field, configObjectCopy?.components);
        });
      }
      
      return item;
    });
  }

  // Normalize settings
  if (configObjectCopy.settings === false) {
    configObjectCopy.settings = { hide: true };
  }
  
  return configObjectCopy;
}

// Helper function to resolve component references in fields
function resolveComponent(field: any, componentsMap: Record<string, any>): any {
  let result = JSON.parse(JSON.stringify(field));

  if (result.component && typeof result.component === 'string') {
    const componentKey = result.component;
    const componentDef = componentsMap[componentKey];

    if (componentDef) {
      const componentCopy = JSON.parse(JSON.stringify(componentDef));
      const originalName = result.name;
      const componentType = componentCopy.type;
      delete result.component;
      result = deepMergeObjects(componentCopy, result);
      result.name = originalName;
      result.type = componentType;
    } else {
      console.error(`Component reference "${componentKey}" could not be resolved.`);
      delete result.component; // Remove the broken reference
    }
  }

  // Default to `type: object` if fields exist and type is missing
  if (Array.isArray(result.fields) && result.fields.length > 0 && result.type === undefined) {
    result.type = 'object';
  }

  // Nested fields
  if (Array.isArray(result.fields)) {
    result.fields = result.fields.map((nestedField: any) => {
      return resolveComponent(nestedField, componentsMap);
    });
  }

  // Nested blocks
  if (Array.isArray(result.blocks)) {
    result.blocks = result.blocks.map((block: any) => {
      return resolveComponent(block, componentsMap);
    });
  }

  return result;
}

// Check if the config contains unresolved component references
function containsUnresolvedComponent(data: any): boolean {
  if (Array.isArray(data)) return data.some(item => containsUnresolvedComponent(item));
  if (data && typeof data === 'object') {
    if (typeof data.component === 'string') return true; 
    if (Array.isArray(data.fields)) {
      if (containsUnresolvedComponent(data.fields)) return true;
    }
  }
  return false;
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

export { configVersion, parseConfig, normalizeConfig, validateConfig, parseAndValidateConfig };