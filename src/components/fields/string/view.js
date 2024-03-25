<template>  
  {{ value }}
</template>

<script setup>
const props = defineProps({
  field: Object,
  value: [String],
});

const sort = (a, b) => {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
};

defineExpose({ sort });
</script>