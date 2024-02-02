<template>
  <div v-if="model && !field.hidden" class="field">
    <div class="flex gap-x-2 items-center mb-2">
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
      <button @click="addEntry" class="btn text-sm">Add an entry</button>
      <ul v-if="listValidationErrors.length" class="mt-2 text-sm text-red-500 dark:text-red-400">
        <li v-for="(error, index) in listValidationErrors" :key="index" class="flex gap-x-1 items-center">
          <Icon name="Ban" class="h-3 w-3 stroke-[2.5]"/>
          {{ error }}
        </li>
      </ul>
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
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import Draggable from 'vuedraggable';
import useSchema from '@/composables/useSchema';
import Icon from '@/components/utils/Icon.vue';
import FieldString from '@/components/fields/FieldString.vue';
import FieldNumber from '@/components/fields/FieldNumber.vue';
import FieldText from '@/components/fields/FieldText.vue';
import FieldDate from '@/components/fields/FieldDate.vue';
import FieldBoolean from '@/components/fields/FieldBoolean.vue';
import FieldSelect from '@/components/fields/FieldSelect.vue';
import FieldObject from '@/components/fields/FieldObject.vue';
import FieldImage from '@/components/fields/FieldImage.vue';
import FieldCode from '@/components/fields/FieldCode.vue';
import FieldRichText from '@/components/fields/FieldRichText.vue';

const { getDefaultValue, sanitizeObject } = useSchema();

const fieldComponents = {
  string: { component: FieldString },
  number: { component: FieldNumber },
  date: { component: FieldDate },
  text: { component: FieldText },
  boolean: { component: FieldBoolean, },
  select: { component: FieldSelect },
  object: { component: FieldObject },
  image: { component: FieldImage, listSupport: true },
  code: { component: FieldCode },
  'rich-text': { component: FieldRichText },
};

const props = defineProps({
  field: Object,
  model: [String, Number, Boolean, Array, Object]
});

const fieldRefs = ref([]);
const fieldRef = ref(null);
const listValidationErrors = ref([]);

const fieldComponent = computed(() => {
  return (fieldComponents[props.field.type] && fieldComponents[props.field.type].component) ? fieldComponents[props.field.type].component : FieldText;
});

const fieldListSupport = computed(() => {
  return (fieldComponents[props.field.type] && fieldComponents[props.field.type].listSupport) ? fieldComponents[props.field.type].listSupport : false;
});

const addEntry = () => {
  const empty = getDefaultValue(props.field);
  props.model[props.field.name].push(empty);
};

const removeItem = (index) => {
  props.model[props.field.name].splice(index, 1);
};

const validate = () => {
  let errors = [];
  listValidationErrors.value = [];

  if (fieldListSupport.value || !props.field.list) {
    // Validate simple field or field with list support
    if (fieldRef.value && fieldRef.value.validate) {
      errors = errors.concat(fieldRef.value.validate());
    }
  } else {
    // Handle list fields without internal support
    fieldRefs.value.forEach(fieldComponentInstance => {
      if (fieldComponentInstance && fieldComponentInstance.validate) {
        errors = errors.concat(fieldComponentInstance.validate());
      }
    });
  }

  // Sanitize and validate the list for min/max
  if (props.field.list) {
    const sanitizedList = props.model[props.field.name].filter(entry => sanitizeObject(entry));
    const listLength = sanitizedList.length;

    if (props.field.list.min && listLength < props.field.list.min) {
      const errorMsg = `At least ${props.field.list.min} entries are required.`;
      errors.push(errorMsg);
      listValidationErrors.value.push(errorMsg);
    }
    if (props.field.list.max && listLength > props.field.list.max) {
      const errorMsg = `No more than ${props.field.list.max} entries are allowed.`;
      errors.push(errorMsg);
      listValidationErrors.value.push(errorMsg);
    }
  }

  return errors;
};

defineExpose({ validate });
</script>