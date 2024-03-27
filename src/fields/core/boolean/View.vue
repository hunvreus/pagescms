<template>  
  <div class="!inline" :class="props.value ? 'chip-primary' : 'chip-secondary'">{{ props.value ? 'True' : 'False' }}</div>
</template>

<script setup>
const props = defineProps({
  field: Object,
  value: [String, Number, Boolean, Array, Object],
});
</script>