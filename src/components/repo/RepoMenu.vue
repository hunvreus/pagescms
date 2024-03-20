<template>
  <div class="tabs mb-4">
    <button :class="{ 'active': tab === 'select' }" @click="tab = 'select'">Select<span class="max-sm:hidden"> a repository</span></button>
    <button :class="{ 'active': tab === 'create' }" @click="tab = 'create'">Create<span class="max-sm:hidden"> a new repository</span></button>
  </div>
  <template v-if="tab === 'create'">
    <RepoCreate :componentClass="componentClass"/>
  </template>
  <template v-else>
    <RepoSelect :componentClass="componentClass"/>
  </template>
</template>

<script setup>
import { ref } from 'vue';
import RepoSelect from '@/components/repo/RepoSelect.vue';
import RepoCreate from '@/components/repo/RepoCreate.vue';

const props = defineProps({
  componentClass: {
    type: String,
    default: ''
  }
});

const tab = ref('select');
</script>