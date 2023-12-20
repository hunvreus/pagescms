<template>  
  <template v-if="status == 'loading'">
    <div class="loading"></div>
  </template>
  <template v-else-if="status == 'error'">
    <div class="error h-screen">
      <div class="text-center max-w-md">
        <h1 class="font-semibold text-2xl mb-2">Uh oh. Something went wrong.</h1>
        <p class="text-neutral-400 mb-6">Make sure things are properly configured and that your connection is working.</p>
        <div class="flex gap-x-2 justify-center">
          <router-link class="btn" :to="{name: 'settings'}">Review settings</router-link>
        </div>
      </div>
    </div>
  </template>
  <template v-else>
    <!-- Header (navigation + history + actions) -->
    <header class="z-50 sticky top-0 bg-white border-b border-neutral-200 flex gap-x-1 lg:gap-x-2 items-center py-1 px-2 lg:py-2 lg:px-4">
      <router-link v-if="schema && schema.type && (schema.type == 'collection')" :to="{ name: 'content', params: { name: name } }" class="btn-icon-secondary lg:py-2 lg:px-4">
        <svg class="shrink-0 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div class="hidden lg:block">{{ schema.label }}</div>
      </router-link>
      <div class="flex gap-x-2 ml-auto items-center">
        <template v-if="sha">
          <History
            :owner="props.owner"
            :repo="props.repo"
            :branch="props.branch"
            :path="currentPath"
            :sha="sha"
          />
        </template>
        <button class="btn-primary" @click.prevent="save" :disabled="sha && !isModelChanged">
          Save
          <div class="spinner-white-sm" v-if="status == 'saving'"></div>
        </button>
        <Dropdown v-if="sha" :dropdownClass="'!max-w-none w-48'">
          <template #trigger>
            <button class="btn-icon group-[.dropdown-active]:bg-neutral-100">
              <svg class="shrink-0 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 6C12.5523 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4C11.4477 4 11 4.44772 11 5C11 5.55228 11.4477 6 12 6Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 20C12.5523 20 13 19.5523 13 19C13 18.4477 12.5523 18 12 18C11.4477 18 11 18.4477 11 19C11 19.5523 11.4477 20 12 20Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </template>
          <template #content>
            <ul>
              <li>
                <a :href="`https://github.com/${props.owner}/${props.repo}/blob/${props.branch}/${props.path}`" target="_blank" class="link">
                  <div>See file on GitHub</div>
                  <svg class="shrink-0 h-4 w-4 ml-auto text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 9L21 3M21 3H15M21 3L13 11M10 5H7.8C6.11984 5 5.27976 5 4.63803 5.32698C4.07354 5.6146 3.6146 6.07354 3.32698 6.63803C3 7.27976 3 8.11984 3 9.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21H14.2C15.8802 21 16.7202 21 17.362 20.673C17.9265 20.3854 18.3854 19.9265 18.673 19.362C19 18.7202 19 17.8802 19 16.2V14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </a>
              </li>
              <template v-if="schema && schema.type && (schema.type == 'collection')">
                <li><hr class="border-t border-neutral-150 my-2"/></li>
                <li><button class="link w-full" @click.prevent="renameComponent.openModal()">Rename</button></li>
                <li><router-link :to="{ name: 'new', params: { path: currentPath } }" class="link w-full">Make a copy</router-link></li>
                <li><button class="link-danger w-full" @click.prevent="deleteComponent.openModal()">Delete</button></li>
              </template>
            </ul>
          </template>
        </Dropdown>
      </div>
    </header>
    <!-- Fields -->
    <main class="max-w-4xl mx-auto p-4 lg:p-8">
      <h1 v-if="displayTitle" class="font-semibold text-2xl lg:text-4xl mb-8">{{ displayTitle }}</h1>
      <template v-if="model">
        <template v-if="mode === 'yfm'">
          <template v-if="schema && schema.fields">
            <field v-for="field in schema.fields" :key="field.name" :field="field" :model="model"></field>
          </template>
        </template>
        <template v-else-if="mode === 'datagrid'">
          <div class="overflow-x-auto">
            <Datagrid v-model="model"/>
          </div>
        </template>
        <template v-else>
          <textarea rows="20" v-model="model" class="textarea w-full"></textarea>
        </template>
      </template>
    </main>
    <!-- Rename modal -->
    <Rename
      ref="renameComponent"
      :owner="props.owner"
      :repo="props.repo"
      :branch="props.branch"
      :path="currentPath"
      @renamed="handleRenamed"
    />
    <!-- Delete modal -->
    <Delete
      ref="deleteComponent"
      :owner="props.owner"
      :repo="props.repo"
      :branch="props.branch"
      :path="currentPath"
      :sha="sha"
      @deleted="handleDeleted"
    />
    <!-- Waiting overlay -->
    <Teleport to="body">
      <div class="waiting" v-show="status == 'saving'"></div>
    </Teleport>
  </template>
