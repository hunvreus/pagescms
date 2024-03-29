<template>
  <!-- Loading screen -->
  <template v-if="status == 'loading'">
    <div class="loading"></div>
  </template>
  <!-- File missing error (collection) -->
  <template v-else-if="status == 'no-file-collection'">
    <div class="error h-screen">
      <div class="text-center max-w-md">
        <h1 class="font-semibold text-2xl mb-2">Nope, file's not here.</h1>
        <p class="text-neutral-400 mb-6">It may have moved or been deleted. Make sure as well things are properly configured and that your connection is working.</p>
        <div class="flex gap-x-2 justify-center">
          <router-link class="btn-primary" :to="{ name: 'content' }">Take me out of here</router-link>
        </div>
      </div>
    </div>
  </template>
  <!-- File missing error (single file) -->
  <template v-else-if="status == 'no-file'">
    <div class="error h-screen">
      <div class="text-center max-w-md">
        <h1 class="font-semibold text-2xl mb-2">The file is missing.</h1>
        <p class="text-neutral-400 mb-6">There is no file yet at <code class="text-sm bg-neutral-100 dark:bg-neutral-850 rounded-lg p-1">{{ schema.path }}</code>. Do you want to create one?</p>
        <div class="flex gap-x-2 justify-center">
          <button class="btn-primary" @click="createSingleFile(schema.path)">Create the file</button>
        </div>
      </div>
    </div>
  </template>
  <!-- Editor -->
  <template v-else>
    <!-- Header (navigation + history + actions) -->
    <header class="z-50 sticky top-0 bg-white border-b border-neutral-200 dark:bg-neutral-950 dark:border-neutral-750 flex gap-x-1 lg:gap-x-2 items-center py-1 px-2 lg:py-2 lg:px-4">
      <router-link v-if="schema && schema.type && (schema.type == 'collection')" :to="{ name: 'content', params: { name: name }, ...(folder != schema.path ? { query: { folder: folder } } : {}) }">
        <button class="!hidden lg:!inline-flex btn-secondary ">
          <Icon name="ArrowLeft" class="h-4 w-4 stroke-2 shrink-0"/>
          <span>{{ schema.label || schema.name }}</span>
          <ul v-if="subfolders.length > 0" class="flex gap-x-2 items-center">
            <template v-if="subfolders.length > 2">
              <li class="flex gap-x-2 items-center">
                <span class="text-neutral-400 dark:text-neutral-500">/</span>
                <span class="truncate max-w-20">...</span>
              </li>
              <li class="flex gap-x-2 items-center">
                <span class="text-neutral-400 dark:text-neutral-500">/</span>
                <Icon name="Folder" class="h-4 w-4 stroke-2 shrink-0"/>
                <span class="truncate max-w-20">{{ subfolders.slice(-1)[0] }}</span>
              </li>
            </template>
            <template v-else>
              <li v-for="(subfolder, index) in subfolders" :key="index" class="flex gap-x-2 items-center">
                <span class="text-neutral-400 dark:text-neutral-500">/</span>
                <Icon name="Folder" class="h-4 w-4 stroke-2 shrink-0"/>
                <span class="truncate max-w-20">{{ subfolder }}</span>
              </li>
            </template>
          </ul>
        </button>
        <button class="lg:hidden btn-icon-secondary">
          <Icon name="ArrowLeft" class="h-4 w-4 stroke-2 shrink-0"/>
        </button>
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
        <button class="btn-primary" @click.prevent="save" :disabled="(sha && !isModelChanged) || (status === 'validating-config')">
          Save
          <div class="spinner-white-sm" v-if="status == 'saving'"></div>
        </button>
        <Dropdown v-if="sha" :dropdownClass="'!max-w-none w-48'">
          <template #trigger>
            <button class="btn-icon-secondary group-[.dropdown-active]:bg-neutral-100 dark:group-[.dropdown-active]:bg-neutral-850">
              <Icon name="MoreVertical" class="h-4 w-4 stroke-2 shrink-0"/>
            </button>
          </template>
          <template #content>
            <ul>
              <li>
                <a :href="`https://github.com/${props.owner}/${props.repo}/blob/${props.branch}/${props.path}`" target="_blank" class="link">
                  <div>See file on GitHub</div>
                  <Icon name="ExternalLink" class="h-4 w-4 stroke-2 shrink-0 ml-auto text-neutral-400 dark:text-neutral-500"/>
                </a>
              </li>
              <template v-if="schema && schema.type && (schema.type == 'collection')">
                <li><hr class="border-t border-neutral-150 dark:border-neutral-750 my-2"/></li>
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
    <main class="mx-auto p-4 lg:p-8" :class="{ 'max-w-4xl': mode !== 'datagrid'}">
      <h1 v-if="displayTitle" class="font-semibold text-2xl lg:text-4xl mb-8">{{ displayTitle }}</h1>
      <div v-if="displayDescription" v-html="displayDescription" class="mb-8 prose"></div>
      <template v-if="model || model === ''">
        <template v-if="['yaml-frontmatter', 'json-frontmatter', 'toml-frontmatter', 'yaml', 'json', 'toml'].includes(mode)">
          <template v-if="schema && schema.fields">
            <field v-for="field in schema.fields" :key="field.name" :field="field" :model="model" ref="fieldRefs"></field>
          </template>
          <template v-else>
            <CodeMirror v-model="model" :language="extension" :validation="schemaValidation"/>
          </template>
        </template>
        <template v-else-if="mode === 'code'">
          <CodeMirror v-model="model" :language="extension" :validation="schemaValidation"/>
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
      @file-renamed="handleRenamed"
    />
    <!-- Delete modal -->
    <Delete
      ref="deleteComponent"
      :owner="props.owner"
      :repo="props.repo"
      :branch="props.branch"
      :path="currentPath"
      :sha="sha"
      @file-deleted="handleDeleted"
    />
    <!-- Waiting overlay -->
    <Teleport to="body">
      <div class="waiting" v-show="status == 'saving'"></div>
    </Teleport>
  </template>
