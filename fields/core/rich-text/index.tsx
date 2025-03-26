import { Field } from "@/types/field";
import { htmlSwapPrefix, rawToRelativeUrls } from "@/lib/githubImage";
import { EditComponent } from "./edit-component";
import { ViewComponent } from "./view-component";
import { marked } from "marked";
import TurndownService from "turndown";
import { tables, strikethrough } from "joplin-turndown-plugin-gfm";
import { getSchemaByName } from "@/lib/schema";

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

export { EditComponent, ViewComponent, read, write };