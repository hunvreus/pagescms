<template>  
  {{ date }}
</template>

<script setup>
import { inject, computed } from 'vue';
import moment from 'moment';

const repoStore = inject('repoStore', { config: null });

const props = defineProps({
  field: Object,
  value: [String, Number, Boolean, Array, Object],
});

const date = computed(() => {
  if (!props.value) return null;
  
  const defaultInputFormat = props.field.options?.time ? 'YYYY-MM-DDTHH:mm' : 'YYYY-MM-DD';
  const outputFormat = props.field.options?.time ? 'MMM D, YYYY - HH:mm' : 'MMM D, YYYY';
  const inputFormat = props.field.options?.format || defaultInputFormat;
  const dateObject = moment(props.value, inputFormat);
  if (!dateObject.isValid()) {
    console.warn(`Date for field '${props.field.name}' is saved in the wrong format or invalid:`, props.value);
    return '';
  }
  return dateObject.format(outputFormat);
});
</script>