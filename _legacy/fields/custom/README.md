Use this folder to add custom fields.

Custom field names should be unique, unless you want to override a core field.

Each field folder should include an `index.ts` or `index.tsx` file that can export:

- `schema`: a [Zod schema](https://zod.dev/) used to process the field when saving. This is used for validation and format coertion.
- `read`: a function used to convert the field value when reading from a file (e.g. `fields/core/date` will convert from the `format` defined for that date field to a standard ISO 8601 date/datetime).
- `write`: a function used to convert the field value when writing to a file (e.g. `fields/core/date` will convert from a standard ISO 8601 date/datetime to the `format` defined for that date field).
- `EditComponent`: a React component used to edit the field.
- `ViewComponent`: a React component used to display the field in a collection.
- `defaultValue`: defines the default value for the field.