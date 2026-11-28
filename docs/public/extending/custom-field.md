---
title: Create a custom field
description: Build, register and use a new field type in a self-hosted Pages CMS instance.
---

When the built-in [field types](/docs/configuration/fields/) don't fit, add your own with a plugin. This guide builds a `color` field that stores a hex color such as `#ff6600`.

Custom fields are part of your deployment, so they need a self-hosted instance with a `pagescms.config.ts`.

## 1. Define the field

The definition describes the value: its label, default and validation. It runs in both the browser and the server, so keep it synchronous and free of UI code, secrets and server APIs.

```ts title="plugins/color/definition.ts"
import { z } from 'zod'
import type { FieldDefinition } from 'pagescms/plugins/client'

export const label = 'Color'
export const defaultValue = '#000000'
export const schema: FieldDefinition['schema'] = () =>
  z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a six-digit hex color')
```

## 2. Build the editor

The editor is a React component. It receives the current value and reports changes through `onChange`; it never saves directly. `renderField` wraps your input in the standard label, description and error layout.

```tsx title="plugins/color/editor.tsx"
import type { FieldRendererProps } from 'pagescms/plugins/client'

export default function ColorField(props: FieldRendererProps) {
  return props.renderField(
    <input
      id={props.id}
      type="color"
      value={typeof props.value === 'string' ? props.value : '#000000'}
      disabled={props.disabled}
      required={props.required}
      aria-invalid={props.invalid || undefined}
      aria-describedby={props.errorId}
      onChange={(event) => props.onChange(event.target.value)}
    />,
  )
}
```

## 3. Register the plugin

A plugin has up to three entry points. This field needs two: `shared` for the definition, used on both sides, and `client` for the lazily loaded editor.

```ts title="plugins/color/shared.ts"
import type { SharedPluginModule } from 'pagescms'
import * as definition from './definition'

export default (() => ({
  fields: { color: { definition } },
})) satisfies SharedPluginModule
```

```ts title="plugins/color/client.ts"
import type { ClientPluginModule } from 'pagescms'

export default (() => ({
  fields: { color: { editor: () => import('./editor') } },
})) satisfies ClientPluginModule
```

Add it to the `plugins` array, keeping your existing target and plugins:

```ts title="pagescms.config.ts"
import { defineConfig, definePlugin } from 'pagescms'

export default defineConfig({
  target: 'node',
  plugins: [
    definePlugin({
      id: 'color',
      shared: new URL('./plugins/color/shared.ts', import.meta.url),
      client: new URL('./plugins/color/client.ts', import.meta.url),
    }),
  ],
})
```

Restart the dev server after changing registrations, and rebuild for production. Plugins are never discovered automatically.

## 4. Use it

Add the field to a collection or file in `.pages.yml`:

```yaml
fields:
  - name: accent
    type: color
```

Check that:

- a valid color saves and reloads;
- an invalid value shows the validation message;
- `readonly: true` prevents edits;
- it works with the keyboard, and inside lists if you'll use it there.

## Next

- Transform values on read and write, or show the field in collection lists: [Custom field API](/docs/extending/field-api/)
- Add routes, sign-in providers or admin pages: [Plugins](/docs/extending/plugins/)
