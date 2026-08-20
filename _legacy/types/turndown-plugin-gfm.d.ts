declare module "joplin-turndown-plugin-gfm" {
  import { Plugin } from "turndown";

  export const gfm: Plugin;
  export const strikethrough: Plugin;
  export const tables: Plugin;
}