</template>

<script setup>
import { ref, onMounted, watch, computed, inject } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Base64 } from 'js-base64';
import { debounce } from 'lodash';
import moment from 'moment';
import notifications from '@/services/notifications';
import github from '@/services/github';
import config from '@/services/config';
import serialization from '@/services/serialization';
import useSchema from '@/composables/useSchema';
import CodeMirror from '@/components/file/CodeMirror.vue';
import Datagrid from '@/components/file/Datagrid.vue';
import Dropdown from '@/components/utils/Dropdown.vue';
import Icon from '@/components/utils/Icon.vue';
import Field from '@/components/file/Field.vue';
import Delete from '@/components/file/Delete.vue';
import History from '@/components/file/History.vue';
import Rename from '@/components/file/Rename.vue';

const serializedTypes = ['yaml-frontmatter', 'json-frontmatter', 'toml-frontmatter', 'yaml', 'json', 'toml'];

const route = useRoute();
const router = useRouter();
const { createModel, sanitizeObject, getSchemaByName, generateFilename, renderDescription, getDateFromFilename } = useSchema();

const emit = defineEmits(['file-saved']);

const repoStore = inject('repoStore', { owner: null, repo: null, branch: null, config: null, details: null });

const props = defineProps({
  owner: String,
  repo: String,
  branch: String,
  name: String,
  path: String,
  config: Object,
  title: String,
  description: String,
  format: String,
  isNew: Boolean
});

