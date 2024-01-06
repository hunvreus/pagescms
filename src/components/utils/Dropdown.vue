<template>
  <div ref="dropdownRef" class="relative group" @click="toggleDropdown" :class="[ isOpen ? 'dropdown-active' : '', props.elementClass ]">
    <slot name="trigger"></slot>
    <Transition>
      <div v-if="isOpen" class="dropdown-content adjust-dark text-sm p-2" role="menu" aria-orientation="vertical" aria-labelledby="menu-button" tabindex="-1" :class="[ dropdownClass ]">
        <slot name="content"></slot>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  elementClass: {
    type: String,
    default: ''
  },
  dropdownClass: {
    type: String,
    default: ''
  }
});

const isOpen = ref(false);
const dropdownRef = ref(null);

const toggleDropdown = (event) => {
  isOpen.value = !isOpen.value;
};

const closeDropdown = (event) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
    isOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', closeDropdown);
});

onUnmounted(() => {
  document.removeEventListener('click', closeDropdown);
});
</script>

<style scoped>
.v-enter-active,
.v-leave-active {
  transition-property: opacity, transform;
  transition-duration: 100ms;
  transition-timing-function: ease-out;
}

.v-enter-to,
.v-leave-from {
  opacity: 1;
  transform: scale(1);
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>