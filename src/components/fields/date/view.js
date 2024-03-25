<template>  
  {{ value }}
</template>

<script setup>
const props = defineProps({
  field: Object,
  value: [String],
});

const sort = (a, b, format) => {
  const dayA = moment(a, format);
  const dayB = moment(b, format);
  if (!dayA.isValid() && !dayB.isValid()) return 0;
  if (!dayA.isValid()) return 1;
  if (!dayB.isValid()) return -1;
  const valA = dayA.valueOf();
  const valB = dayB.valueOf();
  let comparison = 0;
  if (valA < valB) {
    comparison = -1;
  } else if (valA > valB) {
    comparison = 1;
  }

  return comparison;
};

defineExpose({ sort });
</script>