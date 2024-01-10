<template>
  <Draggable
    class="grid grid-cols-4 gap-4 sm:grid-cols-5 xl:grid-cols-6"
    v-model="internalModelValue"
    :animation="100"
    :item-key="'index'"
    tag="ul"
  >
    <template #item="{element, index}">
      <li v-if="element" class="relative w-full cursor-move">
        <div class="bg-neutral-100 dark:bg-neutral-850 w-full pb-[100%] rounded-xl ring-1 ring-neutral-200 dark:ring-neutral-750 overflow-hidden relative">
          <img v-if="previewUrls[element]" :src="previewUrls[element]" :alt="element" class="object-cover absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"/>
          <div v-else class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div class="spinner-black"></div>
          </div>
        </div>
        <div class="absolute bottom-0 right-0 z-10 flex p-2">
          <button class="btn-icon-sm !border-r-0 !rounded-r-none relative group" @click="removeImage(index)">
            <Icon name="Trash2" class="h-4 w-4 stroke-2 shrink-0"/>
            <div class="tooltip-top">Remove image</div>
          </button>
          <button class="btn-icon-sm !rounded-l-none relative group" @click="changeImage(index)">
            <Icon name="Pencil" class="h-4 w-4 stroke-2 shrink-0"/>
            <div class="tooltip-top">Change image</div>
          </button>
        </div>
      </li>
    </template>
    <template #footer>
      <li v-if="internalModelValue.length < (props.list ? props.listMax : 1)">
        <button class="btn flex-col gap-y-2 aspect-square items-center justify-center w-full" @click="addImage()">
          <Icon name="ImagePlus" class="h-6 w-6 stroke-2 shrink-0"/>
          Add image
        </button>
      </li>
    </template>
  </Draggable>
  <!-- File browser modal -->
  <Modal ref="selectImageModal" :customClass="'modal-file-browser'">
    <template #header>Select an image</template>
    <template #content>
      <div class="relative">
        <FileBrowser
          :owner="repoStore.owner"
          :repo="repoStore.repo"
          :branch="repoStore.branch"
          :root="props.options.root || repoStore.config.media || ''"
          :filterByCategories="['image']"
          :isSelectable="true"
          :selected="activeImgIndex ? [internalModelValue[activeImgIndex]] : null"
          @files-selected="imageSelection = $event"
        />
      </div>
      <footer class="flex justify-end text-sm gap-x-2 mt-4">
        <button class="btn-secondary" @click="selectImageModal.closeModal()">Cancel</button>
        <button
          class="btn-primary"
          @click="confirmImageSelection()"
        >
          Confirm
        </button>
      </footer>
    </template>
  </Modal>
</template>

<script setup>
import { ref, inject, watch, onMounted, watchEffect } from 'vue';
import Draggable from 'vuedraggable';
import githubImg from '@/services/githubImg';
import FileBrowser from '@/components/FileBrowser.vue';
import Icon from '@/components/utils/Icon.vue';
import Modal from '@/components/utils/Modal.vue';

const emit = defineEmits(['update:modelValue']);

const repoStore = inject('repoStore', { owner: null, repo: null, branch: null, config: null, details: null });

const props = defineProps({
  field: Object,
  modelValue: [String, Array],
  list: { type: Boolean, default: false },
  listMin: { type: Number, default: 0 },
  listMax: { type: Number, default: Infinity },
  options: { type: Object, default: {} },
});

const imageSelection = ref([]);
const selectImageModal = ref(null);
const previewUrls = ref({});
const activeImgIndex = ref(null);
const internalModelValue = ref([]);

const prefix = props.field.prefix || repoStore.config.media_prefix || null;

const getPreviewUrl = async (path) => {
  if (!previewUrls[path]) {
    previewUrls.value[path] = await githubImg.getRawUrl(repoStore.owner, repoStore.repo, repoStore.branch, path, repoStore.details.private);
  }
};

const confirmImageSelection = () => {
  if (imageSelection.value[0]) {
    if (activeImgIndex.value === null) {
      internalModelValue.value.push(imageSelection.value[0]);
    } else {
      internalModelValue.value[activeImgIndex.value] = imageSelection.value[0];
    }
    getPreviewUrl(imageSelection.value[0]);
    selectImageModal.value.closeModal();
    activeImgIndex.value = null;
    imageSelection.value = null;
  }
};

const removeImage = (index) => {
  internalModelValue.value.splice(index, 1);
  previewUrls.value.splice(index, 1);
};

const changeImage = (index) => {
  activeImgIndex.value = index;
  selectImageModal.value.openModal();
};

const addImage = () => {
  activeImgIndex.value = null;
  selectImageModal.value.openModal()
};

const setImages = () => {
  internalModelValue.value = props.list ? props.modelValue : [props.modelValue];
  internalModelValue.value.forEach((imagePath, index) => {
    internalModelValue.value[index] = removePrefix(imagePath);
    getPreviewUrl(internalModelValue.value[index]);
  });
};

onMounted(async () => {
  setImages();
});

// TODO: refactor these two functions into githubImg?

const addPrefix = (path) => {
  return `${prefix}${path}`;
};

const removePrefix = (path) => {
  if (path.startsWith(prefix) && !(prefix == '/' && path.startsWith('//'))) {
    return path.replace(`${prefix}`, '');
  }
  return path;
};

watch(
  internalModelValue,
  (newValue) => {
    if (newValue) {
      const modeValueWithPrefix = newValue.map(addPrefix);
      if (props.list) {
        emit('update:modelValue', modeValueWithPrefix);
      } else {
        emit('update:modelValue', modeValueWithPrefix[0]);
      }
    }
  },
  { deep: true }
);
</script>