const status = ref('loading');
const schema = computed(() => props.name ? getSchemaByName(props.config, props.name) : null);
const extension = computed(() => schema.value?.extension ?? /(?:\.([^.]+))?$/.exec(props.path)[1]);
const mode = computed(() => props.format || schema.value?.format || 'raw');
const file = ref(null);
const sha = ref(null);
const model = ref(null);
const initialModel = ref(null);
const isModelChanged = computed(() => JSON.stringify(sanitizeObject(model.value)) !== JSON.stringify(sanitizeObject(initialModel.value)));
const currentPath = ref(null);
const newPath = ref(null);
const folder = computed(() => {
  if (props.isNew && route.query.folder) {
    return route.query.folder;
  } else if (props.path) {
    const pathSegments = props.path.split('/');
    pathSegments.pop();
    return pathSegments.join('/');
  } else {
    return schema.value.path;
  }
});
const subfolders = computed(() => {
  const basePathSegments = schema.value.path.split('/').filter(Boolean);
  const currentPathSegments = folder.value.split('/').filter(Boolean);
  return currentPathSegments.slice(basePathSegments.length);
});
const fieldRefs = ref([]);
const renameComponent = ref(null);
const deleteComponent = ref(null);
const checkValidation = ref(undefined);
const schemaValidation = computed(() => {
  if (route.name === 'settings') {
    return checkValidation.value ? checkValidation.value : repoStore.config?.validation;
  } else {
    return undefined;
  }
});
const displayTitle = ref('');
const displayDescription = computed(() => {
  let markdownDescription = '';
  if (props.description) {
    markdownDescription = props.description;
  } else if (schema.value?.description) {
    markdownDescription = schema.value?.description;
  } else {
    return '';
  }
  
  return renderDescription(markdownDescription);
});

const createSingleFile = async (path) => {
  status.value = 'loading';
  const data = await github.saveFile(props.owner, props.repo, props.branch, path, '');
  if (data) {
    notifications.notify(`The file (${path}) was successfully created.`, 'success');
    await setEditor();
    status.value = '';
  } else {
    notifications.notify(`The file (${path}) couldn't be created. Try reloading the page.`, 'error', { delay: 0 });
  }
};

const handleRenamed = ({ renamedPath, renamedSha }) => {
  // Updating path/history to continue editing
  status.value = 'handling-renamed';
  router.replace({
    name: 'edit',
    params: { owner: props.owner, repo: props.repo, branch: props.branch, path: renamedPath } 
  });
  currentPath.value = renamedPath;
  // Status get reset in the watcher at the end
};

const handleDeleted = () => {
  router.push({ name: 'content', params: { name: props.name } });
};

const resetEditor = () => {
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
  if (props.title) {
    // If the title is passed as a prop, we use it
    displayTitle.value = props.title;
  } else if (sha.value) {
    // Editing a file
    displayTitle.value = model.value?.title ? `Editing "${ model.value.title }"` : 'Editing file';
  } else if (props.path) {
    // Making a copy of a file
    displayTitle.value = `Copy of "${ model.value.title }"`;
  } else {
    // Creating a new file
    displayTitle.value = 'Create a new entry';
  }
};

const setEditor = async () => {
  resetEditor();
  let content = '';

  // Retrieve the file
  if (props.path) {
    file.value = await github.getFile(props.owner, props.repo, props.branch, props.path);
    if (!file.value) {
      if (schema.value.type === 'file') {
        status.value = 'no-file';
      } else {
        status.value = 'no-file-collection';
      }
      return;
    } else {
      sha.value = (props.isNew) ? null : file.value.sha;
      content = Base64.decode(file.value.content);
    }
  }
  
  // TODO: skip some of this parsing when the file is new
  if (serializedTypes.includes(mode.value) && schema.value?.fields) {
    let contentObject = {};
    try {
      // Parse the content into an object
      contentObject = serialization.parse(content, { format: mode.value, delimiters: schema.value.delimiters });
    } catch (error) {
      console.error('Error parsing frontmatter:', error);
      const options = {
        delay: 10000,
        actions: [{
          label: 'Review settings',
          handler: () => router.push({ name: 'settings' }),
          primary: true
        }]
      };
      notifications.notify(`Failed to parse the file at "${props.path}", your settings may be wrong.`, 'error', options);
      // We can't parse the content, we switch to the raw editor.
      mode.value = 'raw';
    }
    
    // For YAML and JSON files, if schema.list is true we wrap the model and fields into an extra "listWrapper" object
    if (['yaml', 'json', 'toml'].includes(mode.value) && schema.value.list) {
      schema.value.fields = [{ name: 'listWrapper', type: 'object', list: true, label: false, fields: schema.value.fields }];
      contentObject = { listWrapper: contentObject };
    }

    // If it's an existing file and the schema has a date, but we couldn't get a date from the content and filenames have a date, we extract it
    
    const dateField = schema.value.fields.find(field => field.name === 'date');
    if (dateField && file.value?.name && !contentObject.date && (!schema.value.filename || schema.value.filename.startsWith('{year}-{month}-{day}'))) {
      const filenameDate = getDateFromFilename(file.value.name);
      if (filenameDate) {
        const dateFormat = dateField.options?.format ?? 'YYYY-MM-DD';
        contentObject.date = moment(filenameDate.string, 'YYYY-MM-DD').format(dateFormat);
      }
    }

    model.value = createModel(schema.value.fields, contentObject);
  } else {
    model.value = content;
  }

  

  initialModel.value = JSON.parse(JSON.stringify(model.value));
  setDisplayTitle();
  status.value = '';
};

