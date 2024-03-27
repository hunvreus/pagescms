<template>
  <div v-if="model && !field.hidden" class="field" :class="`field-type-${field.type}`">
    <div class="flex gap-x-2 items-center mb-2" v-if="field.label !== false">
      <label class="font-medium">{{ field.label || field.name }}</label>
      <div v-if="field.required" class="chip-secondary text-sm">Required</div>
    </div>
    <div v-if="field.description" class="description">{{ field.description }}</div>
    <!-- Default list handler -->
    <template v-if="field.list && !fieldListSupport">
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
            <div class="field-list-item-handle cursor-move py-3 text-neutral-400 hover:text-neutral-950 dark:text-neutral-500 dark:hover:text-white transition-colors">
              <Icon name="Grip" class="h-4 w-4 stroke-2 shrink-0"/>
            </div>
            <div class="w-full">
              <component
                :is="fieldComponent"
                :field="field"
                :modelValue="element"
                @update:modelValue="value => model[field.name][index] = value"
                :ref="el => fieldRefs[index] = el"
              />
            </div>
            <button class="group relative py-3 text-neutral-400 hover:text-neutral-950 dark:text-neutral-500 dark:hover:text-white transition-colors" @click="removeItem(index)">
              <Icon name="Trash2" class="h-4 w-4 stroke-2 shrink-0"/>
              <div class="tooltip-top-right">Remove entry</div>
            </button>
          </div>
        </template>
      </Draggable>
      <button v-if="!field.list?.max || model[field.name].length < field.list.max" @click="addEntry" class="btn text-sm">Add an entry</button>
    </template>
    <!-- Single field or list supporting field -->
    <template v-else>
      <component
        :is="fieldComponent"
        :field="field"
        :modelValue="model[field.name]"
        @update:modelValue="model[field.name] = $event"
        ref="fieldRef"
      />
    </template>
    <ul v-if="field.list && listErrors.length" class="mt-2 text-sm text-red-500 dark:text-red-400">
      <li v-for="(error, index) in listErrors" :key="index" class="flex gap-x-1 items-center">
        <Icon name="Ban" class="h-3 w-3 stroke-[2.5]"/>
        {{ error }}
      </li>
    </ul>
  </div>
</template>

<script setup>
// TODO: add schema path to each field (for traceability)
import { ref, computed } from 'vue';
import Draggable from 'vuedraggable';
import fieldRegistry from '@/fields/fieldRegistry';
import useSchema from '@/composables/useSchema';
import useFieldValidation from '@/composables/useFieldValidation';
import Icon from '@/components/utils/Icon.vue';

const { getDefaultValue } = useSchema();
const { validateListRange } = useFieldValidation();

const props = defineProps({
  field: Object,
  model: [String, Number, Boolean, Array, Object]
});

const fieldRefs = ref([]);
const fieldRef = ref(null);
const fieldErrors = ref([]);
const listErrors = ref([]);

const fieldComponent = computed(() => {
  return fieldRegistry[props.field.type]?.EditComponent || fieldRegistry['text']?.EditComponent || null;
});

const fieldListSupport = computed(() => {
  return fieldRegistry[props.field.type]?.supportsList || false;
});

const addEntry = () => {
  const empty = getDefaultValue(props.field);
  props.model[props.field.name].push(empty);
};

const removeItem = (index) => {
  props.model[props.field.name].splice(index, 1);
};

const validate = () => {
  let allErrors = [];
  fieldErrors.value = [];
  listErrors.value = [];

  if (fieldListSupport.value || !props.field.list) {
    // Validate single field and field list with list support
    if (fieldRef.value && fieldRef.value.validate) {
      fieldErrors.value = fieldRef.value.validate()
    }
  } else {
    // Handle list fields without internal support
    fieldRefs.value.forEach(fieldComponentInstance => {
      if (fieldComponentInstance && fieldComponentInstance.validate) {
        const validationErrors = fieldComponentInstance.validate();
        if (validationErrors.length) fieldErrors.value = fieldErrors.value.concat(validationErrors);
      }
    });
  }

  // List range validation
  if (props.field.list) {
    listErrors.value = validateListRange(props.field, props.model[props.field.name]);
  }

  if (fieldErrors.value.length) allErrors = allErrors.concat(fieldErrors.value);
  if (listErrors.value.length) allErrors = allErrors.concat(listErrors.value);

  return allErrors;
};

defineExpose({ validate });
</script>