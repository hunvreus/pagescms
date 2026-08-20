"use client";

import { Field } from "@/types/field";
import { marked } from "marked";

const stripHtml = (text: string) =>
  text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

const collectInlineText = (tokens: unknown[]): string => {
  const parts: string[] = [];

  for (const token of tokens as Array<Record<string, unknown>>) {
    const type = token.type;
    if (typeof type !== "string") continue;

    if (type === "text" || type === "escape" || type === "codespan") {
      if (typeof token.text === "string") parts.push(token.text);
      continue;
    }

    if (type === "link" || type === "strong" || type === "em" || type === "del") {
      if (Array.isArray(token.tokens)) parts.push(collectInlineText(token.tokens));
      else if (typeof token.text === "string") parts.push(token.text);
      continue;
    }

    if (type === "image") {
      if (typeof token.text === "string" && token.text.trim()) parts.push(token.text);
      continue;
    }

    if (Array.isArray(token.tokens)) {
      parts.push(collectInlineText(token.tokens));
    }
  }

  return parts.join(" ");
};

const markdownToPlainText = (input: string): string => {
  try {
    const tokens = marked.lexer(input, { gfm: true });
    const parts: string[] = [];

    for (const token of tokens as Array<Record<string, unknown>>) {
      const type = token.type;
      if (typeof type !== "string") continue;

      if (type === "space" || type === "hr") continue;

      if (type === "code" && typeof token.text === "string") {
        parts.push(token.text);
        continue;
      }

      if (type === "html" && typeof token.raw === "string") {
        parts.push(stripHtml(token.raw));
        continue;
      }

      if (type === "table" && Array.isArray(token.header)) {
        parts.push(collectInlineText(token.header));
        if (Array.isArray(token.rows)) {
          for (const row of token.rows as unknown[]) {
            if (Array.isArray(row)) parts.push(collectInlineText(row));
          }
        }
        continue;
      }

      if (Array.isArray(token.tokens)) {
        parts.push(collectInlineText(token.tokens));
        continue;
      }

      if (typeof token.text === "string") {
        parts.push(token.text);
      } else if (typeof token.raw === "string") {
        parts.push(token.raw);
      }
    }

    return stripHtml(parts.join(" "));
  } catch {
    return stripHtml(input);
  }
};

const ViewComponent = ({
  value,
  field
}: {
  value: string,
  field: Field
}) => {
  if (!value) return null;
  void field;
  
  return Array.isArray(value)
    ? value.map(markdownToPlainText).join(", ")
    : markdownToPlainText(value);
}

export { ViewComponent };
