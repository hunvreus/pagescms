---
title: Custom field API
description: The definition, editor and view contracts for custom field types.
---

A custom field is registered under a type name in two places: its **definition** in the plugin's `shared` module, and its **editor** and optional **view** in its `client` module. The build joins them by name. For a walkthrough, see [Create a custom field](/docs/extending/custom-field/).

```ts title="shared.ts"
export default (() => ({
  fields: { color: { definition } },
})) satisfies SharedPluginModule
```

```ts title="client.ts"
export default (() => ({
  fields: {
    color: {
      editor: () => import('./editor'),
      view: () => import('./view'),
    },
  },
})) satisfies ClientPluginModule
```

Import `FieldDefinition`, `FieldRendererProps` and `FieldViewProps` from `pagescms/plugins/client`.

## Definition

The definition module's named exports describe the value. It runs on both server and browser: keep it synchronous and free of UI imports, filesystem access, server services and secrets.

| Export                        | Description                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `label`                       | Name shown in the interface.                                                                                                   |
| `schema(field)`               | Returns a Zod schema for the value, built from the field's configuration. Validation runs on the server before saving.         |
| `defaultValue`                | Initial value, or `(field) => value`. A field's own `default` takes precedence.                                                |
| `read(value, field, config)`  | Converts the stored value into the editor's value when content is loaded.                                                      |
| `write(value, field, config)` | Converts the editor's value into the stored value when saving. Runs after schema coercion. Return `undefined` to omit the key. |

`read` and `write` receive the repository configuration as `config`. It's frozen: copy anything you need to modify. They run once per list item, and also inside objects and blocks.

## Editor

The editor module's default export is a React component that receives `FieldRendererProps`:

| Prop                              | Description                                                               |
| --------------------------------- | ------------------------------------------------------------------------- |
| `value`, `onChange`               | The current value, and the callback to change it. The editor never saves. |
| `id`, `errorId`                   | IDs for the input and its error message, for accessibility.               |
| `disabled`, `required`, `invalid` | Field state.                                                              |
| `field`                           | The field's configuration, including `options`.                           |
| `renderField(input)`              | Wraps your input in the standard label, description and error layout.     |

## View

The optional view module's default export renders the value in collection lists. It receives `{ field, value }`. Use the field's configured labels or options rather than assuming the stored value is presentable.

## Overriding a built-in type

To replace a built-in type, such as `date`, register under its name with `override: true`. Your definition then handles defaults, validation and read/write entirely; built-in conversions don't run first. List wrappers, `required` and list limits still apply.

## Porting a version 2 field

| Version 2                | Version 3                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `label`, `schema(field)` | Named exports of the definition module. `schema` must be synchronous.                                         |
| `defaultValue`           | Named export of the definition module.                                                                        |
| `read`, `write`          | Named exports of the definition module. They now also receive `config`.                                       |
| `EditComponent`          | Default export of a lazily loaded editor module, receiving `FieldRendererProps`. Replace any Next.js imports. |
| `ViewComponent`          | Default export of a lazily loaded view module, receiving `{ field, value }`.                                  |

Test ported fields with real data: keyboard use, read-only mode, lists and collection display. The conformance tests in `src/lib/custom-field-conformance.test.ts` show the expected behavior for defaults, coercion order, overrides and nested read/write.
