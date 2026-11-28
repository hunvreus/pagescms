# Custom fields

Register fields explicitly in a browser-safe client plugin. File locations are your choice; no directories are scanned.

```ts
import type { ClientPlugin } from 'pagescms/plugins/client'
import * as definition from './color/definition'

export const colorPlugin: ClientPlugin = {
  id: 'color-fields',
  fields: {
    color: {
      definition,
      editor: () => import('./color/editor'),
      view: () => import('./color/view'),
    },
  },
}
```

Add `colorPlugin` to the client deployment's `plugins` array. The definition contains synchronous, browser-safe `label`, `schema`, `defaultValue`, `read` and `write` behavior shared by the editor and server. It must not import UI, secrets, filesystem APIs or server services. Editor/view loaders return a module with a default component export; they are not loaded to validate content.

Import `FieldDefinition`, `FieldRendererProps` and `FieldViewProps` from `pagescms/plugins/client`. Schema factories may return Zod schemas. Validation runs on the server; schema transformations run before `write`. Hooks apply recursively inside objects, blocks and lists. Unknown types report an error. Existing `component` overrides select an editor from the same registration; a component-only field also uses that registration's definition.

## Porting a version 2 field

Custom modules from version 2 require a source port.

| Version 2 export              | Version 3 location and contract                                                                                                                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`, `schema(field)`      | Properties on the registered `definition`. Use the configured field to build a synchronous schema with `safeParse`.                                                                                                                                      |
| `defaultValue`                | Named JSON value or `(field) => JsonValue` factory in the definition module. Factories run for each new scalar value; literal objects/arrays are cloned. Explicit field/list defaults take precedence.                                                   |
| `read(value, field, config)`  | Named export from `index.ts`. Server entry, collection and reference reads pass the repository configuration as the optional third argument. No credentials or request services are supplied.                                                            |
| `write(value, field, config)` | Named export from `index.ts`. Server saves run schema coercion before the hook and pass the repository configuration. Return JSON or `undefined` to omit a value.                                                                                        |
| `EditComponent`               | Move to `edit-component.tsx`, exporting a default component. Accept `FieldRendererProps`, including controlled `value`/`onChange`, `id`, `disabled`, `required`, validation attributes and optional reference context. Replace Next.js-specific imports. |
| `ViewComponent`               | Move to `view-component.tsx`, exporting a default component. Accept `{ field, value }`; use configured labels/options rather than assuming the stored value is a label.                                                                                  |

For example, behavior metadata can use a Zod schema without importing the editor:

```ts
import { z } from 'zod'
import type { FieldDefinition } from 'pagescms/plugins/client'

export const label = 'Color'
export const defaultValue = '#000000'
export const schema: FieldDefinition['schema'] = () =>
  z.string().regex(/^#[0-9a-f]{6}$/i)
```

A registration with a built-in name must explicitly set `override: true`; it overrides that built-in's editor, defaults, schema and read/write behavior. Provide the normalization and validation that the custom type needs; built-in date/number conversions do not run before its hooks. The standard list wrapper, required checks and list limits still apply. Hooks run once per list item, receiving the configured field/options and the same repository configuration.

Treat the configuration passed to `read` and `write` as read-only. It is shared and frozen, including nested values. If a hook needs to modify configuration-derived data, create its own local copy first.

`defaultValue` returns editor-ready JSON and receives the field, as in version 2. It does not receive repository configuration. Formatted built-in date values in explicit defaults are normalized recursively through object, block and list defaults, without modifying the configuration object.

The conformance cases in `src/lib/custom-field-conformance.test.ts` cover defaults, coercion ordering, built-in overrides and nested read/write context. Ported third-party editors should additionally be tested for keyboard use, read-only behavior and collection display with their own real data.
