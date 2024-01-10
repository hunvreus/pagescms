<template>  
  <template v-if="model">
    <table class="datagrid">
      <tbody>
        <tr v-for="(row, rowIndex) in model" :key="rowIndex">
          <td
            v-for="(cell, columnIndex) in row"
            :key="columnIndex"
            @click="selectCell(rowIndex, columnIndex)"
            @dblclick="editCell(rowIndex, columnIndex)"
            :class="{ 'selected': selectedCell.row === rowIndex && selectedCell.col === columnIndex }"
            :id="`cell-${rowIndex}-${columnIndex}`"
          >
            <div class="cell-content">
              {{ cell }}
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <Teleport :to="selectedCell.row !== null && selectedCell.col !== null ? `#cell-${selectedCell.row}-${selectedCell.col}` : 'body'">
      <textarea 
        v-if="selectedCell.row !== null && selectedCell.col !== null"
        v-show="isEditing"
        v-model="currentEditingValue"
        ref="editField"
        class="w-full h-full p-1"
      ></textarea>
    </Teleport>
  </template>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { parse } from 'csv-js';

const emit = defineEmits(['update:model-value']);

const props = defineProps({
  modelValue: String
});

const model = ref(null);
const selectedCell = ref({ row: 0, col: 0 });
const editField = ref(null);
const isEditing = ref(false);

onMounted(async () => {
  model.value = await parse(props.modelValue, { header: true });
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('click', onClickOutside);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('click', onClickOutside);
});

const selectCell = (row, col) => {
  selectedCell.value = { row, col };
};

const editCell = (row, col) => {
  row = row || selectedCell.value.row;
  col = col || selectedCell.value.col;
  selectCell(row, col);
  isEditing.value = true;
  nextTick(() => {
    if (editField.value) {
      editField.value.focus();
    }
  });
};

const currentEditingValue = computed({
  get() {
    if (model.value && selectedCell.value.row !== null && selectedCell.value.col !== null) {
      return model.value[selectedCell.value.row][selectedCell.value.col];
    }
    return '';
  },
  set(value) {
    if (model.value && selectedCell.value.row !== null && selectedCell.value.col !== null) {
      model.value[selectedCell.value.row][selectedCell.value.col] = value;
    }
  }
});

watch(selectedCell, (newVal, oldVal) => {
  if (newVal.row !== oldVal.row || newVal.col !== oldVal.col) {
    isEditing.value = false;
  }
});

const arrayToCsv = (rows) => {
  let lines = [];
  rows.forEach(row => {
    lines.push(row.join(','));
  });
  return lines.join('\n');
};

const onClickOutside = (event) => {
  if (isEditing.value && editField.value && !editField.value.contains(event.target)) {
    isEditing.value = false;
  }
};

watch(model, (newVal, oldVal) => {
  emit('update:model-value', arrayToCsv(model.value));
}, { deep: true });

const onKeydown = (event) => {
  if (selectedCell.value.row !== null && selectedCell.value.col !== null) {
    if (!isEditing.value) {
      switch (event.key) {
        case 'ArrowUp':
          selectedCell.value.row = Math.max(selectedCell.value.row - 1, 0);
          break;
        case 'ArrowDown':
          selectedCell.value.row = Math.min(selectedCell.value.row + 1, model.value.length - 1);
          break;
        case 'ArrowLeft':
          selectedCell.value.col = Math.max(selectedCell.value.col - 1, 0);
          break;
        case 'ArrowRight':
          selectedCell.value.col = Math.min(selectedCell.value.col + 1, model.value[0].length - 1);
          break;
        case 'Enter':
          event.preventDefault();
          event.stopPropagation();
          editCell();
          return;
        case 'Backspace':
        case 'Delete':
          model.value[selectedCell.value.row][selectedCell.value.col] = '';
          break;
        default:
          if (event.key.length === 1 && event.key.match(/\S/)) {
            model.value[selectedCell.value.row][selectedCell.value.col] = '';
            editCell();
          }
          break;
      }
    }

    if (event.key == 'Escape' && isEditing.value) {
      isEditing.value = false;
      return;
    } else if (event.key == 'Escape' && !isEditing.value) {
      selectedCell.value = { row: null, col: null };
      return;
    }
  } else {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      selectedCell.value = { row: 0, col: 0 };
    }
  }
};
</script>