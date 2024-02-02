<template>  
  <template v-if="status == 'loading'">
    <div class="loading"></div>
  </template>
  <template v-else-if="status == 'error'">
    <div class="error h-screen">
      <div class="text-center max-w-md">
        <h1 class="font-semibold text-2xl mb-2">Uh-oh! Something went wrong.</h1>
        <p class="text-neutral-400 mb-6">Make sure things are properly configured and that your connection is working.</p>
        <div class="flex gap-x-2 justify-center">
          <router-link class="btn-primary" :to="{name: 'settings'}">Review settings</router-link>
        </div>
      </div>
    </div>
  </template>
  <template v-else>
    <!-- Header (navigation + history + actions) -->
    <header class="z-50 sticky top-0 bg-white border-b border-neutral-200 dark:bg-neutral-950 dark:border-neutral-750 flex gap-x-1 lg:gap-x-2 items-center py-1 px-2 lg:py-2 lg:px-4">
      <router-link v-if="schema && schema.type && (schema.type == 'collection')" :to="{ name: 'content', params: { name: name }, ...(folder != schema.path ? { query: { folder: folder } } : {}) }">
        <button class="!hidden lg:!inline-flex btn-secondary ">
          <Icon name="ArrowLeft" class="h-4 w-4 stroke-2 shrink-0"/>
          <span>{{ schema.label }}</span>
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
        <button class="btn-primary" @click.prevent="save" :disabled="sha && !isModelChanged">
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
      <template v-if="model || model === ''">
        <template v-if="mode === 'yfm'">
          <template v-if="schema && schema.fields">
            <field v-for="field in schema.fields" :key="field.name" :field="field" :model="model" ref="fieldRefs"></field>
          </template>
        </template>
        <template v-else-if="mode === 'code'">
          <CodeMirror v-model="model" :language="extension"/>
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
import { ref, onMounted, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Base64 } from 'js-base64';
import YAML from 'js-yaml';
import notifications from '@/services/notifications';
import github from '@/services/github';
import useYfm from '@/composables/useYfm';
import useSchema from '@/composables/useSchema';
import CodeMirror from '@/components/file/CodeMirror.vue';
import Datagrid from '@/components/file/Datagrid.vue';
import Dropdown from '@/components/utils/Dropdown.vue';
import Icon from '@/components/utils/Icon.vue';
import Field from '@/components/file/Field.vue';
import Delete from '@/components/file/Delete.vue';
import History from '@/components/file/History.vue';
import Rename from '@/components/file/Rename.vue';

const route = useRoute();
const router = useRouter();
const { loadYfm } = useYfm();
const { createModel, sanitizeObject, getSchemaByName, generateFilename } = useSchema();

const emit = defineEmits(['file-saved']);

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
const extension = ref(null);
const sha = ref(null);
const model = ref(null);
const initialModel = ref(null);
const currentPath = ref(null);
const newPath = ref(null);
const fieldRefs = ref([]);
const renameComponent = ref(null);
const deleteComponent = ref(null);
const status = ref('loading');
const displayTitle = ref('');

const isModelChanged = computed(() => {
  return JSON.stringify(model.value) !== JSON.stringify(initialModel.value);
});

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
  schema.value = null;
  mode.value = props.editor;
  file.value = null;
  extension.value = null;
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
    displayTitle.value = (model.value && model.value.title) ? `Editing "${ model.value.title }"` : 'Editing file';
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
  
  schema.value = (props.name) ? getSchemaByName(props.config, props.name) : null;  

  // If there's no editor defined, we infer it from the schema
  if (!props.editor) {
    if (file.value) {
      const parts = file.value.name.split('.');
      if (parts.length > 1 && !(parts.length === 2 && parts[0] === '')) {
        extension.value = parts.pop().toLowerCase();
      }
    }

    if (schema.value && schema.value.fields) {
      mode.value = 'yfm';
    } else if (extension.value) {
      switch (extension.value) {
        case 'md':
        case 'markdown':
        case 'mdx':
        case 'html':
        case 'htm':
        case 'yaml':
        case 'yml':
        case 'json':
        case 'js':
        case 'ts':
        case 'tsx':
          mode.value = 'code';
          break;
        case 'csv':
          mode.value = 'datagrid';
          break;
        default:
          mode.value = 'raw';
          break;   
      }
    } else {
      mode.value = 'raw';
    }
  } else {
    mode.value = props.editor;
  }

  if (mode.value == 'yfm') {
    // We combine the content schema and content value to create the model
    const contentObject = (content) ? loadYfm(content) : {};
    model.value = createModel(schema.value.fields, contentObject);
  } else {
    model.value = content;
  }

  initialModel.value = JSON.parse(JSON.stringify(model.value));
  setDisplayTitle();
  status.value = '';
};

const validateFields = () => {
  let errors = [];
  fieldRefs.value.forEach(fieldRef => {
    errors.push(...fieldRef.validate());
  });
  return errors;
};

// TODO: if saving fails, it reloads the file and wipe out all the edits
// TODO: prevent saving when no change happened and handle when Github API doesn't create a commit if no change
// TODO: history doesn't reload when creating a copy
// TODO: doesn't prevent duplicate name
const save = async () => {
  // We run validation first
  const validationErrors = validateFields();
  
  if (validationErrors.length > 0) {
    notifications.notify('Uh-oh! Some of your fields have issues. Please check for errors.', 'error');
    return;
  }

  // If validation passed, we proceed with savin
  status.value = 'saving';
  let content;

  if (mode.value === 'yfm') {
    let body = model.value.body;
    let yaml = JSON.parse(JSON.stringify(model.value));
    delete yaml.body;
    sanitizeObject(yaml);
    let yamlDumped = YAML.dump(yaml);
    content = `---\n${yamlDumped}---\n${body}`;
  } else {
    content = model.value;
  }
  
  try {
    // For new files, we need to generate the filename
    // TODO: check that the file doesn't already exist, append number if so and warn the user
    if (!sha.value) {
      const pattern = (schema.value && schema.value.filename) ? schema.value.filename : '{year}-{month}-{day}-{primary}.md';
      const filename = generateFilename(pattern, schema.value, model.value);
      currentPath.value = `${folder.value}/${filename}`;
    }

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
</script>