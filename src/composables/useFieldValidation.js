import useSchema from '@/composables/useSchema';

const { sanitizeObject } = useSchema();

export default function useFieldValidation() {
  const validateRequired = (schema, value) => {
    let errors = [];
    if (schema.required && !sanitizeObject(value)) {
      errors.push('This field is required.');
    }
    return errors;
  };

  const validateListRange = (schema, value) => {
    let errors = [];
    const sanitizedValue = value.filter(entry => sanitizeObject(entry));
    if (schema.list?.min && sanitizedValue.length < schema.list.min) {
      errors.push(`This list must contain at least ${schema.list.min} ${schema.list.min === 1 ? 'entry' : 'entries'}.`);
    }
    if (schema.list?.max && sanitizedValue.length > schema.list.max) {
      errors.push(`This list must contain at most ${schema.list.max} ${schema.list.max === 1 ? 'entry' : 'entries'}.`);
    }
    return errors;
  }

  const validatePattern = (schema, value) => {
    let errors = [];
    let regex, message;
    const pattern = schema.pattern;

    // `pattern` can be a string or an object
    if (typeof pattern === 'string') {
      regex = new RegExp(pattern);
      message = 'This field does not match the required pattern.';
    } else if (pattern && typeof pattern === 'object' && pattern.regex) {
      regex = new RegExp(pattern.regex);j
      message = pattern.message || 'This field does not match the required pattern.';
    }

    if (regex && !regex.test(value)) {
      errors.push(message);
    }

    return errors;
  };

  const validateLength = (schema, value) => {
    let errors = [];
    if (schema.options?.minlength && value.length < schema.options.minlength) {
      errors.push(`This field must be at least ${schema.options.minlength} ${schema.options.minlength === 1 ? 'character' : 'characters'} long.`);
    }
    if (schema.options?.maxlength && value.length > schema.options.maxlength) {
      errors.push(`This field must be at most ${schema.options.maxlength} ${schema.options.maxlength === 1 ? 'character' : 'characters'} long.`);
    }
    return errors;
  };

  const validateRange = (schema, value) => {
    let errors = [];
    if (schema.options?.min && value < schema.options.min) {
      errors.push(`This field must have a value of at least ${schema.options.min}.`);
    }
    if (schema.options?.max && value > schema.options.max) {
      errors.push(`This field must have a value of at most ${schema.options.max}.`);
    }
    return errors;
  };

  return { validateRequired, validateListRange, validatePattern, validateLength, validateRange };
}