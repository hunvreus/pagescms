const fieldRegistry = {};

// We collect all field modules from the core and custom directories
const coreFieldModules = import.meta.glob('./core/*/index.js', { eager: true });
const customFieldModules = import.meta.glob('./custom/*/index.js', { eager: true });
const fieldModules = { ...coreFieldModules, ...customFieldModules };

// We iterate over each field module and add it to the registry
for (const [path, module] of Object.entries(fieldModules)) {
  if (module.default) {
    const segments = path.split('/');
    const type = segments[segments.length - 2];
    fieldRegistry[type] = { ...module.default };
  } else {
    console.warn(`Field module at ${path} skipped (no default export).`);
  }
}

export default fieldRegistry;