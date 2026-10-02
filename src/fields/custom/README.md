# Custom fields

Add a directory named after the field type:

```text
src/fields/custom/color/
  index.ts              # label, schema, defaultValue, read, write
  edit-component.tsx    # default or EditComponent export
  view-component.tsx    # optional default or ViewComponent export
```

`index.ts` contains synchronous, browser-safe behavior shared by the editor and server. It must not import UI, secrets, filesystem APIs, or server services. UI modules are lazy-loaded separately. Restart development after adding a field.

Use `FieldDefinition` from `src/fields/registry.ts` for behavior, `FieldRendererProps` for editing, and `FieldViewProps` for collection display. Schema factories may return Zod schemas. Validation runs on the server; schema transformations run before `write`. Hooks apply recursively inside objects, blocks, and lists. Unknown field types show an error rather than falling back to a text input.
