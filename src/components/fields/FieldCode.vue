<template>
  <CodeMirror
    :modelValue="modelValue"
    :language="field.options?.format"
    @update:modelValue="$emit('update:modelValue', $event)"
  />
</template>

<script setup>
import { inject } from 'vue';
import CodeMirror from '@/components/file/CodeMirror.vue';

const repoStore = inject('repoStore', { owner: null, repo: null, branch: null, config: null, details: null });

const props = defineProps({
  field: Object,
  modelValue: String
});
</script>