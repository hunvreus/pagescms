<template>
  <TipTap
    :model-value="modelValue"
    @update:modelValue="$emit('update:modelValue', $event)"
    :source="'markdown'"
    :imagePrefix="field.prefix || repoStore.config.media_prefix || null"
    :owner="repoStore.owner"
    :repo="repoStore.repo"
    :branch="repoStore.branch"
    :root="repoStore.config.media"
    :private="repoStore.details.private"
  />
</template>

<script setup>
import { inject } from 'vue';
import TipTap from '@/components/file/TipTap.vue';

const props = defineProps({
  field: Object,
  modelValue: String,
  prefix: String
});

const repoStore = inject('repoStore', { owner: null, repo: null, branch: null, config: null, details: null });
</script>