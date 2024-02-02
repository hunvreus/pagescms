<template>
  <TipTap
    :model-value="modelValue"
    @update:modelValue="$emit('update:modelValue', $event)"
    :format="(field.options && field.options.format) || 'markdown'"
    :options="field.options || null"
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
import { useFieldValidation } from '@/composables/useFieldValidation';
import TipTap from '@/components/file/TipTap.vue';
import Icon from '@/components/utils/Icon.vue';

const { validateRequired, validatePattern, validateLength } = useFieldValidation();

const props = defineProps({
  field: Object,
  modelValue: String,
});

const errors = ref([]);

const validate = () => {
  errors.value = [];

  const requiredError = validateRequired(props.field, props.modelValue);
  const patternError = validatePattern(props.field, props.modelValue);
  const lengthError = validateLength(props.field, props.modelValue);

  if (requiredError) errors.value.push(requiredError);
  if (patternError) errors.value.push(patternError);
  if (lengthError) errors.value.push(lengthError);

  return errors.value;
};

defineExpose({ validate });
</script>