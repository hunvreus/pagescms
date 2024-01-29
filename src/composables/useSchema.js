/**
 * Helper functions for the schema defined in .pages.yml
 */

import moment from 'moment';
import slugify from 'slugify';
import { transliterate } from 'transliteration';

export default function useSchema() {
  // Create a model from a list of fields and corresponding values
  const createModel = (fields, content = {}) => {
    let model = {};
    for (const field of fields) {
      if (field.list) {
        const listContent = Array.isArray(content[field.name]) ? content[field.name] : [];
        model[field.name] = listContent.length > 0 
          ? listContent.map(item => field.type === 'object' ? createModel(field.fields, item) : item) 
          : [getDefaultValue(field)];
      } else {
        model[field.name] = content.hasOwnProperty(field.name) 
          ? content[field.name] 
          : getDefaultValue(field);
      }
    }
    return model;
  };
  
  // Returns the default feld value based on its value and type
  const getDefaultValue = (field) => {
    if (field.default !== undefined) {
      return field.default;
    }
    switch (field.type) {
      case 'object':
        return createModel(field.fields, {});
      case 'boolean':
        return false;
      case 'date':
        return moment().format('YYYY-MM-DD');
      default:
        return '';
    }
  };
  
  // Traverse the object and remove all empty/null/undefined values
  const sanitizeObject = (obj) => {
    Object.keys(obj).forEach((key) => {
      const val = obj[key]
      if (!!val && typeof val === 'object') {
        const keys = Object.keys(val)
        if (!keys.length || keys.every((key) => !val[key])) {
          delete obj[key]
        }
        else if (!sanitizeObject(val)) {
          delete obj[key]
        }
      }
      else if (!val && typeof val != 'boolean') {
        delete obj[key]
      }
    });

    return !!Object.keys(obj).length;
  };

  // Retrieve the deepest matching content schema in the config for a file
  const getSchemaByPath = (config, path) => {
    // Normalize the file path
    const normalizedPath = `/${path}/`.replace(/\/\/+/g, '/');
  
    // Sort the entries by the depth of their path, and normalize them
    const matches = config.content
      .map(item => {
        const normalizedConfigPath = `/${item.path}/`.replace(/\/\/+/g, '/');
        return { ...item, path: normalizedConfigPath };
      })
      .filter(item => normalizedPath.startsWith(item.path))
      .sort((a, b) => b.path.length - a.path.length);
  
    // Return the first item in the sorted array which will be the deepest match, or undefined if no match
    return matches[0];
  };

  // Retrieve the matching schema for a type
  const getSchemaByName = (config, name) => {
    return config.content.find(item => item.name === name);
  };

  // Safely access nested properties in an object
  function safeAccess(obj, path) {
    return path.split('.').reduce((acc, part) => {
      if (part.endsWith(']')) {
        const [arrayPath, index] = part.split('[');
        return (acc[arrayPath] || [])[parseInt(index.replace(']', ''), 10)];
      }
      return acc && acc[part];
    }, obj);
  }

  const generateFilename = (pattern, schema, model) => {
    // Replace date placeholders
    pattern = pattern.replace(/\{year\}/g, moment().format('YYYY'))
                     .replace(/\{month\}/g, moment().format('MM'))
                     .replace(/\{day\}/g, moment().format('DD'))
                     .replace(/\{hour\}/g, moment().format('HH'))
                     .replace(/\{minute\}/g, moment().format('mm'))
                     .replace(/\{second\}/g, moment().format('ss'));
  
    // Replace `{primary}` with the actual name of the primary field
    const primaryField = (schema.view && schema.view.primary) || (model.hasOwnProperty('title') ? 'title' : schema.fields[0]?.name); // To check if model.
    pattern = pattern.replace(new RegExp(`\\{primary\\}`, 'g'), primaryField ? `{fields.${primaryField}}` : '');
  
    // Replace field placeholders
    return pattern.replace(/\{fields\.([^}]+)\}/g, (_, fieldName) => {
      const value = safeAccess(model, fieldName);
      return value ? slugify(transliterate(String(value)), { lower: true, strict: true }) : '';
    });
  };

  return { createModel, getDefaultValue, sanitizeObject, getSchemaByPath, getSchemaByName, generateFilename };
}