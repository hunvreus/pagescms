type ContentOperation = "create" | "rename" | "delete";
type ContentScope = "collection" | "file" | "settings";

type ContentOperations = Record<ContentOperation, boolean>;

const contentOperationDefaults: Record<ContentScope, ContentOperations> = {
  collection: {
    create: true,
    rename: true,
    delete: true,
  },
  file: {
    create: true,
    rename: false,
    delete: true,
  },
  settings: {
    create: true,
    rename: false,
    delete: false,
  },
};

const resolveContentOperations = ({
  schema,
  scope,
}: {
  schema?: Record<string, any> | null;
  scope?: ContentScope;
}): ContentOperations => {
  const resolvedScope = scope ?? (
    schema?.type === "file"
      ? "file"
      : "collection"
  );

  const defaults = contentOperationDefaults[resolvedScope];
  const configured =
    schema?.operations && typeof schema.operations === "object"
      ? schema.operations
      : {};

  return {
    create: defaults.create && configured.create !== false,
    rename: defaults.rename && configured.rename !== false,
    delete: defaults.delete && configured.delete !== false,
  };
};

const isContentOperationAllowed = (
  operation: ContentOperation,
  options: {
    schema?: Record<string, any> | null;
    scope?: ContentScope;
  },
) => resolveContentOperations(options)[operation];

export {
  contentOperationDefaults,
  isContentOperationAllowed,
  resolveContentOperations,
};