</template>

<script setup>
// TODO: Deal with collaboration and race conditions (e.g. someone updates a file while we're editing)

import { ref, onMounted, watch, computed, reactive, provide } from 'vue';
import { useRouter } from 'vue-router';
import { Base64 } from 'js-base64';
import YAML from 'js-yaml';
import notifications from '@/services/notifications';
import github from '@/services/github';
import useYfm from '@/composables/useYfm';
import useSchema from '@/composables/useSchema';
import Datagrid from '@/components/file/Datagrid.vue';
import Dropdown from '@/components/utils/Dropdown.vue';
import Field from '@/components/file/Field.vue';
import Delete from '@/components/file/Delete.vue';
import History from '@/components/file/History.vue';
import Rename from '@/components/file/Rename.vue';

const router = useRouter();
const { loadYfm } = useYfm();
const { createModel, sanitizeObject, getSchemaByName, generateFilename } = useSchema();

const props = defineProps({
  owner: String,
  repo: String,
  branch: String,
  name: String,
  path: String,
  config: Object,
  title: String,
  editor: String,
  isNew: Boolean
});

const schema = ref(null);
const mode = ref(props.editor);
const file = ref(null);
const sha = ref(null);
const model = ref(null);
const initialModel = ref(null);
const currentPath = ref(null);
const newPath = ref(null);
const renameComponent = ref(null);
const deleteComponent = ref(null);
const status = ref('loading');
const displayTitle = ref('');

const isModelChanged = computed(() => {
  return JSON.stringify(model.value) !== JSON.stringify(initialModel.value);
});

const handleRenamed = ({ renamedPath, renamedSha }) => {
  // We update the history to point at the new route/path
  router.replace({
    name: 'edit',
    params: { owner: props.owner, repo: props.repo, branch: props.branch, path: renamedPath } 
  });
  // Updating values to continue editing
  currentPath.value = renamedPath;
};

const handleDeleted = () => {
  router.push({ name: 'content', params: { name: props.name } });
};

const resetEditor = () => {
  // Reset the editor
  schema.value = null;
  mode.value = props.editor;
  file.value = null;
  sha.value = null;
  model.value = null;
  initialModel.value = null;
  currentPath.value = (!props.isNew) ? props.path : null;
  newPath.value = null;
  status.value = 'loading';
  displayTitle.value = '';
};

const setDisplayTitle = () => {
  // Set the title (not very elegant, I know)
  if (props.title) {
    // If the title is passed as a prop, we use it
    displayTitle.value = props.title;
  } else if (sha.value) {
    // Editing a file
    displayTitle.value = (model.value && model.value.title) ? `Editing "${ model.value.title }"` : 'Editing file';
  } else if (props.path) {
    // Making a copy of a file
    displayTitle.value = `Copy of "${ model.value.title }"`;
  } else {
    // Creating a new file
    displayTitle.value = 'Create a new entry';
  }
};

