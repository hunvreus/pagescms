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
import { computed } from 'vue';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
dayjs.extend(customParseFormat);

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
  return min ? dayjs(min, saveFormat.value).format(displayFormat.value) : null;
});
const formattedMax = computed(() => {
  const max = props.field.options?.max;
  return max ? dayjs(max, saveFormat.value).format(displayFormat.value) : null;
});

// Convert modelValue to the display format for the input field
const formattedValue = computed(() => {
  if (!props.modelValue) return '';
  const dateObject = dayjs(props.modelValue, saveFormat.value);
  if (!dateObject.isValid()) {
    console.warn(`Date for field '${props.field.name}' is saved in the wrong format or invalid: value is ${props.modelValue} and input format is ${saveFormat.value}.`);
    return '';
  }

  return dateObject.format(displayFormat.value);
});

// TODO: clean this up and add validate() method
// Update modelValue from the input field, converting back to the save format
const updateModelValue = (value) => {
  let [year, month, day] = value.split('-');
  // Adjust year if it's "0000" or some invalid value
  year = year === '0000' ? dayjs().format('YYYY') : year; // Default to current year
  // Adjust month if it's "00" or some invalid value
  month = month === '00' ? '01' : month; // Default to January
  // Adjust day if it's "00" or some invalid value
  day = day === '00' ? '01' : day; // Default to first of the month
  const adjustedDate = dayjs(`${year}-${month}-${day}`, displayFormat.value);
  if (adjustedDate.isValid()) {
    emit('update:modelValue', adjustedDate.format(saveFormat.value));
  } else {
    // Handle the case where adjusted date is still not valid
    // This might be rare but could happen with incorrect manual input
  }
};
</script>