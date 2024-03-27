<template>
  <select class="select w-full" :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
    <option v-for="option in normalizedOptions" :key="option.value" :value="option.value">
      {{ option.label }}
    </option>
  </select>
  <ul v-if="errors.length" class="mt-2 text-sm text-red-500 dark:text-red-400">
    <li v-for="error in errors" :key="error" class="flex gap-x-1 items-center">
      <Icon name="Ban" class="h-3 w-3 stroke-[2.5]"/>
      {{ error }}
    </li>
  </ul>
</template>

<script setup>
import { ref, computed } from 'vue';
import useFieldValidation from '@/composables/useFieldValidation';
import Icon from '@/components/utils/Icon.vue';

const { validateRequired } = useFieldValidation();

const props = defineProps({
  field: {
    type: Object,
    default: () => ({
      options: {
        values: []
      }
    })
  },
  modelValue: [String, Number]
});

const errors = ref([]);

const normalizedOptions = computed(() => {
  return props.field.options.values.map(option => {
    if (typeof option === 'string') {
      return { value: option, label: option };
    }
    return option;
  });
});

const validate = () => {
  errors.value = [];
  const requiredError = validateRequired(props.field, props.modelValue);
  if (requiredError.length) errors.value = errors.value.concat(requiredError);
  
  return errors.value;
};

defineExpose({ validate });
</script>