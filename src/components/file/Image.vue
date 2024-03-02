<template>
  <div v-if="path" class="bg-neutral-100 dark:bg-neutral-850 w-full pb-[100%] rounded-xl ring-1 ring-neutral-200 dark:ring-neutral-750 overflow-hidden relative" :class="[ props.customClass ]">
    <div v-if="rawUrl" class="absolute inset-0 bg-cover bg-center" :style="{ 'background-image': `url('${rawUrl}')` }" :title="path"></div>
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
  customClass: { type: String, default: null }
});

const rawUrl = ref(null);

onMounted(async () => {
  rawUrl.value = await githubImg.getRawUrl(repoStore.owner, repoStore.repo, repoStore.branch, props.path, repoStore.details.private);
});

watch(() => props.path, async (newPath) => {
  rawUrl.value = null;
  rawUrl.value = await githubImg.getRawUrl(repoStore.owner, repoStore.repo, repoStore.branch, newPath, repoStore.details.private);
});
</script>