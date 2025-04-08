import { Field } from "@/types/field";
import { htmlSwapPrefix, rawToRelativeUrls } from "@/lib/githubImage";
import { EditComponent } from "./edit-component";
import { ViewComponent } from "./view-component";
import { marked } from "marked";
import TurndownService from "turndown";
import { tables, strikethrough } from "joplin-turndown-plugin-gfm";
import { getSchemaByName } from "@/lib/schema";
import { z } from "zod";

const read = (value: any, field: Field, config: Record<string, any>) => {
  let html = field.options?.format === "html"
    ? value
    : value
      ? marked(value)
      : value;

  const mediaConfig = field.options?.media === false
    ? undefined
    : field.options?.media && typeof field.options.media === 'string'
      ? getSchemaByName(config.object, field.options.media, "media")
      : config.object.media[0];

  if (!mediaConfig) return html;

  return htmlSwapPrefix(html, mediaConfig.output, mediaConfig.input, true);
};

const write = (value: any, field: Field, config: Record<string, any>) => {
  let content = value || '';

  content = rawToRelativeUrls(config.owner, config.repo, config.branch, content);

  const mediaConfig = field.options?.media === false
    ? undefined
    : field.options?.media && typeof field.options.media === 'string'
      ? getSchemaByName(config.object, field.options.media, "media")
      : config.object.media[0];

  if (mediaConfig) {
    content = htmlSwapPrefix(content, mediaConfig.input, mediaConfig.output);
  }

  if (field.options?.format !== "html") {
    const turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced"
    });
    turndownService.use([tables, strikethrough]);
    turndownService.addRule("retain-html", {
      filter: (node: any, options: any) => (
        (
          node.nodeName === "IMG" && (node.getAttribute("width") || node.getAttribute("height"))
        ) ||
        (
          ["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6"].includes(node.nodeName) && (node.getAttribute("style") || node.getAttribute("class"))
        )
      ),
      replacement: (content: string, node: any, options: any) => node.outerHTML
    });

    // We need to strip <colgroup> and <col> tags otherwise turndown won't convert tables
    content = content.replace(/<colgroup>.*?<\/colgroup>/g, '');

    content = turndownService.turndown(content);
  }

  return content;
};

const schema = (field: Field, configObject?: Record<string, any>) => {
  let zodSchema = z.string();
  
  if (field.required) zodSchema = zodSchema.min(1, "This field is required");
  if (field.pattern) {
    if (typeof field.pattern === "string") {
      zodSchema = zodSchema.regex(new RegExp(field.pattern), "Invalid format");
    } else {
      zodSchema = zodSchema.regex(new RegExp(field.pattern.regex), field.pattern.message || "Invalid pattern format");
    }
  }
  if (field.options?.minlength) zodSchema = zodSchema.min(field.options.minlength as number, `Minimum length is ${field.options.minlength} characters`);
  if (field.options?.maxlength) zodSchema = zodSchema.max(field.options.maxlength as number, `Maximum length is ${field.options.maxlength} characters`);
  
  return zodSchema;
};

const label = "Rich Text";

export { label, schema, EditComponent, ViewComponent, read, write };