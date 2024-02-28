<template>
  <!-- Loading screen -->
  <template v-if="status == 'loading'">
    <div class="loading"></div>
  </template>
  <!-- Config error -->
  <template v-if="status == 'error'">
    <div class="error">
      <div class="text-center max-w-md">
        <h1 class="font-semibold text-2xl mb-2">Something's not right.</h1>
        <p class="text-neutral-400 dark:text-neutral-500 mb-6">Either your <code class="text-sm bg-neutral-100 dark:bg-neutral-850 rounded-lg p-1">media</code> settings are wrong or you may need to create the <code class="text-sm bg-neutral-100 dark:bg-neutral-850 rounded-lg p-1">{{ root }}</code> folder in this repository.</p>
        <div class="flex gap-x-2 justify-center">
          <router-link class="btn-primary" :to="{name: 'settings'}">Review settings</router-link>
        </div>
      </div>
    </div>
  </template>
  <!-- File browser -->
  <template v-else>
    <div class="fb">
      <header class="fb-header flex mb-4 gap-x-2">
        <!-- Breadcrumb -->
        <ol v-if="breadcrumb" class="fb-breadcrumb flex items-center">
          <li v-if="path != root">
            <button @click="goTo(root)" class="fb-parent-link group relative btn-icon-sm !rounded-r-none">
              <Icon name="Home" class="h-4 w-4 stroke-2 shrink-0"/>
              <div class="tooltip-top">Home</div>
            </button>
          </li>
          <template v-for="(segment, index) in breadcrumb" :key="index">
            <li class="fb-breadcrumb-segment fb-breadcrumb-link">
              <template v-if="index < breadcrumb.length - 1">
                <button @click="goTo(segment.path)" class="btn-sm !rounded-none !border-l-0">
                  {{ segment.label }}
                </button>
              </template>
              <template v-else>
                <div class="fb-breadcrumb-segment fb-breadcrumb-leaf btn-sm !cursor-default	!text-neutral-400 dark:!text-neutral-500 !font-normal !rounded-l-none !border-l-0">
                  {{ segment.label }}
                </div>
              </template>
            </li>
          </template>
        </ol>
        <!-- Go to parent -->
        <button v-else-if="path != root" @click="goTo(parentPath)" class="fb-parent-link group relative btn-icon-sm">
          <Icon name="CornerLeftUp" class="h-4 w-4 stroke-2 shrink-0"/>
          <div class="tooltip-top">Go to parent</div>
        </button>
        <!-- Add a folder -->
        <button class="btn-icon-sm relative group ml-auto" @click="openAddFolderModal()">
          <Icon name="FolderPlus" class="h-4 w-4 stroke-2 shrink-0"/>
          <div class="spinner-white-sm" v-if="status == 'creating-folder'"></div>
          <div class="tooltip-top">Add a folder</div>
        </button>
        <!-- Upload a file -->
        <button class="btn-sm" @click="uploadComponent.openFileInput()">
          <Icon name="Upload" class="h-4 w-4 stroke-2 shrink-0"/>
          Upload file
          <div class="spinner-white-sm" v-if="status == 'uploading'"></div>
        </button>
        <!-- Toggle layout -->
        <div class="fb-view flex">
          <button @click="setLayout('list')" class="fb-view-list group btn-icon-sm !rounded-r-none relative" :disabled="layout == 'list'" :class="{ '!bg-neutral-200 dark:!bg-neutral-700': (layout == 'list') }">
            <Icon name="LayoutList" class="h-4 w-4 stroke-2 shrink-0"/>
            <div class="tooltip-top">List view</div>
          </button>
          <button @click="setLayout('grid')" class="fb-view-grid group btn-icon-sm !rounded-l-none !border-l-0 relative" :disabled="layout == 'grid'" :class="{ '!bg-neutral-200 dark:!bg-neutral-700': (layout == 'grid') }">
            <Icon name="LayoutGrid" class="h-4 w-4 stroke-2 shrink-0"/>
            <div class="tooltip-top-right">Grid view</div>
          </button>
        </div>
      </header>
      <!-- Content -->
      <div
        class="fb-files-wrapper" :class="[ (status == 'processing') ? 'processing' : '', isDragging ? 'fb-files-wrapper-dragging' : ''  ]"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="handleFileDrop"
      >
        <ul v-if="filteredContents.length > 0" class="fb-files" :class="[ (layout == 'grid') ? 'fb-files-grid' : 'fb-files-list' ]">
          <li v-for="item in filteredContents" :key="item.name" class="fb-files-item" :class="[ `fb-files-item-${item.type}` ]">
            <!-- Folders -->
            <template v-if="item.type == 'dir'">
              <button @click="goTo(item.path)" class="fb-files-item-content fb-files-item-link">
                <div class="fb-files-item-icon">
                  <Icon name="Folder" width="100%" height="100%"/>
                </div>
                <div class="fb-files-item-name">{{ item.name }}</div>
              </button>
            </template>
            <!-- Files -->
            <template v-else>
              <div class="fb-files-item-content" @click="selectToggle(item)" :class="[ (selectedFiles.includes(item.path)) ? 'selected' : '', isSelectable ? 'cursor-pointer' : '' ]">
                <input v-if="isSelectable" type="checkbox" v-model="selectedFiles" :value="item.path" class="fb-files-item-checkbox"/>
                <div v-if="item.kind == 'image'" class="fb-files-item-image">
                  <Image :path="item.path"/>
                </div>
                <div v-else class="fb-files-item-icon">
                  <Icon name="File" width="100%" height="100%"/>
                </div>
                <div class="fb-files-item-name">{{  item.name }}</div>
                <div class="fb-files-item-meta">
                  <div class="fb-files-item-meta-size">{{ $filters.fileSize(item.size) }}</div>
                </div>
                <!-- Options -->
                <div class="fb-files-item-options">
                  <Dropdown :dropdownClass="'!max-w-none w-48'">
                    <template #trigger>
                      <button class="fb-files-item-options-btn">
                        <Icon name="MoreHorizontal" class="h-4 w-4 stroke-2 shrink-0"/>
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
                        <li><button class="link-danger w-full" @click="openDeleteModal(item)">Delete</button></li>
                      </ul>
                    </template>
                  </Dropdown>
                </div>
              </div>
            </template>
          </li>
        </ul>
        <!-- Empty folder -->
        <div v-else class="text-center rounded-xl bg-neutral-100 dark:bg-neutral-850 p-6">
          <div class="max-w-md mx-auto">
            <h2 class="font-semibold tracking-tight">Empty folder</h2>
            <p class="text-neutral-400 dark:text-neutral-500"><template v-if="filteredExtensions.length > 0">There are no maching files in this folder ({{ filteredExtensions.join(', ') }})</template><template v-else>There are no files in this folder</template>. You can drag-and-drop files here or use the "Upload file" button to add files.</p>
          </div>
        </div>
        <div class="fb-drag-message">
          <div class="flex gap-x-2 font-medium items-center">
            <Icon name="Import" class="h-6 w-6 stroke-[1.5] shrink-0"/>
            <span>Drop your files here</span>
          </div>
        </div>
      </div>
    </div>
    <AddFolder
      ref="addFolderComponent"
      :owner="props.owner"
      :repo="props.repo"
      :branch="props.branch"
      :path="path"
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
    <Upload
      ref="uploadComponent"
      :owner="props.owner"
      :repo="props.repo"
      :branch="props.branch"
      :path="path"
      @processed="handleUploaded"
    />
  </template>
