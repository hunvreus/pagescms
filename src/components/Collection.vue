<template>
  <main class="relative min-h-screen">
    <template v-if="status == 'loading'">
      <div class="loading"></div>
    </template>
    <template v-else-if="status == 'error'">
      <div class="error h-screen">
        <div class="text-center max-w-md">
          <h1 class="font-semibold text-2xl mb-2">Something's not right.</h1>
          <p class="text-neutral-400 mb-6">Your configuration is probably wrong: this collection is set to the "{{ schema.path }}" folder in this repository.</p>
          <div class="flex gap-x-2 justify-center">
            <router-link class="btn" :to="{name: 'settings'}">Review settings</router-link>
          </div>
        </div>
      </div>
    </template>
    <template v-else-if="collection">
      <div class="max-w-screen-xl	mx-auto p-4 lg:p-8">
        <header class="flex gap-x-2 mb-8 items-center">
          <h1 class="font-semibold text-2xl lg:text-4xl tracking-tight">{{ schema.label }}</h1>
          <router-link :to="{ name: 'new' }" class="btn-primary ml-auto">Add an entry</router-link>
        </header>

        <div class="flex justify-between items-center mb-4 flex-row gap-x-2">
          <input type="text" v-model="view.search" placeholder="Search by keywords" class="!rounded-full !px-5 w-full">
          
          <Dropdown :elementClass="'z-30'" :dropdownClass="'!max-w-none'">
            <template #trigger>
              <button class="btn-icon group-[.dropdown-active]:bg-neutral-100">
                <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 12H18M3 6H21M9 18H15"/>
                </svg>
              </button>
            </template>
            <template #content>
              <ul class="sticky">
                <li><div class="font-medium text-xs pb-1 px-3 text-neutral-400">Order by</div></li>
                <li v-for="sortField in view.config.sort" :key="sortField">
                  <button class="link w-full" @click="view.sort = sortField">
                    {{ fieldsSchemas[sortField]?.label || sortField }}
                    <svg v-if="view.sort === sortField" class="shrink-0 h-4 w-4 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                      <path d="M20 6L9 17L4 12"/>
                    </svg>
                  </button>
                </li>
                <li><hr class="border-t border-neutral-150 my-2"/></li>
                <li>
                  <button class="link w-full" @click="view.sort_order = 'asc'">
                    Ascendant
                    <svg v-if="view.sort_order === 'asc'" class="shrink-0 h-4 w-4 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                      <path d="M20 6L9 17L4 12"/>
                    </svg>
                  </button>
                </li>
                <li>
                  <button class="link w-full" @click="view.sort_order = 'desc'">
                    Descendant
                    <svg v-if="view.sort_order === 'desc'" class="shrink-0 h-4 w-4 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                      <path d="M20 6L9 17L4 12"/>
                    </svg>
                  </button>
                </li>
              </ul>
            </template>
          </Dropdown>
        </div>

        <div v-if="collection.length == 0" class="text-center rounded-xl bg-neutral-100 p-6">
          <div class="max-w-md mx-auto">
            <h2 class="font-semibold">This collection is empty</h2>
            <p class="text-neutral-400">The "{{ schema.label }}" collection has no entry yet in the "{{ schema.path }}" folder.</p>
          </div>
          <div class="flex gap-x-2 justify-center mt-4">
            <router-link :to="{ name: 'new' }" class="btn-primary-sm">Add an entry</router-link>
          </div>
        </div>
        <div v-else-if="viewContents.files.length == 0" class="text-center p-6 max-w-md mx-auto">
          <h2 class="font-medium">No results</h2>
          <p class="text-neutral-400">There are no results for your search terms. You can use wildcard (e.g. "keyword*") or field specific search (e.g. "title:keyword").</p>
          <div class="flex gap-x-2 justify-center mt-4">
            <button class="btn-sm" @click="view.search = ''">Clear search terms</button>
          </div>
        </div>
        <template v-else>
          <table class="table">
            <thead>
              <th v-for="field in view.config.fields" :class="[ field == view.config.primary ? 'primary-field' : '' ]">{{ fieldsSchemas[field].label }}</th>
              <th class="actions">&nbsp;</th>
            </thead>
            <tbody>
              <tr v-if="parentFolder">
                <td :colspan="view.config.fields.length + 1" class="folder">
                  <router-link :to="parentFolder" class="flex gap-x-2 items-center font-medium">
                    <svg class="shrink-0 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                      <path d="M21 20H17.6C14.2397 20 12.5595 20 11.2761 19.346C10.1471 18.7708 9.2292 17.8529 8.65396 16.7239C8 15.4405 8 13.7603 8 10.4V4M8 4L13 9M8 4L3 9"/>
                    </svg>
                    ..
                  </router-link>
                </td>
              </tr>
              <tr v-for="item in viewContents.folders" :key="item.name">
                <td :colspan="view.config.fields.length + 1" class="folder">
                  <router-link :to="{ name: $route.name, query: { ...$route.query, subfolder: item.path } }" class="flex gap-x-2 items-center font-medium">
                    <svg class="shrink-0 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                      <path d="M13 7L11.8845 4.76892C11.5634 4.1268 11.4029 3.80573 11.1634 3.57116C10.9516 3.36373 10.6963 3.20597 10.4161 3.10931C10.0992 3 9.74021 3 9.02229 3H5.2C4.0799 3 3.51984 3 3.09202 3.21799C2.71569 3.40973 2.40973 3.71569 2.21799 4.09202C2 4.51984 2 5.0799 2 6.2V7M2 7H17.2C18.8802 7 19.7202 7 20.362 7.32698C20.9265 7.6146 21.3854 8.07354 21.673 8.63803C22 9.27976 22 10.1198 22 11.8V16.2C22 17.8802 22 18.7202 21.673 19.362C21.3854 19.9265 20.9265 20.3854 20.362 20.673C19.7202 21 18.8802 21 17.2 21H6.8C5.11984 21 4.27976 21 3.63803 20.673C3.07354 20.3854 2.6146 19.9265 2.32698 19.362C2 18.7202 2 17.8802 2 16.2V7Z"/>
                    </svg>
                    <div class="truncate">{{ item.name }}</div>
                  </router-link>
                </td>
              </tr>
              <tr v-for="item in viewContents.files" :key="item.filename">
                <td v-for="field in view.config.fields" :class="[ field == view.config.primary ? 'primary-field' : '' ]">
                  <template v-if="field == view.config.primary">
                    <router-link :to="{ name: 'edit', params: { name: name, path: item.path } }" v-html="formatField(field, item.fields[field])"></router-link>
                  </template>
                  <div v-else v-html="formatField(field, item.fields[field])"></div>
                </td>
                <td class="actions">
                  <div class="inline-flex">
                    <router-link :to="{ name: 'edit', params: { name: name, path: item.path } }" class="btn-sm !border-r-0 !rounded-r-none">Edit</router-link>
                    <Dropdown :dropdownClass="'!max-w-none w-48'">
                      <template #trigger>
                        <button class="btn-icon-sm group-[.dropdown-active]:bg-neutral-100 !rounded-l-none">
                          <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z"/>
                            <path d="M12 6C12.5523 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4C11.4477 4 11 4.44772 11 5C11 5.55228 11.4477 6 12 6Z"/>
                            <path d="M12 20C12.5523 20 13 19.5523 13 19C13 18.4477 12.5523 18 12 18C11.4477 18 11 18.4477 11 19C11 19.5523 11.4477 20 12 20Z"/>
                          </svg>
                        </button>
                      </template>
                      <template #content>
                        <ul>
                          <li>
                            <a class="link w-full" :href="`https://github.com/${props.owner}/${props.repo}/blob/${props.branch}/${item.path}`" target="_blank">
                              <div class="truncate">See file on GitHub</div>
                              <svg class="shrink-0 h-4 w-4 ml-auto text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                                <path d="M21 9L21 3M21 3H15M21 3L13 11M10 5H7.8C6.11984 5 5.27976 5 4.63803 5.32698C4.07354 5.6146 3.6146 6.07354 3.32698 6.63803C3 7.27976 3 8.11984 3 9.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21H14.2C15.8802 21 16.7202 21 17.362 20.673C17.9265 20.3854 18.3854 19.9265 18.673 19.362C19 18.7202 19 17.8802 19 16.2V14"/>
                              </svg>
                            </a>
                          </li>
                          <li><hr class="border-t border-neutral-150 my-2"/></li>
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
      </div>
      <Rename
        ref="renameComponent"
        :owner="props.owner"
        :repo="props.repo"
        :branch="props.branch"
        :path="renamePath"
        @renamed="handleRenamed"
      />
      <Delete
        ref="deleteComponent"
        :owner="props.owner"
        :repo="props.repo"
        :branch="props.branch"
        :path="deletePath"
        :sha="deleteSha"
        @deleted="handleDeleted"
      />
    </template>
  </main>
