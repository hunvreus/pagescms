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
        <Image :path="element"/>
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
      <li v-if="internalModelValue.length < (props.field.list ? ( props.field.list?.max ?? Infinity ) : 1)">
        <button class="btn flex-col gap-y-2 aspect-square items-center justify-center w-full" @click="addImage()">
          <Icon name="ImagePlus" class="h-6 w-6 stroke-[1.5] shrink-0"/>
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
          :root="props.field.options?.input ?? repoStore.config.object.media?.input"
          :defaultPath="props.field.options?.path ?? repoStore.config.object.media?.path"
          :filterByCategories="props.field.options?.extensions ? undefined : [ 'image' ]"
          :filterByExtensions="props.field.options?.extensions"
          :isSelectable="true"
          :selected="activeImgIndex != null ? internalModelValue[activeImgIndex] : ''"
          :selectMax="selectMax"
          @files-selected="imageSelection = $event"
          ref="fileBrowserComponent"
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
// TODO: review the need for the validate() method (unclear if it's needed)
import { ref, computed, inject, watch, onMounted } from 'vue';
import Draggable from 'vuedraggable';
import useSchema from '@/composables/useSchema';
import githubImg from '@/services/githubImg';
import FileBrowser from '@/components/FileBrowser.vue';
import Icon from '@/components/utils/Icon.vue';
import Modal from '@/components/utils/Modal.vue';
import Image from '@/components/file/Image.vue';

const { sanitizeObject } = useSchema();

const emit = defineEmits(['update:modelValue']);

const repoStore = inject('repoStore', { owner: null, repo: null, branch: null, config: null, details: null });

const props = defineProps({
  field: Object,
  modelValue: [String, Array],
  list: { type: Boolean, default: false },
  options: { type: Object, default: {} },
});

const internalModelValue = ref([]);
const imageSelection = ref([]);
const activeImgIndex = ref(null);
const prefixInput = ref(props.field.options?.input ?? repoStore.config.object.media?.input ?? null);
const prefixOutput = ref(props.field.options?.output ?? repoStore.config.object.media?.output ?? null);
const selectMax = computed(() => {
  if (props.field.list) {
    if (props.field.list.max) {
      if (activeImgIndex.value !== null) {
        return props.field.list.max - internalModelValue.value.length + 1;
      } else {
        return props.field.list.max - internalModelValue.value.length;
      }
    } else {
      return undefined;
    }
  } else {
    return 1;
  }
});
const selectImageModal = ref(null);
const fileBrowserComponent = ref(null);

const confirmImageSelection = () => {
  if (imageSelection.value.length > 0) {
    const insertIndex = activeImgIndex.value !== null ? activeImgIndex.value : internalModelValue.value.length;
    internalModelValue.value.splice(insertIndex, activeImgIndex.value !== null ? 1 : 0, ...imageSelection.value);
    activeImgIndex.value = null;
    imageSelection.value = [];
    fileBrowserComponent.value.selectFile();
  } else if (activeImgIndex.value !== null) {
    internalModelValue.value.splice(activeImgIndex.value, 1);
  }
  selectImageModal.value.closeModal();
};

const removeImage = (index) => {
  internalModelValue.value.splice(index, 1);
};

const changeImage = (index) => {
  imageSelection.value = [ internalModelValue.value[index] ];
  activeImgIndex.value = index;
  if (fileBrowserComponent.value) {
    // If the file browser is already mounted, we refresh its content
    fileBrowserComponent.value.setContents();
  }
  selectImageModal.value.openModal();
};

const addImage = () => {
  imageSelection.value = [];
  activeImgIndex.value = null;
  if (fileBrowserComponent.value) {
    // If the file browser is already mounted, we refresh its content
    fileBrowserComponent.value.setContents();
  }
  selectImageModal.value.openModal()
};

const setImages = () => {  
  if (props.modelValue) {
    // For simplicity, we internally deal with an array whether it's a list or not
    internalModelValue.value = props.field.list ? props.modelValue : [ props.modelValue ];
    internalModelValue.value = internalModelValue.value.filter(entry => sanitizeObject(entry));
    internalModelValue.value.forEach((imagePath, index) => {
      // For displaying images, we need the input value of the paths
      internalModelValue.value[index] = githubImg.swapPrefix(imagePath, prefixOutput.value, prefixInput.value, true);
    });
  }
};

onMounted(async () => {
  setImages();
});

watch(() => props.modelValue, (newValue, oldValue) => {
  setImages();
});

watch(
  internalModelValue,
  (newValue) => {
    if (newValue) {
      // For saving the value, we swap the prefix from input to output
      const modelValueOutput = newValue.map((path) => githubImg.swapPrefix(path, prefixInput.value, prefixOutput.value));
      if (props.field.list) {
        emit('update:modelValue', modelValueOutput);
      } else {
        emit('update:modelValue', modelValueOutput[0]);
      }
    }
  },
  { deep: true }
);

</script>