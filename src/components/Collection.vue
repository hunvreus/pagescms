<template>
  <main class="relative min-h-screen">
    <!-- Loading screen -->
    <template v-if="status == 'loading'">
      <div class="loading"></div>
    </template>
    <!-- Error screen -->
    <template v-else-if="status == 'error'">
      <div class="error h-screen">
        <div class="text-center max-w-md">
          <h1 class="font-semibold tracking-tight text-2xl mb-2">Something's not right.</h1>
          <p class="text-neutral-400 dark:text-neutral-500 mb-6">Either your settings for the <code class="text-sm bg-neutral-100 dark:bg-neutral-850 rounded-lg p-1">{{ schema.name }}</code> collection are wrong or you may need to create the <code class="text-sm bg-neutral-100 dark:bg-neutral-850 rounded-lg p-1">{{ schema.path }}</code> folder in this repository.</p>
          <div class="flex gap-x-2 justify-center">
            <router-link class="btn-primary" :to="{name: 'settings'}">Review settings</router-link>
          </div>
        </div>
      </div>
    </template>
    <!-- Collection -->
    <template v-else-if="collection">
      <div class="max-w-screen-xl	mx-auto p-4 lg:p-8">
        <!-- Header: label, add an entry and more (i.e. see folder on GitHub, add a folder) -->
        <header class="flex gap-x-2 mb-8 items-center">
          <h1 class="font-semibold tracking-tight text-2xl lg:text-4xl mr-auto">{{ schema.label || schema.name }}</h1>
          <Dropdown :dropdownClass="'!max-w-none w-52 !z-[21]'" v-if="schema.subfolders !== false">
            <template #trigger>
              <button class="btn-icon group-[.dropdown-active]:bg-neutral-100 dark:group-[.dropdown-active]:bg-neutral-850">
                <Icon name="MoreVertical" class="h-4 w-4 stroke-2 shrink-0"/>
              </button>
            </template>
            <template #content>
              <ul>
                <li>
                  <a class="link w-full" :href="`https://github.com/${props.owner}/${props.repo}/blob/${props.branch}/${folder}`" target="_blank">
                    <div class="truncate">See folder on GitHub</div>
                    <Icon name="ExternalLink" class="h-4 w-4 stroke-2 shrink-0 ml-auto text-neutral-400 dark:text-neutral-500"/>
                  </a>
                </li>
                <li><hr class="border-t border-neutral-150 dark:border-neutral-750 my-1"/></li>
                <li><button class="link w-full" @click="openAddFolderModal()">Add a folder</button></li>
              </ul>
            </template>
          </Dropdown>
          <router-link :to="{ name: 'new', query: { folder: folder } }" class="btn-primary">Add an entry</router-link>
        </header>
        <!-- Search and sort/order -->
        <div class="flex justify-between items-center mb-4 flex-row gap-x-2">
          <div class="relative w-full">
            <input type="text" v-model="view.search" placeholder="Search by keywords" class="w-full !pl-9 placeholder-neutral-400 dark:placeholder-neutral-500">
            <div class="absolute left-2.5 lg:left-3 top-1/2 -translate-y-1/2 opacity-50">
              <Icon name="Search" class="h-4 w-4 stroke-2 shrink-0"/>
            </div>
          </div>
          <Dropdown :elementClass="'z-30'" :dropdownClass="'!max-w-none'">
            <template #trigger>
              <button class="btn-icon group-[.dropdown-active]:bg-neutral-100 dark:group-[.dropdown-active]:bg-neutral-850">
                <Icon name="SlidersHorizontal" class="h-4 w-4 stroke-2 shrink-0"/>
              </button>
            </template>
            <template #content>
              <ul class="sticky">
                <li><div class="font-medium text-xs pb-1 px-3 text-neutral-400 dark:text-neutral-500">Order by</div></li>
                <li v-for="sortField in view.config.sort" :key="sortField">
                  <button class="link w-full" @click="view.sort = sortField">
                    {{ fieldsSchemas[sortField]?.label || sortField }}
                    <Icon v-if="view.sort === sortField" name="Check" class="h-4 w-4 stroke-2 shrink-0 ml-auto"/>
                  </button>
                </li>
                <li><hr class="border-t border-neutral-150 dark:border-neutral-750 my-1"/></li>
                <li>
                  <button class="link w-full" @click="view.order = 'asc'">
                    Ascendant
                    <Icon v-if="view.order === 'asc'" name="Check" class="h-4 w-4 stroke-2 shrink-0 ml-auto"/>
                  </button>
                </li>
                <li>
                  <button class="link w-full" @click="view.order = 'desc'">
                    Descendant
                    <Icon v-if="view.order === 'desc'" name="Check" class="h-4 w-4 stroke-2 shrink-0 ml-auto"/>
                  </button>
                </li>
              </ul>
            </template>
          </Dropdown>
        </div>
        <!-- Content table -->
        <template v-if="parentFolder || viewContents.folders || viewContents.files">
          <table class="table mb-4">
            <!-- Header s-->
            <thead>
              <th v-for="field in view.config.fields" :class="[ field == view.config.primary ? 'primary-field' : '', `field-type-${fieldsSchemas[field]?.type}` ]">{{ fieldsSchemas[field]?.label }}</th>
              <th class="actions">&nbsp;</th>
            </thead>
            <tbody>
              <!-- Go to parent -->
              <tr v-if="parentFolder" class="h-[47px]">
                <td colspan="100%" class="folder">
                  <router-link :to="parentFolder" class="flex gap-x-2 items-center font-medium">
                    <Icon name="CornerLeftUp" class="h-4 w-4 stroke-2 shrink-0"/>
                    ..
                  </router-link>
                </td>
              </tr>
              <!-- Subfolders -->
              <tr v-for="item in viewContents.folders" :key="item.name" v-if="schema.subfolders !== false" class="h-[47px]">
                <td colspan="100%" class="folder">
                  <router-link :to="{ name: $route.name, query: { ...$route.query, folder: item.path } }" class="flex gap-x-2 items-center font-medium">
                    <Icon name="Folder" class="h-4 w-4 stroke-2 shrink-0"/>
                    <div class="truncate">{{ item.name }}</div>
                  </router-link>
                </td>
              </tr>
              <!-- Entry -->
              <tr v-for="item in viewContents.files" :key="item.filename">
                <td v-for="field in view.config.fields" :class="[ field == view.config.primary ? 'primary-field' : '', `field-type-${fieldsSchemas[field]?.type}` ]">
                  <template v-if="field == view.config.primary">
                    <router-link :to="{ name: 'edit', params: { name: name, path: item.path } }">
                      <template v-if="fieldRegistry[fieldsSchemas[field]?.type]?.ViewComponent">
                        <component
                          :is="fieldRegistry[fieldsSchemas[field]?.type]?.ViewComponent"
                          :field="fieldsSchemas[field]"
                          :value="item.fields?.[field]"
                        />
                      </template>
                      <template v-else>
                        {{ item.fields?.[field] }}
                      </template>
                    </router-link>
                  </template>
                  <template v-else>
                    <div>
                      <template v-if="fieldRegistry[fieldsSchemas[field]?.type]?.ViewComponent">
                        <component
                          :is="fieldRegistry[fieldsSchemas[field]?.type]?.ViewComponent"
                          :field="fieldsSchemas[field]"
                          :value="item.fields?.[field]"
                        />
                      </template>
                      <template v-else>
                        {{ item.fields?.[field] }}
                      </template>
                    </div>
                  </template>
                </td>
                <td class="actions text-right">
                  <div class="inline-flex">
                    <router-link :to="{ name: 'edit', params: { name: name, path: item.path } }" class="btn-sm !border-r-0 !rounded-r-none">Edit</router-link>
                    <Dropdown :dropdownClass="'!max-w-none w-48'">
                      <template #trigger>
                        <button class="btn-icon-sm group-[.dropdown-active]:bg-neutral-100 dark:group-[.dropdown-active]:bg-neutral-850 !rounded-l-none">
                          <Icon name="MoreVertical" class="h-4 w-4 stroke-2 shrink-0"/>
                        </button>
                      </template>
                      <template #content>
                        <ul>
                          <li>
                            <a class="link w-full" :href="`https://github.com/${props.owner}/${props.repo}/blob/${props.branch}/${item.path}`" target="_blank">
                              <div class="truncate">See file on GitHub</div>
                              <Icon name="ExternalLink" class="h-4 w-4 stroke-2 shrink-0 ml-auto text-neutral-400 dark:text-neutral-500"/>
                            </a>
                          </li>
                          <li><hr class="border-t border-neutral-150 dark:border-neutral-750 my-1"/></li>
                          <li><button class="link w-full" @click="openRenameModal(item)">Rename</button></li>
                          <li><router-link :to="{ name: 'new', params: { path: item.path } }" class="link w-full">Make a copy</router-link></li>
                          <li><button class="link-danger w-full" @click="openDeleteModal(item)">Delete</button></li>
                        </ul>
                      </template>
                    </Dropdown>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </template>
        <!-- Empty collection -->
        <div v-if="contents.files.length == 0" class="text-center rounded-xl bg-neutral-100 dark:bg-neutral-850 p-6">
          <div class="max-w-md mx-auto">
            <h2 class="font-semibold tracking-tight">No entries</h2>
            <p class="text-neutral-400 dark:text-neutral-500">There are no entries yet for the "{{ schema.label || schema.name }}" collection here.</p>
          </div>
          <div class="flex gap-x-2 justify-center mt-4">
            <router-link :to="{ name: 'new', query: { folder: folder } }" class="btn-primary-sm">Add an entry</router-link>
          </div>
        </div>
        <!-- Empty search -->
        <div v-else-if="viewContents.files.length == 0" class="text-center rounded-xl bg-neutral-100 dark:bg-neutral-850 p-6">
          <div class="max-w-md mx-auto">
            <h2 class="font-semibold tracking-tight">No results</h2>
            <p class="text-neutral-400 dark:text-neutral-500">There are no results for your search terms. You can use wildcard (e.g. "keyword*") or field specific search (e.g. "title:keyword").</p>
            <div class="flex gap-x-2 justify-center mt-4">
              <button class="btn-sm" @click="view.search = ''">Clear search terms</button>
            </div>
          </div>
        </div>
      </div>
      <!-- Utils -->
      <AddFolder
        ref="addFolderComponent"
        :owner="props.owner"
        :repo="props.repo"
        :branch="props.branch"
        :path="folder"
        @folder-added="handleFolderAdded"
      />
      <Rename
        ref="renameComponent"
        :owner="props.owner"
        :repo="props.repo"
        :branch="props.branch"
        :path="renamePath"
        @file-renamed="handleRenamed"
      />
      <Delete
        ref="deleteComponent"
        :owner="props.owner"
        :repo="props.repo"
        :branch="props.branch"
        :path="deletePath"
        :sha="deleteSha"
        @file-deleted="handleDeleted"
      />
    </template>
  </main>
