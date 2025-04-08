"use client";

import { EditComponent as SelectEditComponent } from "../select";
import { forwardRef, useMemo } from "react";
import { getSchemaByName } from "@/lib/schema";
import { useConfig } from "@/contexts/config-context";

const EditComponent = forwardRef((props: any, ref: React.Ref<HTMLInputElement>) => {
  const { value, field, onChange } = props;

  const { config } = useConfig();
  if (!config) return null;

  const collection = getSchemaByName(config.object, field.options.collection);
  if (!collection) return null;

  const fetchConfig = useMemo(() => ({
    url: `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/collections/${field.options.collection}`,
    params: {
      path: collection.path,
      type: "search",
      query: "{input}",
      fields: field.options?.search || "name"
    },
    minlength: 0,
    results: "data.contents",
    value: field.options?.value || "{path}",
    label: field.options?.label || "{name}",
    image: field.options?.image,
    headers: {},
  }), [config.owner, config.repo, config.branch, field.options]);

  return <SelectEditComponent {...props} field={{ ...field, options: { ...field.options, fetch: fetchConfig }}} ref={ref} />;
});

export { EditComponent };