<template>
  <template v-if="route.name == 'content'">
    <template v-if="schema?.type == 'collection'">
      <Collection
        :owner="owner"
        :repo="repo"
        :branch="branch"
        :name="name"
        :config="config"
      />
    </template>
    <template v-else-if="schema?.type == 'file'">
      <Editor
        :owner="owner"
        :repo="repo"
        :branch="branch"
        :name="name"
        :config="config"
        :path="schema.path"
        :format="schema.format"
        :title="schema.label || schema.name"
      />
    </template>
    <template v-else>
      <div class="error h-screen">
        <div class="text-center max-w-md">
          <h1 class="font-semibold tracking-tight text-2xl mb-2">Something's not right.</h1>
          <p class="text-neutral-400 dark:text-neutral-500 mb-6">This route doesn't match anything valid in your configuration. Your settings may be wrong.</p>
          <div class="flex gap-x-2 justify-center">
            <router-link class="btn-primary" :to="{name: 'settings'}">Review settings</router-link>
          </div>
        </div>
      </div>
    </template>
  </template>
  <template v-else>
    <router-view v-slot="{ Component }">
      <component :is="Component" :config="config"/>
    </router-view>
  </template>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import useSchema from '@/composables/useSchema';
import Editor from '@/components/file/Editor.vue';
import Collection from '@/components/Collection.vue';

const route = useRoute();
const { getSchemaByName } = useSchema();

const props = defineProps({
  owner: String,
  repo: String,
  branch: String,
  name: String,
  path: String,
  config: Object
});

const schema = computed(() => getSchemaByName(props.config, props.name));
</script>