const validateFields = () => {
  status.value = 'validating';
  let errors = [];
  fieldRefs.value.forEach(fieldRef => {
    errors.push(...fieldRef.validate());
  });
  status.value = '';

  return errors;
};

const save = async () => {
  // We run validation first
  const validationErrors = validateFields();
  if (validationErrors.length > 0) {
    notifications.notify('Uh-oh! Some of your fields have issues. Please check for errors.', 'error');
    return;
  }
  // We're good to go
  status.value = 'saving';

  let content = '';
  if (serializedTypes.includes(mode.value) && schema.value?.fields) {
    let contentObject = JSON.parse(JSON.stringify(model.value));
    // For YAML and JSON files with schema.list set to true, we've wrapped the model and fields into an extra "listWrapper" object
    if (['yaml', 'json', 'toml'].includes(mode.value) && schema.value.list) {
      contentObject = contentObject.listWrapper;
    }
    // Sanitize the object and stringify it
    contentObject = sanitizeObject(contentObject);

    content = serialization.stringify(contentObject, { format: mode.value, delimiters: schema.value?.delimiters });
  } else {
    content = model.value;
  }
  
  try {
    // If it's a new file, we need to generate a filename
    if (!sha.value) {
      const pattern = (schema.value && schema.value.filename) ? schema.value.filename : '{year}-{month}-{day}-{primary}.md';
      const filename = generateFilename(pattern, schema.value, model.value);
      currentPath.value = `${folder.value}/${filename}`;
    }
    // Saving the file
    const saveData = await github.saveFile(props.owner, props.repo, props.branch, currentPath.value, Base64.encode(content), sha.value, true);

    if (!saveData) {
      notifications.notify(`Failed to save the file "${currentPath.value}".`, 'error');
      status.value = '';
      return;
    }

    currentPath.value = saveData.content.path;

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
    emit('file-saved', currentPath.value);
    if (route.name === 'settings') {
      // We've updated the configuration, we need to reload it
      await config.set(repoStore.owner, repoStore.repo, repoStore.branch);
    }
    status.value = '';
  } catch (error) {
    notifications.notify(`Failed to save the file "${currentPath.value}"`, 'error');
  }
};

onMounted(async () => {
  await setEditor();
});

watch(() => route.path, async () => {
  if (status.value === 'handling-renamed') {
    status.value = '';
  } else {
    await setEditor();
  }
});

const checkConfig = debounce(
  async () => {
    ({ validation: checkValidation.value } = await config.parse(props.owner, props.repo, props.branch, model.value));
    status.value = '';
  },
  500
);

watch(() => model.value, (newValue, oldValue) => {
  if (route.name === 'settings') {
    if (JSON.stringify(newValue) === JSON.stringify(initialModel.value)) {
      checkValidation.value = undefined;
      status.value = '';
    } else {
      status.value = 'validating-config';
      checkConfig();
    }
  }
}, { deep: true });

</script>