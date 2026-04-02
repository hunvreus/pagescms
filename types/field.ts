export type PreviewBind =
  | "text"
  | "html"
  | "value"
  | "src"
  | "href"
  | "checked"
  | "content";

export type PreviewTextTransform = "uppercase" | "lowercase" | "capitalize";

export type PreviewTransform =
  | { join: string }
  | { date: string }
  | { text: PreviewTextTransform }
  | { fallback: string }
  | { prefix: string }
  | { suffix: string };

export type PreviewRule = {
  target: string;
  bind: PreviewBind;
  transform?: PreviewTransform[];
};

export type Field = {
  name: string;
  label?: string | false;
  description?: string | null;
  type: string;
  default?: any;
  list?: boolean | { min?: number; max?: number; default?: any; collapsible?: boolean | { collapsed?: boolean; summary?: string } };
  collapsible?: boolean | { collapsed?: boolean; summary?: string };
  hidden?: boolean | null;
  readonly?: boolean | null;
  required?: boolean | null;
  pattern?: string | { regex: string; message?: string };
  options?: Record<string, unknown> | null;
  fields?: Field[];
  blocks?: Field[];
  blockKey?: string;
  preview?: PreviewRule | PreviewRule[];
};
