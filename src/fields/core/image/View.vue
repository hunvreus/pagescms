<template>  
  <Image v-if="rawUrl" :path="rawUrl"/>
</template>

<script setup>
import { inject, computed } from 'vue';
import Image from '@/components/file/Image.vue';
import githubImg from '@/services/githubImg';

const repoStore = inject('repoStore', { config: null });

const props = defineProps({
  field: Object,
  value: [String, Number, Boolean, Array, Object],
});

const rawUrl = computed(() => {
  if (!props.value) return null;
  const imagePath = Array.isArray(props.value) ? props.value[0] : props.value;
  const prefixInput = props.field.options?.input ?? repoStore.config.object.media?.input ?? null;
  const prefixOutput = props.field.options?.output ?? repoStore.config.object.media?.output ?? null;
  return githubImg.swapPrefix(imagePath, prefixOutput, prefixInput, true);
});
</script>