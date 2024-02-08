/**
 * YAML Front Matter wrapper for js-yaml.
 */

import YAML from 'js-yaml';

export default function useYaml() {
  const readYfm = (content = '') => {
    const frontmatterRegex = /^(-{3}(?:\n|\r)([\w\W]+?)(?:\n|\r)-{3})?([\w\W]*)*/
    const match = frontmatterRegex.exec(content);
    let model = match[2] ? YAML.load(match[2], {json: true}) : {};
    model['body'] = match[3] || '';
    // Somehow the library returns the body with a new line at the beginning
    model['body'] = model['body'].replace(/^\n/, '');
    
    return model;
  };

  const writeYfm = (model = {}) => {
    const body = model.body;
    const yaml = JSON.parse(JSON.stringify(model));
    delete yaml.body;
    const frontmatterContent = YAML.dump(yaml);
    const content = `---\n${frontmatterContent}---\n${body}`;
    return content;
  };

  const readYaml = (content = '') => {
    const model = YAML.load(content, { json: true }) || {};

    return model;
  };

  const writeYaml = (model = {}) => {
    const content = YAML.dump(model);

    return content;
  };
  
  return { readYfm, writeYfm, readYaml, writeYaml };
}