export type Field = {
  name: string;
  label?: string | false;
  description?: string | null;
  type: string;
  default?: any;
  list?: boolean | { min?: number; max?: number; default?: any; collapsible?: boolean | { collapsed?: boolean; summary?: string } };
  hidden?: boolean | null;
  required?: boolean | null;
  pattern?: string | { regex: string; message?: string };
  options?: Record<string, unknown> | null;
  fields?: Field[];
  blocks?: Field[];
  blockKey?: string;
};