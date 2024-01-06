<template>
  <!-- Rename modal -->
  <Modal ref="renameModal">
    <template #header>Rename file</template>
    <template #content>
      <input class="w-full" type="text" v-model="newPath" placeholder="Enter new file path"/>
      <footer class="flex justify-end text-sm gap-x-2 mt-4">
        <button class="btn-secondary" @click="renameModal.closeModal()">Cancel</button>
        <button :disabled="status === 'renaming' || newPath === props.path" class="btn-primary" @click="renameEntry">
          Rename
          <div class="spinner-white-sm" v-if="status == 'renaming'"></div>
        </button>
      </footer>
    </template>
  </Modal>
  <!-- Waiting overlay -->
  <Teleport to="body">
    <div class="waiting" v-show="status === 'renaming'"></div>
  </Teleport>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import notifications from '@/services/notifications';
import github from '@/services/github';
import Modal from '@/components/utils/Modal.vue';

const emits = defineEmits(['file-renamed']);

const props = defineProps({
  owner: String,
  repo: String,
  branch: String,
  path: String
});

const renameModal = ref(null);
const newPath = ref('');
const status = ref('');

const renameEntry = async () => {
  status.value = 'renaming';
  const newSha = await github.renameFile(props.owner, props.repo, props.branch, props.path, newPath.value);
  if (!newSha) {
    notifications.notify(`Failed to rename the file from "${props.path}" to "${newPath.value}".`, 'error');
  } else {
    emits('file-renamed', { renamedPath: newPath.value, renamedSha: newSha });
    notifications.notify(`File "${props.path}" renamed to "${newPath.value}".`, 'success');
    renameModal.value.closeModal();
  }
  status.value = '';
};

const openModal = () => {
  renameModal.value.openModal();
};

onMounted(() => {
  newPath.value = props.path;
});

watch(() => props.path, (newValue) => {
  newPath.value = newValue;
});

defineExpose({ openModal });
</script>