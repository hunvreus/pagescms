/**
 * Service to retrieve, parse and validate the repo config (.pages.yml), with light caching.
 */

import { reactive } from 'vue';
import { Base64 } from 'js-base64';
import Ajv from 'ajv';
import addErrors from 'ajv-errors';
import validationSchema from '@/assets/validationSchema.js';
import YAML from 'yaml';
import github from '@/services/github';

const CONFIG_VERSION = '1.0'; // We increment this when there are schema logic changes
const CONFIG_CACHE = (import.meta.env?.VITE_CONFIG_CACHE === 'false') ? false : true;
// Flush the cache if disabled or if the version doesn't match
const currentVersion = localStorage.getItem('configVersion') || '0';
if (!CONFIG_CACHE || currentVersion !== CONFIG_VERSION) {
  console.warn('Invalidating config cache.');
  localStorage.removeItem('config');
  localStorage.setItem('configVersion', CONFIG_VERSION);
}
const state = reactive(JSON.parse(localStorage.getItem('config')) || {});

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
addErrors(ajv);
const ajvValidate = ajv.compile(validationSchema);

// Validate a parsed config against our schema (src/assets/validationSchema.js)
const validate = (document, filterOneOf = false, filterIf = false) => {
  const valid = ajvValidate(document.toJSON());
  const errors = ajvValidate.errors ? JSON.parse(JSON.stringify(ajvValidate.errors)) : null;
  let validation = [];
  if (!valid && errors) {
    // Map the errors to a format that can be used by Codemirror
    validation = errors.map(error => {
      const yamlPath = error.instancePath ? error.instancePath.substring(1).split('/').map(segment => isNaN(segment) ? segment : parseInt(segment, 10)) : [];
      const yamlNode = document.getIn(yamlPath, true);
      let range;
      let message;
      if (error.keyword === 'additionalProperties') {
        // For additionalProperties errors, we need the key range
        const parentNode = yamlNode && yamlNode.items && yamlNode.items.find(item => item.key.value === error.params.additionalProperty)
        range = parentNode ? parentNode.key.range : null;
        message = `This field (${error.params.additionalProperty}) is not valid and will be ignored.`;
      } else {
        range = yamlNode && yamlNode.range ? yamlNode.range : null;
        message = error.message;
      }

      return {
        severity: (error.keyword === 'additionalProperties') ? 'warning' : 'error',
        from: range ? range[0] : null,
        to: range ? range[1] : null,
        message: message,
        ajv: error,
      };
    });
    // TODO: Add custom validation (e.g. fields array are valid field names)
  }
  if (filterOneOf) {
    validation = validation.filter(error => {
      return !error.ajv.schemaPath.includes('/oneOf/') || error.ajv.schemaPath.endsWith('/oneOf');
    });
  }
  if (filterIf) {
    validation = validation.filter(error => {
      return error.ajv.keyword !== 'if';
    });
  }
  return validation;
};

// Retrieve, parse and validate the repo config (.pages.yml), then save it in state
const set = async (owner, repo, branch) => {
  const file = await github.getFile(owner, repo, branch, '.pages.yml');
  if (!file) {
    // No config file, we flush the cache if it exists
    flush(owner, repo, branch);
    return;
  }
  let entry = state[`${owner}/${repo}/${branch}`];
  if (!entry || entry.sha !== file.sha) {
    // We only parse and validate if the file has changed
    entry = {
      sha: file.sha,
      content: Base64.decode(file.content),
      validation: [],
    };
    if (entry.content.trim() === '') {
      // We skip parsing and validation if the file is empty
      entry.document = null;
      entry.object = null;
      entry.validation = [];
    } else {
      ({ document: entry.document, validation: entry.validation } = parse(owner, repo, branch, entry.content));
      entry.object = entry.document.toJSON();

      // Normalize `media`
      if (entry.object.media != null) {
        if (typeof entry.object.media === 'string') {
          // Ensure media.input is a relative path and set
          const relativePath = entry.object.media.replace(/^\/|\/$/g, '');
          entry.object.media = {
            input: relativePath,
            output: `/${relativePath}`,
          };
        } else {
          if (entry.object.media.input != null) {
            // Make sure input is relative
            entry.object.media.input = entry.object.media.input.replace(/^\/|\/$/g, '');
          }
          if (entry.object.media.output != null && entry.object.media.output !== '/') {
            // Make sure output doesn't have a trailing slash
            entry.object.media.output = entry.object.media.output.replace(/\/$/, '');
          }
        }
      }

      // Normalize `content`
      if (entry.object.content?.length > 0) {
        entry.object.content = entry.object.content.map(item => {
          if (item.path != null) {
            item.path = item.path.replace(/^\/|\/$/g, '');
          }
          if (item.filename == null && item.type === 'collection') {
            item.filename = '{year}-{month}-{day}-{primary}.md';
          }
          if (item.extension == null) {
            const filename = item.type === 'file' ? item.path : item.filename;
            item.extension = /(?:\.([^.]+))?$/.exec(filename)[1];
          }
          if (item.format == null) {
            item.format = 'raw';
            const codeExtensions = ['yaml', 'yml', 'javascript', 'js', 'jsx', 'typescript', 'ts', 'tsx', 'json', 'html', 'htm', 'markdown', 'md', 'mdx'];
            if (item.fields?.length > 0) {
              switch (item.extension) {
                case 'json':
                  item.format = 'json';
                  break;
                case 'toml':
                  item.format = 'toml';
                  break;
                case 'yaml':
                case 'yml':
                  item.format = 'yaml';
                  break;
                default:
                  // TODO: should we default to this or only consider 'markdown', 'md', 'mdx' and 'html'
                  // This may catch things like csv or xml for example, which is acceptable IMHO (e.g. sitemap.xml)
                  item.format = 'yaml-frontmatter';
                  break;
              }
              
            } else if (codeExtensions.includes(item.extension)) {
              item.format = 'code';
            } else if (item.extension === 'csv') {
              // If you read this: datagrid is still a tad rough around the edges
              item.format = 'datagrid';
            }
          }
          return item;
        });
      }
    }
  }
  save(owner, repo, branch, entry);
  
  return entry;
}

// Save a repo/branch configuration in state and cache
const save = (owner, repo, branch, entry) => {
  state[`${owner}/${repo}/${branch}`] = entry;
  localStorage.setItem('config', JSON.stringify(state));
}

// Remove a repo/branch configuration from state and cache
const flush = (owner, repo, branch) => {
  delete state[`${owner}/${repo}/${branch}`];
  localStorage.setItem('config', JSON.stringify(state));
}

// Parse and validate a given configuration
const parse = (owner, repo, branch, content) => {
  const document = YAML.parseDocument(content, { strict: false });
  let validation = document.errors.map(error => {
    return {
      severity: 'error',
      from: error.pos ? error.pos[0] : null,
      to: error.pos ? error.pos[1] : null,
      message: error.message, // TODO: refine error messages
      yaml: error,
    };
  });
  validation = validation.concat(validate(document));
  
  return { document, validation };
};

export default { state, set, parse };