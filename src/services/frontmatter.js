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
  const delimiter = setDelimiter(options.delimiter, options.format);
  const frontmatterRegex = new RegExp(`^(${escapeRegExp(delimiter[0])}(?:\\n|\\r)?([\\s\\S]+?)(?:\\n|\\r)?${escapeRegExp(delimiter[1])})\\n*([\\s\\S]*)`);
  const match = frontmatterRegex.exec(content);

  let object;
  
  switch (format) {
    case 'toml-frontmatter':
      const tomlObject = match[2] ? TOML.parse(match[2], 1.0, '\n', false) : {};
      object = JSON.parse(JSON.stringify(tomlObject));
      break;
    case 'json-frontmatter':
      object = match[2] ? JSON.parse(match[2]) : {};
      break;
    case 'yaml-frontmatter':
    default:
      object = match[2] ? YAML.parse(match[2], { strict: false, uniqueKeys: false }) : {};
  }
  object['body'] = match[3] || '';
  object['body'] = object['body'].replace(/^\n/, '');

  return object;
};

const stringify = (object = {}, options = {}) => {
  const format = options.format || 'yaml-frontmatter';
  const delimiter = setDelimiter(options.delimiter, options.format);
  const body = object.body || '';
  delete object.body;

  let frontmatterContent;
  switch (format.toLowerCase()) {
    case 'toml-frontmatter':
      frontmatterContent = TOML.stringify(object, { newline: '\n'}).trim();
      break;
    case 'json-frontmatter':
      frontmatterContent = JSON.stringify(object, null, 2);
      break;
    case 'yaml-frontmatter':
    default:
      frontmatterContent = YAML.stringify(object);
  }

  return `${delimiter[0]}\n${frontmatterContent}\n${delimiter[1]}\n${body}`;
};

const setDelimiter = (delimiter, format) => {
  if (delimiter === undefined) {
    switch (format) {
      case 'toml-frontmatter':
        delimiter = '+++';
        break;
      case 'json-frontmatter':
      case 'yaml-frontmatter':
      default:
        delimiter = '---';
    }
  }
  if (typeof delimiter === 'string') {
    delimiter = [delimiter, delimiter];
  }
  
  return delimiter;
};

export default { parse, stringify };