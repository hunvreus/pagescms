<template>
  <input type="file" ref="fileInput" @change="handleFileInput" multiple hidden />
  <!-- Waiting overlay -->
  <Teleport to="body">
    <div class="waiting" v-show="status === 'uploaded'"></div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue';
import notifications from '@/services/notifications';
import github from '@/services/github';

const emits = defineEmits(['processed', 'uploaded', 'error']);

const props = defineProps({
  owner: String,
  repo: String,
  branch: String,
  path: String,
});

const fileInput = ref(null);
const status = ref('');

function openFileInput() {
  fileInput.value.click();
}

// TODO: move to a composable and add checks (size + type)
const handleFileInput = async (event) => {
  const files = event.target.files;
  await processFiles(files);
};

async function processFiles(files) {
  status.value = 'uploading';
  for (let i = 0; i < files.length; i++) {
    await upload(files[i]);
  }
  emits('processed');
  status.value = '';
}

const upload = async (file) => {
  if (file) {
    let content = await readFileContent(file);
    if (content) {
      content = content.replace(/^(.+,)/, ''); // We strip out the info at the beginning of the file (mime type + encoding)
      const data = await github.saveFile(props.owner, props.repo, props.branch, `${props.path}/${file.name}`, content);
      if (data) {
        notifications.notify(`File '${file.name}' successfully uploaded.`, 'success');
        emits('uploaded', file);
      } else {
        notifications.notify(`File upload failed.`, 'error');
        emits('error', file);
      }
    }
  }
};

const readFileContent = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file); // Reads the file as base64 encoded string
  });
};

defineExpose({ openFileInput, processFiles });
</script>