<template>
  <template v-if="props.field.type === 'image' && formattedValue">
    <Image :path="formattedValue"/>
  </template>
  <template v-else-if="props.field.type === 'boolean'">
    <div class="!inline" :class="props.value ? 'chip-primary' : 'chip-secondary'">{{ props.value ? 'True' : 'False' }}</div>
  </template>
  <template v-else>
    {{ formattedValue }}
  </template>
</template>

<script setup>
import { inject, computed } from 'vue';
import moment from 'moment';
import Image from '@/components/file/Image.vue';
import githubImg from '@/services/githubImg';

const repoStore = inject('repoStore', { config: null });

const props = defineProps({
  field: Object,
  value: [String, Number, Boolean, Array, Object],
});

const formattedValue = computed(() => {
  if (!props.value) return null;
  if (props.field.type === 'date') {
    const defaultInputFormat = props.field.options?.time ? 'YYYY-MM-DDTHH:mm' : 'YYYY-MM-DD';
    const outputFormat = props.field.options?.time ? 'MMM D, YYYY - HH:mm' : 'MMM D, YYYY';
    const inputFormat = props.field.options?.format || defaultInputFormat;
    const dateObject = moment(props.value, inputFormat);
    if (!dateObject.isValid()) {
      console.warn(`Date for field '${props.field.name}' is saved in the wrong format or invalid:`, props.value);
      return '';
    }
    return dateObject.format(outputFormat);
  } else if (props.field.type === 'image') {
    const imagePath = Array.isArray(props.value) ? props.value[0] : props.value; 
    const prefixInput = props.field.options?.input ?? repoStore.config.media?.input ?? null;
    const prefixOutput = props.field.options?.output ?? repoStore.config.media?.output ?? null;
    return githubImg.swapPrefix(imagePath, prefixOutput, prefixInput, true);
  } else {
    return props.value;
  }
});
</script>