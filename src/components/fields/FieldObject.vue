<template>
  <fieldset>
    <field
      v-for="childField in field.fields"
      :key="childField.name"
      :field="childField"
      :model="modelValue"
      ref="fieldRefs"></field>
  </fieldset>
</template>

<script setup>
import { ref } from 'vue';
import Field from '@/components/file/Field.vue';

const props = defineProps({
  field: Object,
  modelValue: Object
});

const fieldRefs = ref([]);

const validate = () => {
  let errors = [];
  fieldRefs.value.forEach(fieldComponentInstance => {
    if (fieldComponentInstance && fieldComponentInstance.validate) {
      errors = errors.concat(fieldComponentInstance.validate());
    }
  });

  return errors;
};

defineExpose({ validate });
</script>