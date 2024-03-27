Use this folder to add custom fields. A few things to keep in mind:

Each custom field should have an `index.js` file with something resembling this:

```
import EditComponent from './Edit.vue'; // A Vue component to handle input in the editor
import ViewComponent from './View.vue'; // A Vue component to display the values in collections
import sortFunction from './sort.js'; // Export a single function for sorting in collections

export function register(registerField) {
  registerField('string', {
    EditComponent, // Required
    ViewComponent, // Optional
    sortFunction, // Optional
    supportsList: true, // Optional, set to true if this has custom support for lists (see `src/fields/core/image` for an example)
  });
}
```

More information online: https://pagescms.org/docs/custom-fields/