</template>

<script setup>
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import lunr from 'lunr';
import moment from 'moment';
import github from '@/services/github';
import useYfm from '@/composables/useYfm';
import Dropdown from '@/components/utils/Dropdown.vue';
import Rename from '@/components/file/Rename.vue';
import Delete from '@/components/file/Delete.vue';

const route = useRoute();
const { loadYfm } = useYfm();

const props = defineProps({
  owner: String,
  repo: String,
  branch: String,
  name: String,
  config: Object,
  path: String
});

const renameComponent = ref(null);
const renamePath = ref('');
const deleteComponent = ref(null);
const deletePath = ref('');
const deleteSha = ref('');
const collection = ref(null);
const status = ref('loading');
const schema = computed(() => props.config.content.find(item => item.name === props.name));
const fields = computed(() => schema.value.fields.map(field => field.name));
const fieldsSchemas = computed(() => {
  const schemas = {};
  schema.value.fields.forEach(field => {
    schemas[field.name] = field;
  });
  return schemas;
});
const parentFolder = computed(() => {
  if (!route.query.subfolder) return null;
  const pathSegments = route.query.subfolder.split('/').filter(Boolean);
  pathSegments.pop();
  const parentPath = pathSegments.join('/');

  return {
    name: route.name,
    query: { ...route.query, subfolder: (parentPath == schema.value.path) ? null : parentPath }
  };
});
const view = reactive({
  config: {
    fields: [],
    primary: '',
    sort: [],
    filter: null,
  },
  sort: null,
  sort_order: 'asc',
  filter: null,
  filter_value: null,
  search: '',
});
const viewContents = computed(() => {
  let files = collection.value.filter(item => item.type === 'blob');
  let folders = collection.value.filter(item => item.type === 'tree');
  let viewFiles = files;
  
  // Apply search filter
  if (view.search.trim()) {
    const searchResults = searchIndex.search(`${view.search.trim()}`);
    viewFiles = searchResults.map(result => {
      return files.find(item => item.filename === result.ref);
    });
  }
  
  // Apply sorting
  viewFiles = viewFiles.slice().sort((a, b) => {
    const sortKey = view.sort;
    // Default value when sortKey is not present or fields is undefined.
    const defaultValue = '';
    // Check if fields is defined and has the sortKey
    let valA = (a.fields && a.fields[sortKey] !== undefined) ? a.fields[sortKey] : defaultValue;
    let valB = (b.fields && b.fields[sortKey] !== undefined) ? b.fields[sortKey] : defaultValue;
    // Convert booleans to integers to help with comparison with null/undefined
    if (typeof valA === 'boolean') valA = valA ? 2 : 1;
    if (typeof valB === 'boolean') valB = valB ? 2 : 1;
    // Convert to lowercase if the value is a string
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    let comparison = 0;
    if (valA < valB) {
      comparison = -1;
    } else if (valA > valB) {
      comparison = 1;
    }

    return view.sort_order === 'desc' ? -comparison : comparison;
  });

  return {
    files: viewFiles,
    folders,
  };
});

