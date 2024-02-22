<template>
  <div class="relative">
    <input v-model="keywords" type="text" placeholder="e.g. vuejs/vue" class="input w-full !pr-8 placeholder-neutral-400 dark:placeholder-neutral-500"/>
    <div class="absolute right-3 top-1/2 -translate-y-1/2 opacity-50">
      <div v-if="status == 'searching'" class="spinner-black-sm"></div>
      <Icon v-else name="Search" class="h-4 w-4 stroke-2 shrink-0"/>
    </div>
  </div>
  <div class="max-h-[calc(100vh-12.5rem)] h-[352px] mt-3 overflow-auto custom-scrollbar" :class="[ (status == 'searching') ? 'processing' : '' ]">
    <ul v-if="query && results && results.length" class="flex flex-col gap-y-2">
      <li v-for="result in results">
        <div v-if="!(result.permissions && result.permissions.push) || isCurrentRepo(result)" class="link-text cursor-not-allowed" :class="[ isCurrentRepo(result) ? 'bg-neutral-100 dark:bg-neutral-750' : '' ]">
          <div class="truncate w-full" :class="[ isCurrentRepo(result) ? '' : 'opacity-50' ]">
            <div class="flex gap-x-2 items-center">
              <div class="truncate font-medium">{{ result.full_name }}</div>
              <div v-if="result.private" class="chip-primary">Private</div>
              <Icon v-if="isCurrentRepo(result)" name="Check" class="h-4 w-4 stroke-2 shrink-0 ml-auto"/>
            </div>
            <div class="text-sm text-neutral-400 dark:text-neutral-500 truncate mt-1">
              Updated {{ $filters.fromNow(result.pushed_at) }}
              <span v-if="result.description"> • {{ result.description }}</span>
            </div>
          </div>
        </div>
        <router-link v-else :to="{ path: '/' + result.full_name + '/' + result.default_branch }" class="link">
          <div class="truncate">
            <div class="flex gap-x-2 items-center">
              <div class="truncate font-medium">{{ result.full_name }}</div>
              <div v-if="result.private" class="chip-primary">Private</div>
            </div>
            <div class="text-sm text-neutral-400 dark:text-neutral-500 truncate mt-1">
              Updated {{ $filters.fromNow(result.pushed_at) }}
              <span v-if="result.description"> • {{ result.description }}</span>
            </div>
          </div>
        </router-link>
      </li>
    </ul>
    <div v-else-if="keywords && results && results.length == 0" class="text-center p-6">
      <div class="font-medium">We couldn't find any matching repository.</div>
      <div class="text-neutral-400 dark:text-neutral-500">Try and fill in the complete name of the repo (e.g. "vuejs/vue").</div>
    </div>
    <div v-else class="text-center p-6">
      <div class="font-medium">Find your GitHub repository.</div>
      <div class="text-neutral-400 dark:text-neutral-500">Search by organization and repository name . You need write permissions on the repository.</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, inject } from 'vue';
import { debounce } from 'lodash';
import Icon from '@/components/utils/Icon.vue';
import notifications from '@/services/notifications';
import github from '@/services/github';

const repoStore = inject('repoStore', { owner: null, repo: null });

const keywords = ref('');
const results = ref([]);
const status = ref('');
const query = computed(() => keywords.value.trim());

const isCurrentRepo = (item) => {
  return repoStore && repoStore.owner && repoStore.repo && (item.full_name === `${repoStore.owner}/${repoStore.repo}`);
};

const debouncedSearchRepos = debounce(
  async () => {
    if (query.value === '') {
      results.value = [];
      return;
    }
    status.value = 'searching';
    const searchResults = await github.searchRepos(query.value);
    if (searchResults) {
      // Bring repos with push permissions at the top
      results.value = searchResults.items.sort((a, b) => {
        const aPush = a.permissions && a.permissions.push;
        const bPush = b.permissions && b.permissions.push;
        return (bPush - aPush);
      });
      status.value = '';
    } else {
      notifications.notify(`Search failed.`, 'error');
      status.value = 'error';
    }
  },
  500
);

watch(keywords, () => {
  debouncedSearchRepos();
});
</script>