<template>
  <template v-if="status == 'loading'">
    <div class="loading"></div>
  </template>
  <template v-if="status == 'error'">
    <div class="error">
      <div class="text-center max-w-md">
        <h1 class="font-semibold text-2xl mb-2">Something's not right.</h1>
        <p class="text-neutral-400 dark:text-neutral-500 mb-6">Your configuration is probably wrong: <code class="text-sm bg-neutral-100 dark:bg-neutral-850 rounded-lg p-1">media</code> is set to "{{ root }}", which may not be an actual folder in this repository.</p>
        <div class="flex gap-x-2 justify-center">
          <router-link class="btn-primary" :to="{name: 'settings'}">Review settings</router-link>
        </div>
      </div>
    </div>
  </template>
  <template v-else>
    <div class="fb">
      <header class="fb-header flex mb-4 gap-x-2">
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
        <button v-else-if="path != root" @click="goTo(parentPath)" class="fb-parent-link group relative btn-icon-sm">
          <Icon name="CornerLeftUp" class="h-4 w-4 stroke-2 shrink-0"/>
          <div class="tooltip-top">Go to parent</div>
        </button>
        
        <button class="btn-icon-sm relative group ml-auto" @click="addFolder()">
          <Icon name="FolderPlus" class="h-4 w-4 stroke-2 shrink-0"/>
          <div class="spinner-white-sm" v-if="status == 'creating-folder'"></div>
          <div class="tooltip-top">Add a folder</div>
        </button>

        <button class="btn-sm" @click="uploadComponent.openFileInput()">
          <Icon name="Upload" class="h-4 w-4 stroke-2 shrink-0"/>
          Upload file
          <div class="spinner-white-sm" v-if="status == 'uploading'"></div>
        </button>
        
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

      <div :class="[ (status == 'processing') ? 'processing' : '' ]">
        <ul
          class="fb-files"
          :class="[ (layout == 'grid') ? 'fb-files-grid' : 'fb-files-list', isDragging ? 'fb-files-dragging' : '' ]"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="handleFileDrop"
        >
          <li v-for="item in filteredContents" :key="item.name" class="fb-files-item" :class="[ `fb-files-item-${item.type}` ]">
            <template v-if="item.type == 'dir'">
              <button @click="goTo(item.path)" class="fb-files-item-content fb-files-item-link">
                <div class="fb-files-item-icon">
                  <Icon name="Folder" width="100%" height="100%"/>
                </div>
                <div class="fb-files-item-name">{{ item.name }}</div>
              </button>
            </template>
            <template v-else>
              <div class="fb-files-item-content" @click="selectToggle(item)" :class="[ (selectedFiles.includes(item.path)) ? 'selected' : '', isSelectable ? 'cursor-pointer' : '' ]">
                <input v-if="isSelectable" type="checkbox" v-model="selectedFiles" :value="item.path" class="fb-files-item-checkbox"/>
                <div v-if="item.kind == 'image'" class="fb-files-item-image">
                  <img :src="item.download_url"/>
                </div>
                <div v-else class="fb-files-item-icon">
                  <Icon name="File" width="100%" height="100%"/>
                </div>
                <div class="fb-files-item-name">{{  item.name }}</div>
                <div class="fb-files-item-meta">
                  <div class="fb-files-item-meta-size">{{ $filters.fileSize(item.size) }}</div>
                </div>
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
      </div>
    </div>
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
// TODO: support initial path when opening file browser
// TODO: support history
import { ref, onMounted, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import githubImg from '@/services/githubImg';
import notifications from '@/services/notifications';
import github from '@/services/github';
import Dropdown from '@/components/utils/Dropdown.vue';
import Icon from '@/components/utils/Icon.vue';
import Delete from '@/components/file/Delete.vue';
import Rename from '@/components/file/Rename.vue';
import Upload from '@/components/file/Upload.vue';

const extensionCategories = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'svg', 'bmp', 'tif', 'tiff'],
  document: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'vxls', 'xlsx', 'txt', 'rtf'],
  video: ['mp4', 'avi', 'mov', 'wmv', 'flv'],
  audit: ['mp3', 'wav', 'aac', 'ogg', 'flac'],
  compressed: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz']
}

