export function useFieldValidation() {
  const validateRequired = (schema, value) => {
    if (schema.required && !value) {
      return 'This field is required.';
    }
    return null;
  };

  const validatePattern = (schema, value) => {
    let regex, message;
    const pattern = schema.pattern;

    if (typeof pattern === 'string') {
      regex = new RegExp(pattern);
      message = 'The field does not match the required pattern.';
    } else if (pattern && typeof pattern === 'object' && pattern.regex) {
      regex = new RegExp(pattern.regex);
      message = pattern.message || 'The field does not match the required pattern.';
    }

    if (regex && !regex.test(value)) {
      return message;
    }

    return null;
  };

  const validateLength = (schema, value) => {
    if (schema.options?.minlength && value.length < schema.options.minlength) {
      return `The field must be at least ${schema.options.minlength} characters long.`;
    }
    if (schema.options?.maxlength && value.length > schema.options.maxlength) {
      return `The field must be at most ${schema.options.maxlength} characters long.`;
    }
    return null;
  };

  const validateRange = (schema, value) => {
    if (schema.options?.min && value < schema.options.min) {
      return `The value must be at least ${schema.options.min}.`;
    }
    if (schema.options?.max && value > schema.options.max) {
      return `The value must be at most ${schema.options.max}.`;
    }
    return null;
  };

  return { validateRequired, validatePattern, validateLength, validateRange };
}