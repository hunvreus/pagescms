/**
 * Handles frontmatter parsing and stringifying with support for YAML, TOML, and JSON.
 */

import YAML from 'yaml';
import * as TOML from '@ltd/j-toml'

// Parse straight YAML/JSON/TOML and YAML/JSON/TOML frontmatter strings into an object
const parse = (content = '', options = {}) => {
  const format = options.format || 'yaml-frontmatter';
  // YAML/JSON/TOML without frontmatter
  if (['yaml', 'json', 'toml'].includes(format)) return deserialize(content, format);
  // Frontmatter
  const delimiters = setDelimiter(options.delimiters, format);
  const startDelimiter = delimiters[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const endDelimiter = delimiters[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const frontmatterRegex = new RegExp(`^(${startDelimiter}(?:\\n|\\r)?([\\s\\S]+?)(?:\\n|\\r)?${endDelimiter})\\n*([\\s\\S]*)`);
  const match = frontmatterRegex.exec(content);
  let contentObject;
  if (!match) {
    return { body: content };
  } else {
    contentObject = deserialize(match[2], format.split('-')[0]);
  }
  contentObject['body'] = match[3] || '';
  contentObject['body'] = contentObject['body'].replace(/^\n/, '');

  return contentObject;
};

// Deserialize a YAML/JSON/TOML string to an object
const deserialize = (content = '', format = 'yaml') => {
  if (!content.trim()) return {}; // Empty content returns an empty object
  switch (format) {
    case 'yaml':
      return YAML.parse(content, { strict: false, uniqueKeys: false });
    case 'json':
      return JSON.parse(content);
    case 'toml':
      const tomlObject = TOML.parse(content, 1.0, '\n', false);
      return JSON.parse(JSON.stringify(tomlObject));
  }
};

// Convert an object into straight YAML/JSON/TOML or YAML/JSON/TOML frontmatter strings
const stringify = (contentObject = {}, options = {}) => {
  const format = options.format || 'yaml-frontmatter';
  // YAML/JSON/TOML without frontmatter
  if (['yaml', 'json', 'toml'].includes(format)) return serialize(contentObject, format);
  // Frontmatter
  const delimiters = setDelimiter(options.delimiters, format);
  let contentObjectCopy = JSON.parse(JSON.stringify(contentObject)); // Avoid mutating our object
  const body = contentObjectCopy.body || '';
  delete contentObjectCopy.body;
  let frontmatter = serialize(contentObjectCopy, format.split('-')[0]);
  frontmatter = (frontmatter.trim()) ? frontmatter.trim() + '\n' : ''; // Make sure we don't have extra newlines
  
  return `${delimiters[0]}\n${frontmatter}${delimiters[1]}\n${body}`;
};

// Serialize an object to a YAML/JSON/TOML string
const serialize = (contentObject = '', format = 'yaml') => {
  if (Object.keys(contentObject).length === 0) return ''; // Empty object returns an empty string
  switch (format) {
    case 'yaml':
      return YAML.stringify(contentObject);
    case 'json':
      return JSON.stringify(contentObject, null, 2);
    case 'toml':
      return TOML.stringify(contentObject, { newline: '\n'});
  }
}

// Sets the start/end delimiters for frontmatter
const setDelimiter = (delimiters, format) => {
  if (delimiters === undefined) {
    switch (format) {
      case 'toml-frontmatter':
        delimiters = '+++';
        break;
      case 'json-frontmatter':
      case 'yaml-frontmatter':
      default:
        delimiters = '---';
    }
  }
  if (typeof delimiters === 'string') {
    delimiters = [delimiters, delimiters];
  }
  
  return delimiters;
};

export default { parse, stringify };