const route = useRoute();
const router = useRouter();

const emit = defineEmits(['files-selected']);

const props = defineProps({
  owner: String,
  repo: String,
  branch: String,
  default_path: String,
  root: String,
  default_layout: String,
  urlTracking: Boolean,
  hasBreadcrumb: Boolean,
  filterByCategories: Array,
  filterByExtensions: Array,
  isSelectable: Boolean,
  selected: String
});

const contents = ref(null);
const status = ref('loading');
const path = ref(props.root);
const layout = ref('grid');
const isDragging = ref(false);
const selectedFiles = ref([]);
const uploadComponent = ref(null);
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
  // if (selectedFiles.value.includes(item.path)) {
  //   selectedFiles.value = selectedFiles.value.filter((i) => i !== item.path);
  // } else {
  //   selectedFiles.value.push(item.path);
  // }
  if (selectedFiles.value.includes(item.path)) {
    selectedFiles.value = [];
  } else {
    selectedFiles.value = [ item.path ];
  }
  emit('files-selected', selectedFiles.value);
};

const filteredContents = computed(() => {
  let filteredExtensions = [];
  if (props.filterByExtensions) {
    filteredExtensions = props.filterByExtensions;
  }
  if (props.filterByCategories) {
    props.filterByCategories.forEach((category) => {
      filteredExtensions = filteredExtensions.concat(extensionCategories[category]);
    });
  }
  if (contents.value) {
    if (filteredExtensions.length === 0) return contents.value;
    return contents.value.filter((item) => {
      if (item.type === 'dir') {
        return true;
      }
      if (filteredExtensions.includes(item.extension)) {
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
  const fullPath = `${props.owner}/${props.repo}/${props.branch}/${path.value}`;
  let contentsData = null;

  if (githubImg.state.requests[fullPath] || githubImg.state.paths[fullPath]) {
    contentsData = await github.getContents(props.owner, props.repo, props.branch, path.value, false);
  } else {
    githubImg.state.requests[fullPath] = github.getContents(props.owner, props.repo, props.branch, path.value, false);
    contentsData = await githubImg.state.requests[fullPath];
    githubImg.addRawUrls(props.owner, props.repo, props.branch, contentsData);
    delete githubImg.state.requests[fullPath];
    githubImg.state.paths[fullPath] = true;
  }

  if (contentsData) {
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
    
    // Sort by type first and name second
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
  } else if (props.default_layout) {
    layout.value = props.default_layout;
  } else {
    layout.value = 'grid';
  }
  router.replace({ query: { ...route.query, layout: layout.value } });
};

const addFolder = async () => {
  const folderName = prompt('Enter a name for the new folder:');
  if (folderName) {
    status.value = 'creating-folder';
    const data = await github.saveFile(props.owner, props.repo, props.branch, `${path.value}/${folderName}/.gitkeep`, '');
    if (data) {
      notifications.notify(`Folder "${folderName}" successfully created.`, 'success');
      setContents();
    } else {
      notifications.notify(`Folder "${folderName}" couldn't be created.`, 'error');
    }
    status.value = '';
  }
};

const checkAndRedirectPath = () => {
  if (props.root && !path.value.startsWith(props.root)) {
    notifications.notify(`Root folder is set to "${props.root}".`, 'warning');
    goTo();
  }
};

const goTo = (destination) => {
  path.value = destination;
};

onMounted(async () => {
  checkAndRedirectPath();
  setLayout();
  await setContents();
});

watch(path, async (newValue, oldValue) => {
  if (newValue !== oldValue) {
    checkAndRedirectPath();
    await setContents();
  }
});

</script>