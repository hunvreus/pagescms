<template>
  <div class="relative">
    <input v-model="keywords" type="text" placeholder="e.g. vuejs/vue" class="input w-full !pr-8"/>
    <div class="absolute right-3 top-1/2 -translate-y-1/2 opacity-50">
      <div v-if="status == 'searching'" class="spinner-black-sm"></div>
      <svg v-else class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
        <path d="M21 21L16.65 16.65M19 11C19 15.4183 15.4183 19 11 19C6.58172 19 3 15.4183 3 11C3 6.58172 6.58172 3 11 3C15.4183 3 19 6.58172 19 11Z"/>
      </svg>
    </div>
  </div>
  <div class="h-[352px] mt-3 overflow-auto" :class="[ (status == 'searching') ? 'processing' : '' ]">
    <ul v-if="query && results && results.length" class="flex flex-col gap-y-2">
      <li v-for="result in results">
        <div v-if="!(result.permissions && result.permissions.push) || isCurrentRepo(result)" class="link-text cursor-not-allowed" :class="[ isCurrentRepo(result) ? 'bg-neutral-100' : '' ]">
          <div class="truncate w-full" :class="[ isCurrentRepo(result) ? '' : 'opacity-50' ]">
            <div class="flex gap-x-2 items-center">
              <div class="truncate font-medium">{{ result.full_name }}</div>
              <div v-if="result.private" class="text-xs rounded-full px-2 py-0.5 bg-neutral-950 text-white font-normal">Private</div>
              <svg v-if="isCurrentRepo(result)" class="shrink-0 h-4 w-4 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 6L9 17L4 12"/>
              </svg>
            </div>
            <div class="text-sm text-neutral-400 truncate mt-1">
              Updated {{ $filters.fromNow(result.pushed_at) }}
              <span v-if="result.description"> • {{ result.description }}</span>
            </div>
          </div>
        </div>
        <router-link v-else :to="{ path: '/' + result.full_name + '/' + result.default_branch }" class="link">
          <div class="truncate">
            <div class="flex gap-x-2 items-center">
              <div class="truncate font-medium">{{ result.full_name }}</div>
              <div v-if="result.private" class="text-xs rounded-full px-2 py-0.5 bg-neutral-950 text-white font-normal">Private</div>
            </div>
            <div class="text-sm text-neutral-400 truncate mt-1">
              Updated {{ $filters.fromNow(result.pushed_at) }}
              <span v-if="result.description"> • {{ result.description }}</span>
            </div>
          </div>
        </router-link>
      </li>
    </ul>
    <div v-else-if="keywords && results && results.length == 0" class="text-center p-6">
      <div class="font-medium">We couldn't find any matching repository.</div>
      <div class="text-neutral-400">Try and fill in the complete name of the repo (e.g. "vuejs/vue").</div>
    </div>
    <div v-else class="text-center p-6">
      <div class="font-medium">Find your GitHub repository.</div>
      <div class="text-neutral-400">Search by organization and repository name . You need write permissions on the repository.</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, inject } from 'vue';
import _ from 'lodash';
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

const debouncedSearchRepos = _.debounce(
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