<template>
  <textarea
    ref="textarea"
    class="input w-full"
    :class="{ 'overflow-y-hidden': autoresize }"
    :rows="field.options?.rows ? field.options.rows : 5"
    :maxlength="field.options?.maxlength"
    :value="modelValue"
    @input="handleInput"
  />
  <ul v-if="errors.length" class="mt-2 text-sm text-red-500 dark:text-red-400">
    <li v-for="error in errors" :key="error" class="flex gap-x-1 items-center">
      <Icon name="Ban" class="h-3 w-3 stroke-[2.5]"/>
      {{ error }}
    </li>
  </ul>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import { useFieldValidation } from '@/composables/useFieldValidation';
import Icon from '@/components/utils/Icon.vue';

const { validateRequired, validatePattern, validateLength } = useFieldValidation();

const emit = defineEmits(['update:modelValue']);

const props = defineProps({
  field: Object,
  modelValue: String
});

const textarea = ref(null);
const autoresize = props.field.options?.autoresize ?? true;
const errors = ref([]);

const resizeTextarea = () => {
  if (!textarea.value) return;
  const totalBorderWidth = 2;
  textarea.value.style.height = 'auto';
  textarea.value.style.height = `${textarea.value.scrollHeight + totalBorderWidth}px`;
};

const handleInput = (event) => {
  emit('update:modelValue', event.target.value);
  if (autoresize) {
    resizeTextarea();
  }
};

watch(() => props.modelValue, () => {
  if (autoresize) {
    resizeTextarea();
  }
});

onMounted(() => {
  if (autoresize) {
    resizeTextarea();
  }
});

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