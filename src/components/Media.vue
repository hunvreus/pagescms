<template>
  <main class="relative min-h-screen" v-if="config.media">
    <div class="max-w-screen-3xl mx-auto p-4 lg:p-8">
      <header class="flex gap-x-2">
        <h1 class="font-semibold text-2xl lg:text-4xl mb-8 tracking-tight">Media</h1>
      </header>
      <FileBrowser
        :owner="owner"
        :repo="repo"
        :branch="branch"
        :root="config.media.input"
        :defaultPath="config.media.default"
        :filterByExtensions="config.media.extensions"
        :filterByCategories="config.media.categories"
        :hasBreadcrumb="true"
      />
    </div>
  </main>
</template>

<script setup>
import FileBrowser from '@/components/FileBrowser.vue';

const props = defineProps({
  config: {
    type: Object,
    default: () => (null),
  },
  owner: { type: String },
  repo: { type: String },
  branch: { type: String }
});
</script>