</template>

<script setup>
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import lunr from 'lunr';
import moment from 'moment';
import fieldRegistry from '@/fields/fieldRegistry';
import useSchema from '@/composables/useSchema';
import github from '@/services/github';
import serialization from '@/services/serialization';
import notifications from '@/services/notifications';
import Dropdown from '@/components/utils/Dropdown.vue';
import Icon from '@/components/utils/Icon.vue';
import AddFolder from '@/components/file/AddFolder.vue';
import Rename from '@/components/file/Rename.vue';
import Delete from '@/components/file/Delete.vue';

const serializedTypes = ['yaml-frontmatter', 'json-frontmatter', 'toml-frontmatter', 'yaml', 'json', 'toml'];

const route = useRoute();
const { getDateFromFilename } = useSchema();

const props = defineProps({
  owner: String,
  repo: String,
  branch: String,
  name: String,
  config: Object,
  path: String
});

const status = ref('loading');
const renameComponent = ref(null);
const renamePath = ref('');
const addFolderComponent = ref(null);
const deleteComponent = ref(null);
const deletePath = ref('');
const deleteSha = ref('');
const collection = ref(null);
const contents = computed(() => {
  return {
    files: collection.value.filter(item => item.type === 'blob'),
    folders: collection.value.filter(item => item.type === 'tree')
  };
});
const schema = computed(() => props.config.content.find(item => item.name === props.name));
const schemaFields = computed(() => {
  let fieldsArray = schema.value.fields ? JSON.parse(JSON.stringify(schema.value.fields)) : [{ name: 'filename', label: 'Filename', type: 'string' }];
  // TODO: this is weak as the first entry may NOT have a date in the filename
  if (collection.value?.[0]?.fields?.date && !fieldsArray.find(field => field.name === 'date')) {
    fieldsArray.push({ name: 'date', label: 'Date', type: 'date' });
  }
  return fieldsArray;
});
const format = computed(() => schema.value.format || 'yaml-frontmatter');
const extension = computed(() => {
  if (schema.value.filename) {
    const parts = schema.value.filename.split('.');
    return parts.length > 1 ? parts.pop() : '';
  } else {
    return 'md';
  }
});
const fields = computed(() => schemaFields.value.map(field => field.name));
const fieldsSchemas = computed(() => {
  const schemas = {};
  schemaFields.value.forEach(field => {
    schemas[field.name] = field;
  });
  return schemas;
});
const parentFolder = computed(() => {
  if (!route.query.folder) return null;
  const pathSegments = route.query.folder.split('/').filter(Boolean);
  pathSegments.pop();
  const parentPath = pathSegments.join('/');
  const query = { ...route.query, folder: parentPath !== schema.value.path ? parentPath : undefined };
  return {
    name: route.name,
    query: query
  };
});
const folder = computed(() => route.query.folder || schema.value.path);

