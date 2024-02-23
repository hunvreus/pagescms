/**
 * Handles frontmatter parsing and stringifying with support for YAML, TOML, and JSON.
 */

import YAML from 'yaml';
import * as TOML from '@ltd/j-toml'

const parse = (content = '', options = {}) => {
  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  const format = options.format || 'yaml-frontmatter';
  const delimiters = setDelimiter(options.delimiters, options.format);
  const frontmatterRegex = new RegExp(`^(${escapeRegExp(delimiters[0])}(?:\\n|\\r)?([\\s\\S]+?)(?:\\n|\\r)?${escapeRegExp(delimiters[1])})\\n*([\\s\\S]*)`);
  const match = frontmatterRegex.exec(content);

  let object;
  if (!match[2].trim()) {
    // Empty frontmatter
    object = {};
  } else {
    switch (format) {
      case 'toml-frontmatter':
        const tomlObject = TOML.parse(match[2], 1.0, '\n', false);
        object = JSON.parse(JSON.stringify(tomlObject));
        break;
      case 'json-frontmatter':
        object = JSON.parse(match[2]);
        break;
      case 'yaml-frontmatter':
      default:
        object = YAML.parse(match[2], { strict: false, uniqueKeys: false });
    }
  }
  
  object['body'] = match[3] || '';
  object['body'] = object['body'].replace(/^\n/, '');

  return object;
};

const stringify = (object = {}, options = {}) => {
  const format = options.format || 'yaml-frontmatter';
  const delimiters = setDelimiter(options.delimiters, options.format);
  let objectCopy = JSON.parse(JSON.stringify(object));
  const body = objectCopy.body || '';
  delete objectCopy.body;
  
  let frontmatterContent;
  if (Object.keys(objectCopy).length === 0) {
    // If the object is empty, we just return an empty frontmatter
    frontmatterContent = '';
  } else {
    switch (format.toLowerCase()) {
      case 'toml-frontmatter':
        frontmatterContent = TOML.stringify(objectCopy, { newline: '\n'}).trim();
        break;
      case 'json-frontmatter':
        frontmatterContent = JSON.stringify(objectCopy, null, 2);
        break;
      case 'yaml-frontmatter':
      default:
        frontmatterContent = YAML.stringify(objectCopy);
    }
    frontmatterContent = `${frontmatterContent.trim()}\n`; // Make sure it ends with a newline
  }
  
  
  return `${delimiters[0]}\n${frontmatterContent}${delimiters[1]}\n${body}`;
};

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