const formatField = (field, value) => {
  if (value === null || value === undefined) {
    return '';
  }
  switch (fieldsSchemas.value[field]?.type) {
    case 'date':
      return moment(value).format('ll');
    case 'boolean':
      const chipClass = value ? 'chip-true' : 'chip-false';
      return `<span class="${chipClass}">${value ? 'True' : 'False'}</span>`;
    default:
      return value;
  }
};

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

let searchIndex;

const setSearch = () => {
  searchIndex = lunr(function () {
    this.ref('filename');
    schema.value.fields.forEach(field => {
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
  view.config.fields = (schema.value.view && schema.value.view.fields) || [ fields.value[0] ];
  view.config.primary = (schema.value.view && schema.value.view.primary) || (fields.value.includes('title') ? 'title' : fields.value[0]);
  view.config.sort = (schema.value.view && schema.value.view.sort) || (collection.value[0] && collection.value[0].fields.date ? ['date', view.config.primary] : [view.config.primary]);
  view.config.filter = (schema.value.view && schema.value.view.filter) || null;
  view.sort = (schema.value.view && schema.value.view.default && schema.value.view.default.sort) || (view.config.sort && view.config.sort.length) ? view.config.sort[0] : null;
  view.sort_order = (schema.value.view && schema.value.view.default && schema.value.view.default.sort_order) || 'desc';
  view.search = (schema.value.view && schema.value.view.default && schema.value.view.default.search) || '';
};

const setCollection = async () => {
  status.value = 'loading';

  const fullPath = route.query.subfolder ? route.query.subfolder : schema.value.path;

  const files = await github.getContents(props.owner, props.repo, props.branch, fullPath);
  if (!files) {
    status.value = 'error';
    return;
  }

  collection.value = files.map(file => {
    if (file.type === 'blob') {
      const parsed = loadYfm(file.object.text);
      const item = {
        sha: file.object.oid,
        filename: file.name,
        path: file.path,
        content: file.object.text,
        fields: parsed,
        type: file.type,
      };
      
      const date = parsed.date ? new Date(parsed.date) : getDateFromFilename(file.name);
      if (date) {
        item.fields.date = date; // TODO: Just for Jekyll?
      }
      
      return item;
    }
    return file;
  });

  setView();
  setSearch();

  status.value = '';
};

const getDateFromFilename = (filename) => {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})-/);
  if (match) {
    return new Date(match[1]);
  }
  return null;
};

onMounted(() => {
  setCollection();
});

watch(() => props.name, (newName, oldName) => {
  setCollection();
});

watch(() => route.query.subfolder, () => {
  setCollection();
});
</script>