// Holds the state and config of the view
const view = reactive({
  config: {
    fields: [],
    primary: '',
    sort: [],
    filter: null,
  },
  sort: null,
  order: 'desc',
  filter: null,
  filter_value: null,
  search: '',
});
// Content actually displayed, taking into account search & sort
// TODO: add validation of fields in config (sort, fields, etc.), both here and in the settings editor
const viewContents = computed(() => {
  let viewFiles = [...contents.value.files];
  
  // Apply search filter
  if (view.search.trim()) {
    const query = view.search.trim();
    let searchResults = [];

    // Limit the edit distance for fuzzy search to avoid OOM crash
    const limitedQuery = query.replace(/~(\d+)/g, (match, p1) => {
      const maxEditDistance = 10;
      const limitedEditDistance = Math.min(parseInt(p1, 10), maxEditDistance);
      if (limitedEditDistance < parseInt(p1, 10)) {
        console.warn(`Fuzzy search edit distance limited to ${maxEditDistance}.`);
      }
      return `~${limitedEditDistance}`;
    });
    
    try {
      searchResults = searchIndex.search(limitedQuery);
    } catch (error) {
      if (!(error instanceof lunr.QueryParseError)) {
        throw error;
      }
    }

    viewFiles = searchResults.map(result => {
      return viewFiles.find(item => item.filename === result.ref);
    });
  }
  
  // Apply sorting
  viewFiles = viewFiles.slice().sort((a, b) => {
    let comparison = 0;
    const sortKey = view.sort;
    const fieldSchema = fieldsSchemas.value[sortKey];
    let valA = a.fields?.[sortKey];
    let valB = b.fields?.[sortKey];
    const sortFunction = fieldRegistry[fieldSchema?.type]?.sortFunction;
    if (sortFunction !== undefined) {
      comparison = sortFunction(valA, valB, fieldSchema);
    } else {
      valA = valA != null ? String(valA) : '';
      valB = valB != null ? String(valB) : '';
      comparison = valA.localeCompare(valB, undefined, { sensitivity: 'base', ignorePunctuation: true });
    }
    return view.order === 'desc' ? -comparison : comparison;
  });

  return {
    files: viewFiles,
    folders: [...contents.value.folders],
  };
});