</template>

<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import githubImg from '@/services/githubImg';
import github from '@/services/github';
import Dropdown from '@/components/utils/Dropdown.vue';
import Icon from '@/components/utils/Icon.vue';
import Delete from '@/components/file/Delete.vue';
import AddFolder from '@/components/file/AddFolder.vue';
import Image from '@/components/file/Image.vue';
import Rename from '@/components/file/Rename.vue';
import Upload from '@/components/file/Upload.vue';

// Categories for filtering
const extensionCategories = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'svg', 'bmp', 'tif', 'tiff'],
  document: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'vxls', 'xlsx', 'txt', 'rtf'],
  video: ['mp4', 'avi', 'mov', 'wmv', 'flv'],
  audio: ['mp3', 'wav', 'aac', 'ogg', 'flac'],
  compressed: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz']
}

const route = useRoute();
const router = useRouter();

const emit = defineEmits(['files-selected']);

const props = defineProps({
  owner: String,
  repo: String,
  branch: String,
  root: { type: String, default: '' },
  defaultPath: String,
  defaultLayout: String,
  hasBreadcrumb: Boolean,
  filterByCategories: Array,
  filterByExtensions: Array,
  isSelectable: Boolean,
  selected: String,
  selectMax: Number
});

const contents = ref(null);
const status = ref('loading');
const path = ref(props.root);
const layout = ref('grid');
const isDragging = ref(false);
const selectedFiles = ref([]);
const uploadComponent = ref(null);
const addFolderComponent = ref(null);
const renameComponent = ref(null);
const renamePath = ref('');
const deleteComponent = ref(null);
const deletePath = ref('');
const deleteSha = ref('');

const parentPath = computed(() => {
  const segments = path.value.split('/');
  if (segments.length > 1) {
    segments.pop();
    return segments.join('/');
  }
  return '';
});

const handleUploaded = () => {
  setContents();
};

const handleFileDrop = async (event) => {
  isDragging.value = false;
  const files = event.dataTransfer.files;
  await uploadComponent.value.processFiles(files);
  setContents();
};

function openAddFolderModal() {
  addFolderComponent.value.openModal();
}

const handleFolderAdded = () => {
  setContents();
};

function openRenameModal(item) {
  renamePath.value = item.path;
  renameComponent.value.openModal();
}

const handleRenamed = (renamedData) => {
  const { renamedPath, renamedSha } = renamedData;
  const item = contents.value.find(item => item.path === renamePath.value);
  item.path = renamedPath;
  item.name = renamedPath.split('/').pop();
};

function openDeleteModal(item) {
  deletePath.value = item.path;
  deleteSha.value = item.sha;
  deleteComponent.value.openModal();
}