// Initialize the editor
const setEditor = async () => {
  resetEditor();
  
  let content = '';

  // Fetch the file (edit or copy)
  if (props.path) {
    file.value = await github.getFile(props.owner, props.repo, props.branch, props.path);
    if (!file.value) {
      notifications.notify(`Failed to retrieve the file at "${props.path}".`, 'error');
      status.value = 'error';
      return;
    } else {
      sha.value = (props.isNew) ? null : file.value.sha;
      content = Base64.decode(file.value.content);
    }
  }
  
  // If we have a content name, we attemp to retrieve its schema
  schema.value = (props.name) ? getSchemaByName(props.config, props.name) : null;  

  // If there's no editor defined, we infer it from the schema
  if (!props.editor) {
    let extension = null;
    
    if (file.value) {
      const parts = file.value.name.split('.');
      if (parts.length > 1 && parts[0] !== '') {
        extension = parts.pop().toLowerCase();
      }
    }
    
    mode.value = (schema.value && schema.value.fields)
      ? 'yfm'
      : (extension && extension === 'csv')
        ? 'datagrid'
        : 'raw';
  }

  if (mode.value == 'yfm') {
    // We combine the content schema and content value to create the model
    const contentObject = (content) ? loadYfm(content) : {};
    model.value = createModel(schema.value.fields, contentObject);
  } else {
    // Datagrid and raw editor
    model.value = content;
  }

  // Making a copy of the model to define if it has changed
  initialModel.value = JSON.parse(JSON.stringify(model.value));
  
  setDisplayTitle();
  status.value = '';
};



// Saving the file
// TODO: if saving fails, it reloads the file and wipe out all the edits
const save = async () => {
  status.value = 'saving';
  let content;

  if (mode.value === 'yfm') {
    // Prepare the file content from the model
    let body = model.value.body;
    let yaml = JSON.parse(JSON.stringify(model.value));
    delete yaml.body;
    sanitizeObject(yaml);
    let yamlDumped = YAML.dump(yaml);
    content = `---\n${yamlDumped}---\n${body}`;
  } else {
    content = model.value;
  }
  
  // We edit/create the file on GitHub
  try {
    // For new files, we need to generate the filename
    // TODO: check that the file doesn't already exist, append number if so and warn the user
    // TODO: deal with empty values? Untitled?
    if (!sha.value) {
      const pattern = (schema.value && schema.value.filename) ? schema.value.filename : '{year}-{month}-{day}-{hour}-{fields.title}.md';
      const filename = generateFilename(pattern, schema.value, model.value);
      currentPath.value = `${schema.value.path}/${filename}`;
    }

    const saveData = await github.saveFile(props.owner, props.repo, props.branch, currentPath.value, Base64.encode(content), sha.value);

    // If we've just created the file, we update the history to point at the edit route
    if (!sha.value) {
      router.replace({
        name: 'edit',
        params: { owner: props.owner, repo: props.repo, branch: props.branch, path: currentPath.value } 
      });
    }
    // Updating values to continue editing
    sha.value = saveData.content.sha;
    initialModel.value = JSON.parse(JSON.stringify(model.value));
    setDisplayTitle();
    notifications.notify(`Saved "${currentPath.value}"`, 'success');
    status.value = '';
  } catch (error) {
    notifications.notify(`Failed to save the file "${currentPath.value}"`, 'error');
    // status.value = 'error';
  }
};

onMounted(async () => {
  await setEditor();
});

// TODO: Add watcher for props.path that knows when we're trying to replace the path (renaming/creating)
watch(
  [
    () => props.owner,
    () => props.repo,
    () => props.branch,
    () => props.name,
    // () => props.path
  ],
  async () => {
    await setEditor();
  }
);
</script>
<!-- TODO: How to prevent saving when no change happened + reflect this in useGithub when API tells you "no change" -->