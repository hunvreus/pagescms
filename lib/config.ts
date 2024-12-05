import YAML from "yaml";
import { getFileExtension, extensionCategories } from "@/lib/utils/file";
import { ConfigSchema } from "@/lib/configSchema";
import { z } from "zod";

const configVersion = "2.0";

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

const normalizeConfig = (configObject: any) => {
  if (!configObject) return {};

  const configObjectCopy = JSON.parse(JSON.stringify(configObject));
  
  if (configObjectCopy?.media != null) {
    if (typeof configObjectCopy.media === "string") {
      // Ensure media.input is a relative path
      const relativePath = configObjectCopy.media.replace(/^\/|\/$/g, "");
      configObjectCopy.media = {
        input: relativePath,
        output: `/${relativePath}`,
      };
    } else {
      if (configObjectCopy.media?.input != null && typeof configObjectCopy.media.input === "string") {
        // Make sure input is relative
        configObjectCopy.media.input = configObjectCopy.media.input.replace(/^\/|\/$/g, "");
      }
      if (configObjectCopy.media.output != null && configObjectCopy.media.output !== "/" && typeof configObjectCopy.media.output === "string") {
        // Make sure output doesn"t have a trailing slash
        configObjectCopy.media.output = configObjectCopy.media.output.replace(/\/$/, "");
      }
      if (configObjectCopy.media.categories != null) {
        if (configObjectCopy.media.extensions != null) {
          delete configObjectCopy.media.categories;
        } else if (Array.isArray(configObjectCopy.media.categories)) {
          configObjectCopy.media.extensions = [];
          configObjectCopy.media.categories.map((category: string) => {
            if (extensionCategories[category] != null) {
              configObjectCopy.media.extensions = configObjectCopy.media.extensions.concat(extensionCategories[category]);
            }
          });
          delete configObjectCopy.media.categories;
        }
      }
    }
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
      return item;
    });
  }

  return configObjectCopy;
}

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

const parseAndValidateConfig = (content: string) => {
  const { document, errors: parseErrors } = parseConfig(content);
  const validationErrors = validateConfig(document);
  return { document, parseErrors, validationErrors };
};

export { configVersion, parseConfig, normalizeConfig, validateConfig, parseAndValidateConfig };