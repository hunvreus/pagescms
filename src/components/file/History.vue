<template>
  <template v-if="status == 'loading'">
    <button disabled class="link group-[.dropdown-active]:bg-neutral-100" :class="[ elementClass ]">
      Loading history
      <div class="spinner-black-sm"></div>
    </button>
  </template>
  <template v-else-if="commits.length">
    <Dropdown :dropdownClass="'!max-w-none !lg:max-w-full min-w-36'">
      <template #trigger>
        <button class="btn-secondary group-[.dropdown-active]:bg-neutral-100" :class="[ elementClass ]">
          <div class="truncate"><span class="hidden lg:inline">Updated </span>{{ moment(commits[0].commit.author.date).fromNow() }}</div>
        </button>
      </template>
      <template #content>
          <ul>
            <li v-for="commit in commits.slice(0, 5)">
              <a :href="commit.html_url" :title="commit.commit.message" target="_blank" class="link">
                <img v-if="commit.author" :src="commit.author.avatar_url" class="h-5 w-5 rounded-full hidden lg:block"/>
                <div class="truncate">
                  <span class="truncate">{{ moment(commit.commit.author.date).fromNow() }}</span>
                </div>
                <svg class="shrink-0 h-4 w-4 ml-auto text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21 9L21 3M21 3H15M21 3L13 11M10 5H7.8C6.11984 5 5.27976 5 4.63803 5.32698C4.07354 5.6146 3.6146 6.07354 3.32698 6.63803C3 7.27976 3 8.11984 3 9.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21H14.2C15.8802 21 16.7202 21 17.362 20.673C17.9265 20.3854 18.3854 19.9265 18.673 19.362C19 18.7202 19 17.8802 19 16.2V14"/>
                </svg>
              </a>
            </li>
            <li><hr class="border-t border-neutral-150 my-2"/></li>
            <li>
              <a :href="`https://github.com/${owner}/${repo}/commits/${branch}/${path}`" target="_blank" class="link">
                <div>Full history</div>
                <svg class="shrink-0 h-4 w-4 ml-auto text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21 9L21 3M21 3H15M21 3L13 11M10 5H7.8C6.11984 5 5.27976 5 4.63803 5.32698C4.07354 5.6146 3.6146 6.07354 3.32698 6.63803C3 7.27976 3 8.11984 3 9.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21H14.2C15.8802 21 16.7202 21 17.362 20.673C17.9265 20.3854 18.3854 19.9265 18.673 19.362C19 18.7202 19 17.8802 19 16.2V14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </a>
            </li>
          </ul>
      </template>
    </Dropdown>
  </template>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import moment from 'moment';
import github from '@/services/github';
import Dropdown from '@/components/utils/Dropdown.vue';

const props = defineProps({
  owner: { type: String },
  repo: { type: String },
  branch: { type: String },
  path: { type: String },
  sha: { type: String },
  elementClass: {
    type: String,
    default: ''
  },
});

const commits = ref([]);
const status = ref('');

const setHistory = async () => {
  status.value = 'loading';
  commits.value = await github.getCommits(props.owner, props.repo, props.branch, props.path);
  status.value = '';
};

watch(() => props.sha, (newSha, oldSha) => {
  setHistory();
});

onMounted(async () => {
  setHistory();
});
</script>