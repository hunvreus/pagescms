<template>
  <input
    class="input w-full"
    :type="inputType"
    :value="formattedValue"
    @input="updateModelValue($event.target.value)"
    :min="formattedMin"
    :max="formattedMax"
    :step="props.field.options?.step || null"
  />
</template>

<script setup>
import { computed, defineProps, defineEmits } from 'vue';
import moment from 'moment';

const props = defineProps({
  field: Object,
  modelValue: String,
});

const emit = defineEmits(['update:modelValue']);

// Default formats for date and datetime-local
const defaultDateFormat = 'YYYY-MM-DD';
const defaultDateTimeFormat = 'YYYY-MM-DDTHH:mm';

// Determine the type of input and its display format
const inputType = computed(() => props.field.options?.time ? 'datetime-local' : 'date');
const displayFormat = computed(() => inputType.value === 'datetime-local' ? defaultDateTimeFormat : defaultDateFormat);

// Format for saving the value
const saveFormat = computed(() => props.field.options?.format || displayFormat.value);

// Formatted min and max values
const formattedMin = computed(() => {
  const min = props.field.options?.min;
  return min ? moment(min, saveFormat.value).format(displayFormat.value) : null;
});

const formattedMax = computed(() => {
  const max = props.field.options?.max;
  return max ? moment(max, saveFormat.value).format(displayFormat.value) : null;
});

// Convert modelValue to the display format for the input field
const formattedValue = computed(() => {
  if (!props.modelValue) return '';
  return moment(props.modelValue, saveFormat.value).format(displayFormat.value);
});

// Update modelValue from the input field, converting back to the save format
const updateModelValue = (value) => {
  emit('update:modelValue', moment(value, displayFormat.value).format(saveFormat.value));
};
</script>
