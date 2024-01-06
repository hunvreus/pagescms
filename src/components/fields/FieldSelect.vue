<template>
  <select class="select w-full" :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
    <option v-for="option in field.options.values" :key="option.value" :value="option.value">
      {{ option.label }}
    </option>
  </select>
</template>

<script setup>
const props = defineProps({
  field: {
    type: Object,
    default: () => ({
      options: []
    })
  },
  modelValue: [String, Number]
});
</script>