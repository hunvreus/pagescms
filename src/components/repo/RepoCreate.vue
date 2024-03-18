<template>
  <div class="h-[336px] mb-3 overflow-auto custom-scrollbar" :class="[ (status == 'searching') ? 'processing' : '', props.componentClass ]">
    <ul class="flex flex-col gap-y-1">
      <li v-for="template in templates">
        <button class="link w-full" @click="selectedRepo = template.repository; repoName = template.suggested" :class="[ template.repository === selectedRepo ? 'bg-neutral-100 dark:bg-neutral-750' : '' ]">
          <div v-html="template.icon" class="w-12 mr-2"></div>
          <div class="truncate w-full">
            <div class="flex gap-x-2 items-center">
              <div class="truncate font-medium">{{ template.name }} template</div>
              <Icon v-if="template.repository === selectedRepo" name="Check" class="h-4 w-4 stroke-2 shrink-0 ml-auto"/>
            </div>
            <div class="flex justify-start items-center gap-x-1 text-sm text-neutral-400 dark:text-neutral-500 truncate mt-1">
              <span>Fork {{ template.repository }}</span>
              <a :href="`https://github.com/${template.repository}`" target="_blank" class="h-3 hover:text-neutral-950 dark:hover:text-white"><Icon name="ExternalLink" class="h-3 w-3 stroke-[3] shrink-0"/></a>
            </div>
          </div>
        </button>
      </li>
    </ul>
  </div>
  <div class="flex gap-x-2">
    <Dropdown v-if="profile" :elementClass="'dropdown-top flex-shrink'" :dropdownClass="'!max-w-none w-48 !right-auto left-0'">
      <template #trigger>
        <button class="btn group-x[.dropdown-active]:bg-neutral-100 dark:group-[.dropdown-active]:bg-neutral-850" :title="owner.login">
          <div class="w-6 -ml-1 lg:-ml-1.5"> 
            <img class="h-6 w-6 rounded-md shrink-0" :src="owner.avatar_url" alt="Owner's avatar"/>
          </div>
          <Icon name="ChevronsUpDown" class="h-4 w-4 stroke-2 shrink-0 -mr-1 lg:-mr-1.5"/>
        </button>
      </template>
      <template #content>
        <ul class="max-h-[12.5rem] overflow-y-auto custom-scrollbar">
          <li>
            <button class="link w-full" @click="owner = profile">
              <img class="h-6 w-6 shrink-0 rounded-md" :src="profile.avatar_url" alt="Profile picture"/>
              <div class="text-left font-medium truncate">{{ profile.name || profile.login }}</div>
              <Icon v-if="owner.login === profile.login" name="Check" class="h-4 w-4 stroke-2 shrink-0 ml-auto"/>
            </button>
          </li>
          <li v-for="organization in organizations">
            <button class="link w-full" @click="owner = organization">
              <img class="h-6 w-6 shrink-0 rounded-md" :src="organization.avatar_url" alt="Profile picture"/>
              <div class="text-left font-medium truncate">{{ organization.login }}</div>
              <Icon v-if="owner.login === organization.login" name="Check" class="h-4 w-4 stroke-2 shrink-0 ml-auto"/>
            </button>
          </li>
        </ul>
      </template>
    </Dropdown>
    <input v-model="repoName" type="text" placeholder="Name for your new repository" class="input w-full !pr-8 placeholder-neutral-400 dark:placeholder-neutral-500"/>
    <button class="btn-primary" @click="createRepo()">
      Create
      <div class="spinner-white-sm" v-if="status == 'forking'"></div>
    </button>
  </div>
  <!-- Waiting overlay -->
  <Teleport to="body">
    <div class="waiting" v-show="status == 'forking'"></div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import repoTemplates from '@/assets/repoTemplates.js';
import github from '@/services/github';
import notifications from '@/services/notifications';
import Icon from '@/components/utils/Icon.vue';
import Dropdown from '@/components/utils/Dropdown.vue';

const router = useRouter();

const selectedRepo = ref(repoTemplates[0].repository);
const repoName = ref(repoTemplates[0].suggested);
const owner = ref(null);
const status = ref('');
const profile = ref(null);
const organizations = ref(null);
const templates = ref(repoTemplates);

const props = defineProps({
  componentClass: { type: String, default: '' }
});

const createRepo = async () => {
  status.value = 'forking';
  // Get existing repositories that contain the new name
  const searchResult = await github.searchRepos(`${owner.value.login}/${repoName.value}`);
  const existingRepos = searchResult.items.map(item => item.name);
  // Avoid collision with existing repos
  let safeRepoName = repoName.value;
  let counter = 1;
  // TODO: this probably isn't the same as "startsWith"
  while (existingRepos.includes(safeRepoName)) {
    safeRepoName = `${repoName.value}-${counter}`;
    counter++;
  }
  // Test it's a valid repo name
  const isValid = /^[a-zA-Z0-9]+([\-_\.][a-zA-Z0-9]+)*$/.test(safeRepoName);
  if (!isValid) {
    notifications.notify('The repository name is not valid; it must be alphanumeric with hyphens, underscores and periods.', 'error', { delay: 10000 });
    status.value = 'error';
    return;
  }
  // Create the repo from template
  const [ templateOwner, templateRepo ] = selectedRepo.value.split('/');
  const created = await github.copyRepoTemplate(templateOwner, templateRepo, safeRepoName, owner.value.login);
  if (created) {
    notifications.notify(`"${selectedRepo.value}" successfully forked to "${owner.value.login}/${safeRepoName}".`, 'success');
    // Wait for the repo to be ready (if .pages.yml is there) before redirecting to it
    let attempt = 0;
    while (attempt < 10) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const result = await github.getFile(owner.value.login, safeRepoName, null, '.pages.yml');
      if (result) break;
      attempt++;
    }
    router.push({ name: 'repo-no-branch', params: { owner: owner.value.login, repo: safeRepoName }});
  } else {
    notifications.notify(`The repository couldn't be created from template "${selectedRepo.value}".`, 'error');
  }
  status.value = '';
};

onMounted(async () => {
  profile.value = await github.getProfile();
  owner.value = profile.value;
  organizations.value = await github.getOrganizations();  
});

</script>