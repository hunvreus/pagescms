// Helper function for deep merging objects (Target takes precedence)
function deepMergeObjects(target: any, source: any) {
  for (const key in source) {
    const targetValue = target[key];
    const sourceValue = source[key];

    if (targetValue === undefined) {
       target[key] = JSON.parse(JSON.stringify(sourceValue));
    } else if (
      targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue) &&
      sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)
    ) {
      deepMergeObjects(targetValue, sourceValue);
    }
  }
}

export { deepMergeObjects }