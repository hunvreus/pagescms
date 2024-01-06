<template>
  <div v-if="model && !field.hidden" class="field" :class="field.hidden ? 'hiddden' : ''">
    <label class="label" v-if="field.label">{{ field.label }}</label>
    <div v-if="field.description" class="description">{{ field.description }}</div>
    <!-- List field -->
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
            <component
              :is="fieldComponent"
              :field="field"
              :modelValue="element"
              @update:modelValue="value => model[field.name][index] = value"
            />
            <button class="group relative py-3 text-neutral-400 hover:text-neutral-950 dark:text-neutral-500 dark:hover:text-white transition-colors" @click="removeItem(index)">
              <Icon name="Trash2" class="h-4 w-4 stroke-2 shrink-0"/>
              <div class="tooltip-top-right">Remove entry</div>
            </button>
          </div>
        </template>
      </Draggable>
      <button @click="addEntry" class="btn text-sm">Add an entry</button>
    </template>
    <!-- Single field -->
    <template v-else>
      <template v-if="field.list">
        <component
          :is="fieldComponent"
          :field="field"
          :list="props.field.list || false"
          :modelValue="model[field.name]"
          @update:modelValue="model[field.name] = $event"
        />
      </template>
      <template v-else>
        <component
          :is="fieldComponent"
          :field="field"
          :modelValue="model[field.name]"
          @update:modelValue="model[field.name] = $event"
        />
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
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

const { getDefaultValue } = useSchema();

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
</script>