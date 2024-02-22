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

// TODO: implement an invalidation mechanism for the cache (espcially for updates)
const state = reactive(JSON.parse(localStorage.getItem('config')) || {});

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
addErrors(ajv);
const ajvValidate = ajv.compile(validationSchema);

// Validate a parsed config against our schema (src/assets/validationSchema.js)
const validate = (document, filterOneOf = true) => {
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
  return validation;
};

// Retrieve, parse and validate the repo config (.pages.yml), then save it in state
const set = async (owner, repo, branch) => {
  const file = await github.getFile(owner, repo, branch, '.pages.yml');
  
  if (!file) {
    flush(owner, repo, branch);
    return;
  }

  let entry = state[`${owner}/${repo}/${branch}`];
  if (!entry || entry.sha !== file.sha) {
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
      if (entry.object.media != null) {
        if (typeof entry.object.media === 'string') {
          // We need to ensure media,input is a relative path
          const relativePath = entry.object.media.replace(/^\/|\/$/g, '');
          entry.object.media = {
            input: relativePath,
            output: `/${relativePath}`,
          };
        } else if (entry.object.media.input != null) {
          entry.object.media.input = entry.object.media.input.replace(/^\/|\/$/g, '');
        }
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