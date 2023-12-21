<template>
  <div class="image-gallery">
    <div v-if="modelValue" class="image-preview">
      <div class="image-wrapper">
        <img :src="previewUrl" :alt="modelValue" v-if="previewUrl"/>
        <div v-else class="image-loading">
          <div class="spinner-black"></div>
        </div>
      </div>
      <div class="image-controls">
        <button class="btn-icon-sm !border-r-0 !rounded-r-none relative group" @click="$emit('update:modelValue', '')">
          <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 6V5.2C16 4.0799 16 3.51984 15.782 3.09202C15.5903 2.71569 15.2843 2.40973 14.908 2.21799C14.4802 2 13.9201 2 12.8 2H11.2C10.0799 2 9.51984 2 9.09202 2.21799C8.71569 2.40973 8.40973 2.71569 8.21799 3.09202C8 3.51984 8 4.0799 8 5.2V6M10 11.5V16.5M14 11.5V16.5M3 6H21M19 6V17.2C19 18.8802 19 19.7202 18.673 20.362C18.3854 20.9265 17.9265 21.3854 17.362 21.673C16.7202 22 15.8802 22 14.2 22H9.8C8.11984 22 7.27976 22 6.63803 21.673C6.07354 21.3854 5.6146 20.9265 5.32698 20.362C5 19.7202 5 18.8802 5 17.2V6"/>
          </svg>
          <div class="tooltip-top">Remove image</div>
        </button>
        <button class="btn-icon-sm !rounded-l-none relative group" @click="selectImageModal.openModal()">
          <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.87601 18.1156C2.92195 17.7021 2.94493 17.4954 3.00748 17.3022C3.06298 17.1307 3.1414 16.9676 3.24061 16.8171C3.35242 16.6475 3.49952 16.5005 3.7937 16.2063L17 3C18.1046 1.89543 19.8954 1.89543 21 3C22.1046 4.10457 22.1046 5.89543 21 7L7.7937 20.2063C7.49951 20.5005 7.35242 20.6475 7.18286 20.7594C7.03242 20.8586 6.86926 20.937 6.69782 20.9925C6.50457 21.055 6.29783 21.078 5.88434 21.124L2.49997 21.5L2.87601 18.1156Z"/>
          </svg>
          <div class="tooltip-top">Change image</div>
        </button>
      </div>
    </div>
    <button v-else class="btn flex-col gap-y-2 aspect-square items-center justify-center" @click="selectImageModal.openModal()">
      <svg class="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
        <path d="M12.5 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21H17C17.93 21 18.395 21 18.7765 20.8978C19.8117 20.6204 20.6204 19.8117 20.8978 18.7765C21 18.395 21 17.93 21 17M19 8V2M16 5H22M10.5 8.5C10.5 9.60457 9.60457 10.5 8.5 10.5C7.39543 10.5 6.5 9.60457 6.5 8.5C6.5 7.39543 7.39543 6.5 8.5 6.5C9.60457 6.5 10.5 7.39543 10.5 8.5ZM14.99 11.9181L6.53115 19.608C6.05536 20.0406 5.81747 20.2568 5.79643 20.4442C5.77819 20.6066 5.84045 20.7676 5.96319 20.8755C6.10478 21 6.42628 21 7.06929 21H16.456C17.8951 21 18.6147 21 19.1799 20.7582C19.8894 20.4547 20.4547 19.8894 20.7582 19.1799C21 18.6147 21 17.8951 21 16.456C21 15.9717 21 15.7296 20.9471 15.5042C20.8805 15.2208 20.753 14.9554 20.5733 14.7264C20.4303 14.5442 20.2412 14.3929 19.8631 14.0905L17.0658 11.8527C16.6874 11.5499 16.4982 11.3985 16.2898 11.3451C16.1061 11.298 15.9129 11.3041 15.7325 11.3627C15.5279 11.4291 15.3486 11.5921 14.99 11.9181Z"/>
      </svg>
      Add image
    </button>
  </div>
  <!-- File browser modal -->
  <Modal ref="selectImageModal" :customClass="'modal-file-browser'">
    <template #header>Select an image</template>
    <template #content>
      <div class="relative">
        <FileBrowser
          :owner="repoStore.owner"
          :repo="repoStore.repo"
          :branch="repoStore.branch"
          :root="props.root || repoStore.config.media"
          :default_layout="'grid'"
          :filterByCategories="['image']"
          :isSelectable="true"
          :selected="modelValue"
          @update:selected="imageSelection = $event"
        />
      </div>
      <footer class="flex justify-end text-sm gap-x-2 pt-3">
        <button class="btn" @click="selectImageModal.closeModal()">Cancel</button>
        <button
          class="btn-primary"
          @click="$emit('update:modelValue', imageSelection.length ? (props.field.prefix ? `${props.field.prefix}${imageSelection[0]}` : imageSelection[0]) : null); selectImageModal.closeModal()"
        >
          Confirm
        </button>
      </footer>
    </template>
  </Modal>
</template>

<script setup>
import { ref, inject, watch, onMounted, computed } from 'vue';
import githubImg from '@/services/githubImg';
import FileBrowser from '@/components/FileBrowser.vue';
import Modal from '@/components/utils/Modal.vue';

const props = defineProps({
  field: Object,
  modelValue: [String, Array],
  root: String,
});

const repoStore = inject('repoStore', { owner: null, repo: null, branch: null, config: null, details: null });
const imageSelection = ref([]);
const selectImageModal = ref(null);
const pathWithoutPrefix = computed(() => {
  return props.field.prefix ? props.modelValue.replace(new RegExp(`^${props.field.prefix}`), '') : props.modelValue;
});
const previewUrl = ref(null);

const setPreviewUrl = async () => {
  if (pathWithoutPrefix.value) {
    previewUrl.value = null;
    previewUrl.value = await githubImg.getRawUrl(repoStore.owner, repoStore.repo, repoStore.branch, pathWithoutPrefix.value, repoStore.details.private);
  } else {
    previewUrl.value = null;
  }
};

onMounted(async () => {
  await setPreviewUrl();
});

watch(pathWithoutPrefix, async (newValue, oldValue) => {
  await setPreviewUrl();
});
</script>