function openRenameModal(item) {
  renamePath.value = item.path;
  renameComponent.value.openModal();
}

const handleRenamed = (renamedData) => {
  const { renamedPath, renamedSha } = renamedData;
  const item = collection.value.find(item => item.path === renamePath.value);
  item.path = renamedPath;
};

function openDeleteModal(item) {
  deletePath.value = item.path;
  deleteSha.value = item.sha;
  deleteComponent.value.openModal();
}

const handleDeleted = () => {
  const index = collection.value.findIndex(item => item.path === deletePath.value);
  collection.value.splice(index, 1);
};

function openAddFolderModal() {
  addFolderComponent.value.openModal();
}

const handleFolderAdded = () => {
  setCollection();
};

// TODO: support configurable fields and offer full file indexing if no valid fields
let searchIndex;
const setSearch = () => {
  // TODO: add configurable fields for indexing
  searchIndex = lunr(function () {
    this.ref('filename');
    schemaFields.value.forEach(field => {
      this.field(field.name);
    });
    collection.value.forEach(doc => {
      if (doc.type === 'blob') {
        this.add({
          filename: doc.filename,
          ...doc.fields,
        });
      }
    });
  });
};

const setView = () => {
  view.config.primary = (schema.value.view && schema.value.view.primary) || (fields.value.includes('title') ? 'title' : fields.value[0]);
  view.config.fields = (schema.value.view && schema.value.view.fields) || (collection.value[0]?.fields?.date ? [ view.config.primary, 'date' ] : [view.config.primary]);
  view.config.sort = (schema.value.view && schema.value.view.sort) || (collection.value[0]?.fields?.date ? ['date', view.config.primary] : [view.config.primary]);
  view.sort = (schema.value.view && schema.value.view.default && schema.value.view.default.sort) || (view.config.sort && view.config.sort.length) ? view.config.sort[0] : null;
  view.order = (schema.value.view && schema.value.view.default && schema.value.view.default.order) || 'desc';
  view.search = (schema.value.view && schema.value.view.default && schema.value.view.default.search) || '';
};

