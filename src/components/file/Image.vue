<template>
  <div v-if="path" class="bg-neutral-100 dark:bg-neutral-850 w-full pb-[100%] rounded-xl ring-1 ring-neutral-200 dark:ring-neutral-750 overflow-hidden relative" :class="[ props.customClass ]">
    <div v-if="rawUrl" class="absolute inset-0 bg-cover bg-center" :style="{ 'background-image': `url('${rawUrl}')` }" :title="relativePath"></div>
    <div v-else class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
      <div class="spinner-black"></div>
    </div>
  </div>
</template>

<script setup>
// TODO: handle case where file doesn't exist or settings are wrong
import { ref, onMounted, inject, watch } from 'vue';
import githubImg from '@/services/githubImg';

const repoStore = inject('repoStore', { owner: null, repo: null, branch: null, config: null, details: null });

const props = defineProps({
  path: { type: String, default: null },
  customClass: { type: String, default: null },
  field: { type: Object, default: null },
  relative: { type: Boolean, default: true },
});

const relativePath = ref(props.path);
const rawUrl = ref(null);

onMounted(async () => {
  if (!props.relative) {
    const prefixInput = props.field.options?.input ?? repoStore.config.media?.input ?? null;
    const prefixOutput = props.field.options?.output ?? repoStore.config.media?.output ?? null;
    relativePath.value = githubImg.swapPrefix(props.path, prefixOutput, prefixInput, true);
  }
  if (relativePath.value) {
    rawUrl.value = await githubImg.getRawUrl(repoStore.owner, repoStore.repo, repoStore.branch, relativePath.value, repoStore.details.private);
  }
});

watch(() => props.path, async (newPath) => {
  rawUrl.value = null;
  if (!props.relative) {
    const prefixInput = props.field.options?.input ?? repoStore.config.media?.input ?? null;
    const prefixOutput = props.field.options?.output ?? repoStore.config.media?.output ?? null;
    relativePath.value = githubImg.swapPrefix(newPath, prefixOutput, prefixInput, true);
  }
  if (relativePath.value) {
    rawUrl.value = await githubImg.getRawUrl(repoStore.owner, repoStore.repo, repoStore.branch, relativePath.value, repoStore.details.private);
  }
});
</script>