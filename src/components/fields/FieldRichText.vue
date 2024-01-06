
<template>
  <TipTap
    :model-value="modelValue"
    @update:modelValue="$emit('update:modelValue', $event)"
    :format="(field.options && field.options.format) || 'markdown'"
    :imagePrefix="(field.options && field.options.prefix) || repoStore.config.media_prefix || null"
    :owner="repoStore.owner"
    :repo="repoStore.repo"
    :branch="repoStore.branch"
    :root="(field.options && field.options.root) || repoStore.config.media || null"
    :private="repoStore.details.private || true"
  />
</template>

<script setup>
import { inject } from 'vue';
import TipTap from '@/components/file/TipTap.vue';

const repoStore = inject('repoStore', { owner: null, repo: null, branch: null, config: null, details: null });

const props = defineProps({
  field: Object,
  modelValue: String,
});
</script>