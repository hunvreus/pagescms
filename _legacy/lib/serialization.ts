/**
 * Handles frontmatter parsing and stringifying with support for YAML, TOML, and JSON.
 */

import YAML from "yaml";
import * as TOML from "@ltd/j-toml"

type FrontmatterFormat = "json-frontmatter" | "yaml-frontmatter" | "toml-frontmatter";
type SerialFormat = "json" | "yaml" | "toml";
type Format = FrontmatterFormat | SerialFormat;

// Parse straight YAML/JSON/TOML and YAML/JSON/TOML frontmatter strings into an object
const parse = (content: string = "", options: { delimiters?: string, format?: Format } = {}) => {
  const format = options.format || "yaml-frontmatter";
  
  // YAML/JSON/TOML without frontmatter
  if (["yaml", "json", "toml"].includes(format)) return deserialize(content, format as SerialFormat);
  
  const delimiters = setDelimiter(options.delimiters, format as FrontmatterFormat);
  const isDefaultJsonFrontmatter = (
    format === "json-frontmatter" &&
    delimiters[0] === "{" &&
    delimiters[1] === "}"
  );

  const match = isDefaultJsonFrontmatter
    ? content.match(/^(\{[\s\S]*\})\n*([\s\S]*)$/)
    : (() => {
        const startDelimiter = delimiters[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const endDelimiter = delimiters[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const frontmatterRegex = new RegExp(`^${startDelimiter}\\r?\\n([\\s\\S]*?)\\r?\\n${endDelimiter}(?:\\r?\\n([\\s\\S]*))?$`);
        return frontmatterRegex.exec(content);
      })();
  
  let contentObject;
  
  if (!match) return { body: content };

  // For json-frontmatter with default delimiters (curly braces), we need the
  // delimiters included to be a valid JSON object.
  const frontMatter = match[1];
  const body = match[2];
  
  contentObject = deserialize(frontMatter, format.split("-")[0] as SerialFormat);
  contentObject["body"] = body || "";
  contentObject["body"] = contentObject["body"].replace(/^\r?\n/, "");

  return contentObject;
};

// Deserialize a YAML/JSON/TOML string to an object
const deserialize = (content: string = "", format: SerialFormat = "yaml") => {
  if (!content.trim()) return {}; // Empty content returns an empty object

  switch (format) {
    case "yaml":
      return YAML.parse(content, { strict: false, uniqueKeys: false });
    case "json":
      return JSON.parse(content);
    case "toml":
      const tomlObject = TOML.parse(content, 1.0, "\n", false);
      return JSON.parse(JSON.stringify(tomlObject));
    default:
      return {};
  }
};

// Convert an object into straight YAML/JSON/TOML or YAML/JSON/TOML frontmatter strings
const stringify = (contentObject: Record<string, any> = {}, options: { delimiters?: string, format?: Format } = {}) => {
  const format = options.format || "yaml-frontmatter";
  
  // YAML/JSON/TOML without frontmatter
  if (["yaml", "json", "toml"].includes(format)) return serialize(contentObject, format as SerialFormat);

  // Frontmatter
  const delimiters = setDelimiter(options.delimiters, format as FrontmatterFormat);

  let contentObjectCopy = JSON.parse(JSON.stringify(contentObject));
  const body = contentObjectCopy.body || "";
  delete contentObjectCopy.body;

  let frontmatter = serialize(contentObjectCopy, format.split("-")[0] as SerialFormat);
  frontmatter = (frontmatter.trim()) ? frontmatter.trim() + "\n" : ""; // Make sure we don"t have extra newlines
  
  // For json-frontmatter with default delimiters, the serialized content already includes braces
  if (format === "json-frontmatter" && delimiters[0] === "{" && delimiters[1] === "}") {
    return `${frontmatter}${body}`;
  }
  
  return `${delimiters[0]}\n${frontmatter}${delimiters[1]}\n${body}`;
};

// Serialize an object to a YAML/JSON/TOML string
const serialize = (contentObject: Record<string, any> = {}, format: SerialFormat = "yaml") => {
  if (Object.keys(contentObject).length === 0) return ""; // Empty object returns an empty string
  switch (format) {
    case "yaml":
      return YAML.stringify(contentObject);
    case "json":
      return JSON.stringify(contentObject, null, 2);
    case "toml":
      return TOML.stringify(contentObject, { newline: "\n"});
    default:
      return "";
  }
}

// Sets the start/end delimiters for frontmatter
const setDelimiter = (delimiters: string | [string, string] | null | undefined, format: FrontmatterFormat): [string, string] => {
  if (delimiters == null) {
    switch (format) {
      case "toml-frontmatter":
        return ["+++", "+++"];
      case "json-frontmatter":
        return ["{", "}"];
      case "yaml-frontmatter":
      default:
        return ["---", "---"];
    }
  } else if (typeof delimiters === "string") {
    return [delimiters, delimiters];
  } else if (Array.isArray(delimiters)) {
    if (delimiters.length === 2 && typeof delimiters[0] === "string" && typeof delimiters[1] === "string") {
      return delimiters as [string, string];
    } else {
      throw new Error("Delimiters array must have exactly two string elements");
    }
  } else {
    throw new Error("Invalid delimiters format");
  }
};

export { parse, stringify };
