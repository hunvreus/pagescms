<template>
  <div v-if="model && !field.hidden" class="field" :class="field.hidden ? 'hiddden' : ''">
    <label class="label" v-if="field.label">{{ field.label }}</label>
    <div v-if="field.description" class="description">{{ field.description }}</div>
    <!-- List field -->
    <template v-if="field.list">
      <Draggable
        class="field-list"
        v-model="model[field.name]"
        :handle="'.field-list-item-handle'"
        :animation="100"
        :item-key="'index'"
        tag="div"
      >
        <template #item="{element, index}">
          <div class="field-list-item" :key="index">
            <div class="field-list-item-handle cursor-move py-3 text-neutral-400 hover:text-neutral-950 transition-colors">
              <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 6C12.5523 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4C11.4477 4 11 4.44772 11 5C11 5.55228 11.4477 6 12 6Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 20C12.5523 20 13 19.5523 13 19C13 18.4477 12.5523 18 12 18C11.4477 18 11 18.4477 11 19C11 19.5523 11.4477 20 12 20Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M19 6C19.5523 6 20 5.55228 20 5C20 4.44772 19.5523 4 19 4C18.4477 4 18 4.44772 18 5C18 5.55228 18.4477 6 19 6Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M19 13C19.5523 13 20 12.5523 20 12C20 11.4477 19.5523 11 19 11C18.4477 11 18 11.4477 18 12C18 12.5523 18.4477 13 19 13Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M19 20C19.5523 20 20 19.5523 20 19C20 18.4477 19.5523 18 19 18C18.4477 18 18 18.4477 18 19C18 19.5523 18.4477 20 19 20Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M5 6C5.55228 6 6 5.55228 6 5C6 4.44772 5.55228 4 5 4C4.44772 4 4 4.44772 4 5C4 5.55228 4.44772 6 5 6Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M5 13C5.55228 13 6 12.5523 6 12C6 11.4477 5.55228 11 5 11C4.44772 11 4 11.4477 4 12C4 12.5523 4.44772 13 5 13Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M5 20C5.55228 20 6 19.5523 6 19C6 18.4477 5.55228 18 5 18C4.44772 18 4 18.4477 4 19C4 19.5523 4.44772 20 5 20Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <component
              :is="component"
              :field="field"
              :modelValue="element"
              @update:modelValue="value => model[field.name][index] = value"
            />
            <button class="group relative py-3 text-neutral-400 hover:text-neutral-950 transition-colors" @click="removeItem(index)">
              <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 6V5.2C16 4.0799 16 3.51984 15.782 3.09202C15.5903 2.71569 15.2843 2.40973 14.908 2.21799C14.4802 2 13.9201 2 12.8 2H11.2C10.0799 2 9.51984 2 9.09202 2.21799C8.71569 2.40973 8.40973 2.71569 8.21799 3.09202C8 3.51984 8 4.0799 8 5.2V6M10 11.5V16.5M14 11.5V16.5M3 6H21M19 6V17.2C19 18.8802 19 19.7202 18.673 20.362C18.3854 20.9265 17.9265 21.3854 17.362 21.673C16.7202 22 15.8802 22 14.2 22H9.8C8.11984 22 7.27976 22 6.63803 21.673C6.07354 21.3854 5.6146 20.9265 5.32698 20.362C5 19.7202 5 18.8802 5 17.2V6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <div class="tooltip-top-right">Remove entry</div>
            </button>
          </div>
        </template>
      </Draggable>
      <button @click="addEntry" class="btn text-sm">Add an entry</button>
    </template>
    <!-- Single field -->
    <template v-else>
      <component
        :is="component"
        :field="field"
        :modelValue="model[field.name]"
        @update:modelValue="model[field.name] = $event"
      />
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Draggable from 'vuedraggable';
import useSchema from '@/composables/useSchema';
import FieldString from '@/components/fields/FieldString.vue';
import FieldNumber from '@/components/fields/FieldNumber.vue';
import FieldText from '@/components/fields/FieldText.vue';
import FieldDate from '@/components/fields/FieldDate.vue';
import FieldBoolean from '@/components/fields/FieldBoolean.vue';
import FieldSelect from '@/components/fields/FieldSelect.vue';
import FieldObject from '@/components/fields/FieldObject.vue';
import FieldImage from '@/components/fields/FieldImage.vue';
import FieldMarkdown from '@/components/fields/FieldMarkdown.vue';

const { getDefaultValue } = useSchema();

const components = {
  FieldString,
  FieldNumber,
  FieldDate,
  FieldText,
  FieldBoolean,
  FieldSelect,
  FieldObject,
  FieldImage,
  FieldMarkdown
};

const props = defineProps({
  field: Object,
  model: [String, Number, Boolean, Array, Object]
});

const component = computed(() => {
  const componentName = 'Field' + props.field.type.charAt(0).toUpperCase() + props.field.type.slice(1);
  return components[componentName] || components['FieldText'];
});

const addEntry = () => {
  const empty = getDefaultValue(props.field);
  props.model[props.field.name].push(empty);
};

const removeItem = (index) => {
  props.model[props.field.name].splice(index, 1);
};
</script>