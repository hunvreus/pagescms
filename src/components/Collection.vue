<template>
  <main class="relative min-h-screen">
    <template v-if="status == 'loading'">
      <div class="loading"></div>
    </template>
    <template v-else-if="status == 'error'">
      <div class="error h-screen">
        <div class="text-center max-w-md">
          <h1 class="font-semibold tracking-tight text-2xl mb-2">Something's not right.</h1>
          <p class="text-neutral-400 dark:text-neutral-500 mb-6">Your configuration is probably wrong: this collection is set to the <code class="text-sm bg-neutral-100 dark:bg-neutral-850 rounded-lg p-1">{{ schema.path }}</code> folder in this repository.</p>
          <div class="flex gap-x-2 justify-center">
            <router-link class="btn-primary" :to="{name: 'settings'}">Review settings</router-link>
          </div>
        </div>
      </div>
    </template>
    <template v-else-if="collection">
      <div class="max-w-screen-xl	mx-auto p-4 lg:p-8">
        <header class="flex gap-x-2 mb-8 items-center">
          <h1 class="font-semibold tracking-tight text-2xl lg:text-4xl mr-auto">{{ schema.label }}</h1>
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
                <li><hr class="border-t border-neutral-150 dark:border-neutral-750 my-2"/></li>
                <li><button class="link w-full" @click="openAddFolderModal()">Add a folder</button></li>
              </ul>
            </template>
          </Dropdown>
          <router-link :to="{ name: 'new', query: { folder: folder } }" class="btn-primary">Add an entry</router-link>
        </header>

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
                <li><hr class="border-t border-neutral-150 dark:border-neutral-750 my-2"/></li>
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
        <template v-if="parentFolder || viewContents.folders || viewContents.files">
          <table class="table mb-4">
            <thead>
              <th v-for="field in view.config.fields" :class="[ field == view.config.primary ? 'primary-field' : '' ]">{{ fieldsSchemas[field].label }}</th>
              <th class="actions">&nbsp;</th>
            </thead>
            <tbody>
              <tr v-if="parentFolder" class="h-[47px]">
                <td :colspan="view.config.fields.length + 1" class="folder">
                  <router-link :to="parentFolder" class="flex gap-x-2 items-center font-medium">
                    <Icon name="CornerLeftUp" class="h-4 w-4 stroke-2 shrink-0"/>
                    ..
                  </router-link>
                </td>
              </tr>
              <tr v-for="item in viewContents.folders" :key="item.name" v-if="schema.subfolders !== false">
                <td class="folder">
                  <router-link :to="{ name: $route.name, query: { ...$route.query, folder: item.path } }" class="flex gap-x-2 items-center font-medium">
                    <Icon name="Folder" class="h-4 w-4 stroke-2 shrink-0"/>
                    <div class="truncate">{{ item.name }}</div>
                  </router-link>
                </td>
                <td :colspan="view.config.fields.length" class="actions text-right">
                  <div class="inline-flex">
                    <Dropdown :dropdownClass="'!max-w-none w-52'">
                      <template #trigger>
                        <button class="btn-icon-sm group-[.dropdown-active]:bg-neutral-100 dark:group-[.dropdown-active]:bg-neutral-850">
                          <Icon name="MoreVertical" class="h-4 w-4 stroke-2 shrink-0"/>
                        </button>
                      </template>
                      <template #content>
                        <ul>
                          <li>
                            <a class="link w-full" :href="`https://github.com/${props.owner}/${props.repo}/blob/${props.branch}/${item.path}`" target="_blank">
                              <div class="truncate">See folder on GitHub</div>
                              <Icon name="ExternalLink" class="h-4 w-4 stroke-2 shrink-0 ml-auto text-neutral-400 dark:text-neutral-500"/>
                            </a>
                          </li>
                        </ul>
                      </template>
                    </Dropdown>
                  </div>
                </td>
              </tr>
              <tr v-for="item in viewContents.files" :key="item.filename">
                <td v-for="field in view.config.fields" :class="[ field == view.config.primary ? 'primary-field' : '' ]">
                  <template v-if="field == view.config.primary">
                    <router-link :to="{ name: 'edit', params: { name: name, path: item.path } }" v-html="formatField(field, item.fields[field])"></router-link>
                  </template>
                  <div v-else v-html="formatField(field, item.fields[field])"></div>
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
                          <li><hr class="border-t border-neutral-150 dark:border-neutral-750 my-2"/></li>
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
        <div v-if="contents.files.length == 0" class="text-center rounded-xl bg-neutral-100 dark:bg-neutral-850 p-6">
          <div class="max-w-md mx-auto">
            <h2 class="font-semibold tracking-tight">No entries</h2>
            <p class="text-neutral-400">There are no entries yet for the "{{ schema.label }}" collection here.</p>
          </div>
          <div class="flex gap-x-2 justify-center mt-4">
            <router-link :to="{ name: 'new', query: { folder: folder } }" class="btn-primary-sm">Add an entry</router-link>
          </div>
        </div>
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
import github from '@/services/github';
import useYaml from '@/composables/useYaml';
import Dropdown from '@/components/utils/Dropdown.vue';
import Icon from '@/components/utils/Icon.vue';
import AddFolder from '@/components/file/AddFolder.vue';
import Rename from '@/components/file/Rename.vue';
import Delete from '@/components/file/Delete.vue';

const route = useRoute();
const { readYfm } = useYaml();

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

    return view.order === 'desc' ? -comparison : comparison;
  });

  return {
    files: viewFiles,
    folders: [...contents.value.folders],
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
      const chipClass = value ? 'chip-primary' : 'chip-secondary';
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

function openAddFolderModal() {
  addFolderComponent.value.openModal();
}

const handleFolderAdded = () => {
  setCollection();
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
  view.config.sort = (schema.value.view && schema.value.view.sort) || (collection.value[0] && collection.value[0].fields?.date ? ['date', view.config.primary] : [view.config.primary]);
  view.sort = (schema.value.view && schema.value.view.default && schema.value.view.default.sort) || (view.config.sort && view.config.sort.length) ? view.config.sort[0] : null;
  view.order = (schema.value.view && schema.value.view.default && schema.value.view.default.order) || 'desc';
  view.search = (schema.value.view && schema.value.view.default && schema.value.view.default.search) || '';
};

const setCollection = async () => {
  status.value = 'loading';

  const fullPath = route.query.folder ? route.query.folder : schema.value.path;
  const extension = schema.value.extension || 'md';

  const files = await github.getContents(props.owner, props.repo, props.branch, fullPath);
  if (!files) {
    status.value = 'error';
    return;
  }

  collection.value = files.map(file => {
    if (file.type === 'blob' && file.name.endsWith(`.${extension}`)) {
      const parsed = readYfm(file.object.text);
      const date = parsed.date ? new Date(parsed.date) : getDateFromFilename(file.name);
      return {
        sha: file.object.oid,
        filename: file.name,
        path: file.path,
        content: file.object.text,
        fields: parsed,
        type: file.type,
        ...(date && { fields: { ...parsed, date } }) // Add date if available
      };
    } else if (file.type === 'tree') {
      return file;
    }
  }).filter(item => item !== undefined);

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

watch(() => route.query.folder, () => {
  setCollection();
});
</script>