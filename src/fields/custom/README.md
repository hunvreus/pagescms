Use this folder to add custom fields. A few things to keep in mind:

Each custom field should have an `index.js` file with something resembling this:

```javascript
import EditComponent from './Edit.vue'; // A Vue component to handle input in the editor
import ViewComponent from './View.vue'; // A Vue component to display the values in a collection
import sortFunction from './sort.js'; // A single function for sorting values in a collection

export default {
  EditComponent, // Required
  ViewComponent, // Optional
  sortFunction, // Optional
  supportsList: true, // Optional, set to true if this has custom support for lists (see `src/fields/core/image` for an example)
};
```

More information online: https://pagescms.org/docs/custom-fields/