const handleDeleted = () => {
  const index = contents.value.findIndex(item => item.path === deletePath.value);
  contents.value.splice(index, 1);
};

const selectToggle = (item) => {
  if (!props.isSelectable) return;
  if (selectedFiles.value.includes(item.path)) {
    selectedFiles.value = selectedFiles.value.filter((i) => i !== item.path);
  } else {
    if (props.selectMax != null && selectedFiles.value.length >= props.selectMax) {
      selectedFiles.value.shift();
    }
    selectedFiles.value.push(item.path);
  }
  emit('files-selected', selectedFiles.value);
};

const filteredExtensions = computed(() => {
  if (props.filterByExtensions) {
    return props.filterByExtensions;
  } else if (props.filterByCategories) {
    return props.filterByCategories.reduce((acc, category) => acc.concat(extensionCategories[category]), []);
  }
  return [];
});

const filteredContents = computed(() => {
  if (contents.value) {
    if (filteredExtensions.value.length === 0) return contents.value;
    return contents.value.filter((item) => {
      if (item.type === 'dir') {
        return true;
      }
      if (filteredExtensions.value.includes(item.extension)) {
        return true;
      }
      return false;
    });
  }
  return [];
});

const breadcrumb = computed(() => {
  if (props.hasBreadcrumb) {
    const cleanedPath = path.value.replace(props.root, '');
    const pathSegments = cleanedPath.split('/').filter(Boolean);
    const breadcrumbSegments = pathSegments.map((segment, index) => {
      const fullPath = props.root + '/' + pathSegments.slice(0, index + 1).join('/');
      return {
        label: segment,
        path: fullPath
      };
    });

    return breadcrumbSegments;
  }
});

const setContents = async () => {
  status.value = 'loading';
  let fullPath = `${props.owner}/${props.repo}/${props.branch}`;
  fullPath = path.value ? `${fullPath}/${path.value}` : fullPath;
  let contentsData = null;
  // Since we're fetching the folder's content, we update the githubImg cache at the same time
  if (!githubImg.state.requests[fullPath]) {
    githubImg.state.requests[fullPath] = github.getContents(props.owner, props.repo, props.branch, path.value, false);
  }
  contentsData = await githubImg.state.requests[fullPath];
  delete githubImg.state.requests[fullPath];
  if (contentsData) {
    // We update the githubImg cache
    githubImg.state.cache[fullPath] = { time: Date.now(), files: {} };
    contentsData.forEach(file => {
      githubImg.state.cache[fullPath].files[file.name] = file.download_url;
    });
    // We build the contents of our current folder
    contents.value = contentsData.map((item) => {
      let extension = '';
      let kind = 'other';

      if (item.type === 'file') {
        const parts = item.name.split('.');
        if (parts.length > 1 && parts[0] !== '') {
          extension = parts.pop().toLowerCase();
          kind = Object.keys(extensionCategories).find(key => extensionCategories[key].includes(extension)) || 'other';
        }
      }

      return { ...item, extension, kind };
    });
    // We sort by type first and name second
    contents.value = contents.value.sort((a, b) => { 
      if (a.type !== b.type) {
        return a.type === 'dir' ? -1 : 1;
      }
      
      return a.name.localeCompare(b.name);
    });
  } else {
    status.value = 'error';
    return;
  }
  status.value = '';
};

const setLayout = (mode = null) => {
  if (mode) {
    layout.value = mode;
  } else if (route.query.layout) {
    layout.value = route.query.layout;
  } else if (props.defaultLayout) {
    layout.value = props.defaultLayout;
  } else {
    layout.value = 'grid';
  }
  router.replace({ query: { ...route.query, layout: layout.value } });
};

const goTo = (destination) => {
  if (destination === undefined) {
    destination = props.defaultPath || props.root;
  }
  if (props.root && !destination.startsWith(props.root)) {
    router.replace({ query: { ...route.query, 'fb-path': props.root } });
    console.warn(`You tried to access "${destination}" but the root is set to "${props.root}". Redirecting to "${props.root}".`);
  } else if (destination !== path.value) {
    path.value = destination;
    router.push({ query: { ...route.query, 'fb-path': destination } });
  }
};

const selectFile = (file) => {
  if (file) {
    selectedFiles.value = [ file ];
    const segments = file.split('/').filter(Boolean);
    segments.pop();
    const parentPath = segments.join('/');
    goTo(parentPath);
  } else {
    selectedFiles.value = [];
  }
};

onMounted(async () => {
  if (props.defaultPath) {
    goTo(props.defaultPath);
  } else if (route.query['fb-path']) {  
    goTo(route.query['fb-path']);
  } else {
    goTo(props.root);
  }
  selectFile(props.selected);
  setLayout();
  await setContents();
});

watch(() => props.selected, (newValue, oldValue) => {
  if (newValue != null) {
    selectFile(newValue);
  }
});

watch(path, async (newValue, oldValue) => {
  if (newValue !== oldValue) {
    await setContents();
  }
});

watch(() => route.query['fb-path'], (newValue) => {
  if (newValue !== path.value) {
    goTo(newValue);
  }
});

defineExpose({ goTo, selectFile });
</script>