<template>
  <template v-if="route.name == 'content'">
    <template v-if="schema && schema.type == 'collection'">
      <Collection
        :owner="owner"
        :repo="repo"
        :branch="branch"
        :name="name"
        :config="config"
      />
    </template>
    <template v-else-if="schema && schema.type == 'single'">
      <Editor
        :owner="owner"
        :repo="repo"
        :branch="branch"
        :name="name"
        :config="config"
        :path="schema.path"
        :format="schema.format"
        :title="schema.label"
      />
    </template>
  </template>
  <template v-else>
    <router-view v-slot="{ Component }">
      <component
      :is="Component" :config="config"/>
    </router-view>
  </template>
</template>

<script setup>
import { onMounted, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import useSchema from '@/composables/useSchema';
import Editor from '@/components/file/Editor.vue';
import Collection from '@/components/Collection.vue';

const route = useRoute();
const router = useRouter();
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

const redirectName = () => {
  if (route.name == 'content-root') {
    router.push({ name: 'content', params: { owner: props.owner, repo: props.repo, branch: props.branch, name: props.config.content[0].name } });
  }
};

onMounted(async () => {
  redirectName();
});

watch(() => props.name, (newName, oldName) => {
  redirectName();
});
</script>
