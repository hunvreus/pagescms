<template>
  <input
    class="input w-full"
    type="number"
    :value="modelValue"
    @input="updateModelValue($event.target.value)"
    :min="props.field.options?.min || null"
    :max="props.field.options?.max || null"
    :step="props.field.options?.step || null"
  />
  <ul v-if="errors.length" class="mt-2 text-sm text-red-500 dark:text-red-400">
    <li v-for="error in errors" :key="error" class="flex gap-x-1 items-center">
      <Icon name="Ban" class="h-3 w-3 stroke-[2.5]"/>
      {{ error }}
    </li>
  </ul>
</template>

<script setup>
import { ref } from 'vue';
import useFieldValidation from '@/composables/useFieldValidation';
import Icon from '@/components/utils/Icon.vue';

const { validateRequired, validatePattern, validateRange } = useFieldValidation();

const emit = defineEmits(['update:modelValue']);

const props = defineProps({
  field: Object,
  modelValue: [ String, Number ]
});

const updateModelValue = (value) => {
  const numericValue = value === "" ? null : parseFloat(value);
  emit('update:modelValue', isNaN(numericValue) ? null : numericValue);
};

const errors = ref([]);

const validate = () => {
  errors.value = [];
  const requiredError = validateRequired(props.field, props.modelValue);
  const patternError = validatePattern(props.field, props.modelValue);
  const rangeError = validateRange(props.field, props.modelValue);
  if (requiredError.length) errors.value = errors.value.concat(requiredError);
  if (patternError.length) errors.value = errors.value.concat(patternError);
  if (rangeError.length) errors.value = errors.value.concat(rangeError);
  
  return errors.value;
};

defineExpose({ validate });
</script>