const setCollection = async () => {
  status.value = 'loading';
  const fullPath = route.query.folder ? route.query.folder : schema.value.path;

  const files = await github.getContents(props.owner, props.repo, props.branch, fullPath);

  if (!files) {
    status.value = 'error';
    return;
  }

  let errorCount = 0;
  collection.value = files.map(file => {
    if (file.type === 'blob' && (extension.value === '' || file.name.endsWith(`.${extension.value}`))) {
      let contentObject = {};
      if (serializedTypes.includes(format.value) && schema.value?.fields) {
        try {
          contentObject = serialization.parse(file.object.text, { format: format.value, delimiters: schema.value.delimiters });
        } catch (error) {
          console.warn(`Error parsing frontmatter for file "${file.path}":`, error);
          errorCount++;
        }
      }
      if (!schema.value.fields || schema.value.fields.length === 0) {
        // If no fields are defined in the schema, we fake a filename field
        contentObject.filename = file.name;
      }
      if (!contentObject.date && (!schema.value.filename || schema.value.filename.startsWith('{year}-{month}-{day}'))) {
        // If we couldn't get a date from the content and filenames have a date, we extract it
        const filenameDate = getDateFromFilename(file.name);
        if (filenameDate) {
          const dateFormat = fieldsSchemas.value['date']?.options?.format ?? 'YYYY-MM-DD';
          contentObject.date = moment(filenameDate.string, 'YYYY-MM-DD').format(dateFormat);
        }
      }

      return {
        sha: file.object.oid,
        filename: file.name,
        path: file.path,
        content: file.object.text,
        fields: contentObject,
        type: file.type,
      };
    } else if (file.type === 'tree') {
      return file;
    }
  }).filter(item => item !== undefined);
  // We warn the user some of the entries are messed up
  if (errorCount > 0) {
    const options = {
      delay: 10000,
      actions: [{
        label: 'Review settings',
        handler: () => router.push({ name: 'settings' }),
        primary: true
      }]
    };
    notifications.notify(`Failed to parse frontmatter for ${errorCount} ${errorCount > 1 ? 'entries' : 'entry'}. Your settings may be wrong.`, 'error', options);
  }

  setView();
  setSearch();

  status.value = '';
};

onMounted(() => {
  setCollection();
});

watch(() => props.name, (newName, oldName) => {
  setCollection();
});

watch(() => route.query.folder, () => {
  setCollection();
});
</script>