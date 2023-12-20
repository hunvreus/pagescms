<template>
  <template v-if="status == 'loading'">
    <div class="loading"></div>
  </template>
  <template v-if="status == 'error'">
    <div class="error">
      <div class="text-center max-w-md">
        <h1 class="font-semibold text-2xl mb-2">Something's not right.</h1>
        <p class="text-neutral-400 mb-6">Your configuration is probably wrong: <code>media</code> is set to "{{ root }}", which may not be an actual folder in this repository.</p>
        <div class="flex gap-x-2 justify-center">
          <router-link class="btn" :to="{name: 'settings'}">Review settings</router-link>
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
              <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 21V13.6C9 13.0399 9 12.7599 9.10899 12.546C9.20487 12.3578 9.35785 12.2049 9.54601 12.109C9.75992 12 10.0399 12 10.6 12H13.4C13.9601 12 14.2401 12 14.454 12.109C14.6422 12.2049 14.7951 12.3578 14.891 12.546C15 12.7599 15 13.0399 15 13.6V21M11.0177 2.764L4.23539 8.03912C3.78202 8.39175 3.55534 8.56806 3.39203 8.78886C3.24737 8.98444 3.1396 9.20478 3.07403 9.43905C3 9.70352 3 9.9907 3 10.5651V17.8C3 18.9201 3 19.4801 3.21799 19.908C3.40973 20.2843 3.71569 20.5903 4.09202 20.782C4.51984 21 5.07989 21 6.2 21H17.8C18.9201 21 19.4802 21 19.908 20.782C20.2843 20.5903 20.5903 20.2843 20.782 19.908C21 19.4801 21 18.9201 21 17.8V10.5651C21 9.9907 21 9.70352 20.926 9.43905C20.8604 9.20478 20.7526 8.98444 20.608 8.78886C20.4447 8.56806 20.218 8.39175 19.7646 8.03913L12.9823 2.764C12.631 2.49075 12.4553 2.35412 12.2613 2.3016C12.0902 2.25526 11.9098 2.25526 11.7387 2.3016C11.5447 2.35412 11.369 2.49075 11.0177 2.764Z"/>
              </svg>
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
                <div class="fb-breadcrumb-segment fb-breadcrumb-leaf btn-sm !cursor-default	!text-neutral-400 !font-normal !rounded-l-none !border-l-0">
                  {{ segment.label }}
                </div>
              </template>
            </li>
          </template>
        </ol>
        <button v-else-if="path != root" @click="goTo(parentPath)" class="fb-parent-link group relative btn-icon-sm">
          <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 20H17.6C14.2397 20 12.5595 20 11.2761 19.346C10.1471 18.7708 9.2292 17.8529 8.65396 16.7239C8 15.4405 8 13.7603 8 10.4V4M8 4L13 9M8 4L3 9"/>
          </svg>
          <div class="tooltip-top">Go to parent</div>
        </button>
        
        <button class="btn-icon-sm relative group ml-auto" @click="addFolder()">
          <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
            <path d="M13 7L11.8845 4.76892C11.5634 4.1268 11.4029 3.80573 11.1634 3.57116C10.9516 3.36373 10.6963 3.20597 10.4161 3.10931C10.0992 3 9.74021 3 9.02229 3H5.2C4.0799 3 3.51984 3 3.09202 3.21799C2.71569 3.40973 2.40973 3.71569 2.21799 4.09202C2 4.51984 2 5.0799 2 6.2V7M2 7H17.2C18.8802 7 19.7202 7 20.362 7.32698C20.9265 7.6146 21.3854 8.07354 21.673 8.63803C22 9.27976 22 10.1198 22 11.8V16.2C22 17.8802 22 18.7202 21.673 19.362C21.3854 19.9265 20.9265 20.3854 20.362 20.673C19.7202 21 18.8802 21 17.2 21H6.8C5.11984 21 4.27976 21 3.63803 20.673C3.07354 20.3854 2.6146 19.9265 2.32698 19.362C2 18.7202 2 17.8802 2 16.2V7ZM12 17V11M9 14H15"/>
          </svg>
          <div class="spinner-white-sm" v-if="status == 'creating-folder'"></div>
          <div class="tooltip-top">Add a folder</div>
        </button>

        <button class="btn-sm" @click="uploadComponent.openFileInput()">
          <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 15V16.2C21 17.8802 21 18.7202 20.673 19.362C20.3854 19.9265 19.9265 20.3854 19.362 20.673C18.7202 21 17.8802 21 16.2 21H7.8C6.11984 21 5.27976 21 4.63803 20.673C4.07354 20.3854 3.6146 19.9265 3.32698 19.362C3 18.7202 3 17.8802 3 16.2V15M17 8L12 3M12 3L7 8M12 3V15"/>
          </svg>
          Upload file
          <div class="spinner-white-sm" v-if="status == 'uploading'"></div>
        </button>
        
        <div class="fb-view flex">
          <button @click="setLayout('list')" class="fb-view-list group btn-icon-sm !rounded-r-none relative" :disabled="layout == 'list'" :class="{ '!bg-neutral-200': (layout == 'list') }">
            <svg class="h-4 v-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 12L9 12M21 6L9 6M21 18L9 18M5 12C5 12.5523 4.55228 13 4 13C3.44772 13 3 12.5523 3 12C3 11.4477 3.44772 11 4 11C4.55228 11 5 11.4477 5 12ZM5 6C5 6.55228 4.55228 7 4 7C3.44772 7 3 6.55228 3 6C3 5.44772 3.44772 5 4 5C4.55228 5 5 5.44772 5 6ZM5 18C5 18.5523 4.55228 19 4 19C3.44772 19 3 18.5523 3 18C3 17.4477 3.44772 17 4 17C4.55228 17 5 17.4477 5 18Z"/>
            </svg>
            <div class="tooltip-top">List view</div>
          </button>
          <button @click="setLayout('grid')" class="fb-view-grid group btn-icon-sm !rounded-l-none !border-l-0 relative" :disabled="layout == 'grid'" :class="{ '!bg-neutral-200': (layout == 'grid') }">
            <svg class="h-4 v-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
              <path d="M8.4 3H4.6C4.03995 3 3.75992 3 3.54601 3.10899C3.35785 3.20487 3.20487 3.35785 3.10899 3.54601C3 3.75992 3 4.03995 3 4.6V8.4C3 8.96005 3 9.24008 3.10899 9.45399C3.20487 9.64215 3.35785 9.79513 3.54601 9.89101C3.75992 10 4.03995 10 4.6 10H8.4C8.96005 10 9.24008 10 9.45399 9.89101C9.64215 9.79513 9.79513 9.64215 9.89101 9.45399C10 9.24008 10 8.96005 10 8.4V4.6C10 4.03995 10 3.75992 9.89101 3.54601C9.79513 3.35785 9.64215 3.20487 9.45399 3.10899C9.24008 3 8.96005 3 8.4 3Z"/>
              <path d="M19.4 3H15.6C15.0399 3 14.7599 3 14.546 3.10899C14.3578 3.20487 14.2049 3.35785 14.109 3.54601C14 3.75992 14 4.03995 14 4.6V8.4C14 8.96005 14 9.24008 14.109 9.45399C14.2049 9.64215 14.3578 9.79513 14.546 9.89101C14.7599 10 15.0399 10 15.6 10H19.4C19.9601 10 20.2401 10 20.454 9.89101C20.6422 9.79513 20.7951 9.64215 20.891 9.45399C21 9.24008 21 8.96005 21 8.4V4.6C21 4.03995 21 3.75992 20.891 3.54601C20.7951 3.35785 20.6422 3.20487 20.454 3.10899C20.2401 3 19.9601 3 19.4 3Z"/>
              <path d="M19.4 14H15.6C15.0399 14 14.7599 14 14.546 14.109C14.3578 14.2049 14.2049 14.3578 14.109 14.546C14 14.7599 14 15.0399 14 15.6V19.4C14 19.9601 14 20.2401 14.109 20.454C14.2049 20.6422 14.3578 20.7951 14.546 20.891C14.7599 21 15.0399 21 15.6 21H19.4C19.9601 21 20.2401 21 20.454 20.891C20.6422 20.7951 20.7951 20.6422 20.891 20.454C21 20.2401 21 19.9601 21 19.4V15.6C21 15.0399 21 14.7599 20.891 14.546C20.7951 14.3578 20.6422 14.2049 20.454 14.109C20.2401 14 19.9601 14 19.4 14Z"/>
              <path d="M8.4 14H4.6C4.03995 14 3.75992 14 3.54601 14.109C3.35785 14.2049 3.20487 14.3578 3.10899 14.546C3 14.7599 3 15.0399 3 15.6V19.4C3 19.9601 3 20.2401 3.10899 20.454C3.20487 20.6422 3.35785 20.7951 3.54601 20.891C3.75992 21 4.03995 21 4.6 21H8.4C8.96005 21 9.24008 21 9.45399 20.891C9.64215 20.7951 9.79513 20.6422 9.89101 20.454C10 20.2401 10 19.9601 10 19.4V15.6C10 15.0399 10 14.7599 9.89101 14.546C9.79513 14.3578 9.64215 14.2049 9.45399 14.109C9.24008 14 8.96005 14 8.4 14Z"/>
            </svg>
            <div class="tooltip-top">Grid view</div>
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
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"  stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                    <path d="M13 7L11.8845 4.76892C11.5634 4.1268 11.4029 3.80573 11.1634 3.57116C10.9516 3.36373 10.6963 3.20597 10.4161 3.10931C10.0992 3 9.74021 3 9.02229 3H5.2C4.0799 3 3.51984 3 3.09202 3.21799C2.71569 3.40973 2.40973 3.71569 2.21799 4.09202C2 4.51984 2 5.0799 2 6.2V7M2 7H17.2C18.8802 7 19.7202 7 20.362 7.32698C20.9265 7.6146 21.3854 8.07354 21.673 8.63803C22 9.27976 22 10.1198 22 11.8V16.2C22 17.8802 22 18.7202 21.673 19.362C21.3854 19.9265 20.9265 20.3854 20.362 20.673C19.7202 21 18.8802 21 17.2 21H6.8C5.11984 21 4.27976 21 3.63803 20.673C3.07354 20.3854 2.6146 19.9265 2.32698 19.362C2 18.7202 2 17.8802 2 16.2V7Z"/>
                  </svg>
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
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"  stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 2.26946V6.4C14 6.96005 14 7.24008 14.109 7.45399C14.2049 7.64215 14.3578 7.79513 14.546 7.89101C14.7599 8 15.0399 8 15.6 8H19.7305M20 9.98822V17.2C20 18.8802 20 19.7202 19.673 20.362C19.3854 20.9265 18.9265 21.3854 18.362 21.673C17.7202 22 16.8802 22 15.2 22H8.8C7.11984 22 6.27976 22 5.63803 21.673C5.07354 21.3854 4.6146 20.9265 4.32698 20.362C4 19.7202 4 18.8802 4 17.2V6.8C4 5.11984 4 4.27976 4.32698 3.63803C4.6146 3.07354 5.07354 2.6146 5.63803 2.32698C6.27976 2 7.11984 2 8.8 2H12.0118C12.7455 2 13.1124 2 13.4577 2.08289C13.7638 2.15638 14.0564 2.27759 14.3249 2.44208C14.6276 2.6276 14.887 2.88703 15.4059 3.40589L18.5941 6.59411C19.113 7.11297 19.3724 7.3724 19.5579 7.67515C19.7224 7.94356 19.8436 8.2362 19.9171 8.5423C20 8.88757 20 9.25445 20 9.98822Z"/>
                  </svg>
                </div>
                <div class="fb-files-item-name">{{  item.name }}</div>
                <div class="fb-files-item-meta">
                  <!-- <div class="files-item-meta-extension">{{ item.extension }}</div>
                  <div class="files-item-meta-kind">{{ item.kind }}</div> -->
                  <div class="fb-files-item-meta-size">{{ $filters.fileSize(item.size) }}</div>
                </div>
                <div class="fb-files-item-options">
                  <Dropdown :dropdownClass="'!max-w-none w-48'">
                    <template #trigger>
                      <button class="fb-files-item-options-btn">
                        <svg class="shrink-0 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z"/>
                          <path d="M19 13C19.5523 13 20 12.5523 20 12C20 11.4477 19.5523 11 19 11C18.4477 11 18 11.4477 18 12C18 12.5523 18.4477 13 19 13Z"/>
                          <path d="M5 13C5.55228 13 6 12.5523 6 12C6 11.4477 5.55228 11 5 11C4.44772 11 4 11.4477 4 12C4 12.5523 4.44772 13 5 13Z"/>
                        </svg>
                      </button>
                    </template>
                    <template #content>
                      <ul>
                        <li>
                          <a class="link w-full" :href="`https://github.com/${props.owner}/${props.repo}/blob/${props.branch}/${item.path}`" target="_blank">
                            <div class="truncate">See file on GitHub</div>
                            <svg class="shrink-0 h-4 w-4 ml-auto text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                              <path d="M21 9L21 3M21 3H15M21 3L13 11M10 5H7.8C6.11984 5 5.27976 5 4.63803 5.32698C4.07354 5.6146 3.6146 6.07354 3.32698 6.63803C3 7.27976 3 8.11984 3 9.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21H14.2C15.8802 21 16.7202 21 17.362 20.673C17.9265 20.3854 18.3854 19.9265 18.673 19.362C19 18.7202 19 17.8802 19 16.2V14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                          </a>
                        </li>
                        <li><hr class="border-t border-neutral-150 my-2"/></li>
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
import notifications from '@/services/notifications';
import github from '@/services/github';
import Dropdown from '@/components/utils/Dropdown.vue';
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

const emit = defineEmits(['update:selected']);

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
  emit('update:selected', selectedFiles.value);
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
    const cleanedPath = path.value.replace(props.root, ''); // Remove the root from the path
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
    layout.value = 'list';
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