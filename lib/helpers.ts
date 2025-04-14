// Helper function for deep merging objects (target takes precedence)
function deepMergeObjects(target: any, source: any): any {
  const output = (target && typeof target === 'object' && !Array.isArray(target)) 
    ? { ...target }
    : {};

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return output; 
  }

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const targetValue = output[key];
      const sourceValue = source[key];

      if (targetValue === undefined) {
        output[key] = (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue))
          ? JSON.parse(JSON.stringify(sourceValue)) 
          : sourceValue;
      } else if (
        targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue) &&
        sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)
      ) {
        output[key] = deepMergeObjects(targetValue, sourceValue); 
      }
    }
  }
  return output;
}

export { deepMergeObjects }