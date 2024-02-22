/**
 * Helper functions for the schema defined in .pages.yml
 */

import dayjs from 'dayjs';
import slugify from 'slugify';
import { transliterate } from 'transliteration';
import { marked } from 'marked';
import insane from 'insane';

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
        if (content.hasOwnProperty(field.name)) {
          const fieldValue = content[field.name];
          // Check if the field value is an array while the field is not a list or an object
          if (!field.list && field.type !== 'object' && Array.isArray(fieldValue)) {
            model[field.name] = fieldValue.length > 0 ? fieldValue[0] : getDefaultValue(field);
          } else if (typeof fieldValue === 'object' && field.type !== 'object') {
            // Convert object to string
            model[field.name] = fieldValue.toString();
          } else {
            model[field.name] = fieldValue;
          }
        } else {
          model[field.name] = getDefaultValue(field);
        }
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
        return dayjs().format('YYYY-MM-DD');
      default:
        return '';
    }
  };
  
  // Traverse the object and remove all empty/null/undefined values
  const sanitizeObject = (object) => {
    const objectCopy = JSON.parse(JSON.stringify(object));
    Object.keys(objectCopy).forEach((key) => {
      const val = objectCopy[key];
      if (val && typeof val === 'object') {
        objectCopy[key] = sanitizeObject(val); // Recursively sanitize the object
        if (!Object.keys(objectCopy[key]).length) {
          delete objectCopy[key]; // Delete the key if the sanitized object is empty
        }
      } else if (val === null || val === undefined || val === '') {
        delete objectCopy[key]; // Delete keys with null, undefined, or empty string values
      }
    });
  
    return objectCopy;
  };

  // Retrieve the deepest matching content schema in the config for a file
  const getSchemaByPath = (config, path) => {
    if (!config || !config.content) return null;
    const normalizedPath = `/${path}/`.replace(/\/\/+/g, '/');
    // Sort the entries by the depth of their path, and normalize them
    const matches = config.content
      .map(item => {
        const normalizedConfigPath = `/${item.path}/`.replace(/\/\/+/g, '/');
        return { ...item, path: normalizedConfigPath };
      })
      .filter(item => normalizedPath.startsWith(item.path))
      .sort((a, b) => b.path.length - a.path.length);
    // Return the first item in the sorted array which will be the deepest match, or undefined if no match.
    const schema = matches[0];

    // We deep clone the object to avoid mutating config if schema is modified.
    return schema ? JSON.parse(JSON.stringify(schema)) : null;
  };

  // Retrieve the matching schema for a type
  const getSchemaByName = (config, name) => {
    if (!config || !config.content) return null;
    const schema = config.content.find(item => item.name === name);

    // We deep clone the object to avoid mutating config if schema is modified.
    return schema ? JSON.parse(JSON.stringify(schema)) : null;
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
    pattern = pattern.replace(/\{year\}/g, dayjs().format('YYYY'))
                     .replace(/\{month\}/g, dayjs().format('MM'))
                     .replace(/\{day\}/g, dayjs().format('DD'))
                     .replace(/\{hour\}/g, dayjs().format('HH'))
                     .replace(/\{minute\}/g, dayjs().format('mm'))
                     .replace(/\{second\}/g, dayjs().format('ss'));
  
    // Replace `{primary}` with the actual name of the primary field
    const primaryField = (schema.view && schema.view.primary) || (model.hasOwnProperty('title') ? 'title' : schema.fields[0]?.name); // To check if model.
    pattern = pattern.replace(new RegExp(`\\{primary\\}`, 'g'), primaryField ? `{fields.${primaryField}}` : '');
  
    // Replace field placeholders
    return pattern.replace(/\{fields\.([^}]+)\}/g, (_, fieldName) => {
      const value = safeAccess(model, fieldName);
      return value ? slugify(transliterate(String(value)), { lower: true, strict: true }) : '';
    });
  };

  const renderDescription = (markdown) => {
    let html = marked(markdown);
    html = insane(html);
    html = html.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
    return html;
  };

  return { createModel, getDefaultValue, sanitizeObject, getSchemaByPath, getSchemaByName, safeAccess, generateFilename, renderDescription };
}