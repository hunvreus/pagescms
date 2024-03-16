<template>
  <div class="tabs mb-4">
    <button :class="{ 'active': tab === 'select' }" @click="tab = 'select'">Select a repository</button>
    <button :class="{ 'active': tab === 'create' }" @click="tab = 'create'">Create a new repository</button>
  </div>
  <template v-if="tab === 'create'">
    <RepoCreate :customClass="customClass"/>
  </template>
  <template v-else>
    <RepoSelect :customClass="customClass"/>
  </template>
</template>

<script setup>
import { ref } from 'vue';
import RepoSelect from '@/components/repo/RepoSelect.vue';
import RepoCreate from '@/components/repo/RepoCreate.vue';

const props = defineProps({
  customClass: {
    type: String,
    default: ''
  }
});

const tab = ref('select');
</script>