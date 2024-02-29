<template>  
  <!-- Loading screen -->
  <template v-if="status === 'loading'">
    <div class="loading"></div>
  </template>
  <template v-else>
    <!-- Sidebar -->
    <div class="sidebar" :class="{ 'sidebar-active': isSidebarActive }">
      <div class="sidebar-overlay" @click="isSidebarActive = false"></div>
      <div class="sidebar-trigger" @click="isSidebarActive = true">
        <Icon name="Menu" class="h-4 w-4 stroke-2 shrink-0"/>
      </div>
      <div class="sidebar-content">
        <div class="flex grow flex-col overflow-y-auto border-r border-neutral-200 bg-white dark:border-neutral-750 dark:bg-neutral-950">
          <!-- Repository info and links -->
          <div class="px-3 py-2.5 lg:px-4 lg:py-3">
            <Dropdown>
              <template #trigger>
                <button class="btn group-[.dropdown-active]:bg-neutral-100 dark:group-[.dropdown-active]:bg-neutral-850 w-full">
                  <div class="flex items-center gap-x-3 w-full truncate -ml-1 lg:-ml-1.5">
                    <img class="h-10 w-10 rounded-lg" :src="'https://github.com/' + props.owner + '.png'" alt="Owner's avatar"/>
                    <div class="text-left overflow-hidden">
                      <div class="font-medium truncate">{{ props.repo }}</div>
                      <div class="truncate text-xs">{{ props.branch }}</div>
                    </div>
                  </div>
                  <Icon name="ChevronsUpDown" class="h-4 w-4 stroke-2 shrink-0 -mr-1 lg:-mr-1.5"/>
                </button>
              </template>
              <template #content>
                <ul>
                  <li><button @click.prevent="repoPickerModal.openModal(); isSidebarActive = false;" class="link w-full">Change repository</button></li>
                  <li><hr class="border-t border-neutral-150 dark:border-neutral-750 my-2"/></li>
                  <li><div class="font-medium text-xs pb-1 px-3 text-neutral-400 dark:text-neutral-500">Owner</div></li>
                  <li>
                    <a class="link w-full" :href="`https://github.com/${props.owner}`" target="_blank">
                      <div class="truncate">{{ props.owner }}</div>
                      <Icon name="ExternalLink" class="h-4 w-4 stroke-2 shrink-0 ml-auto text-neutral-400 dark:text-neutral-500"/>
                    </a>
                  </li>
                  <li><hr class="border-t border-neutral-150 dark:border-neutral-750 my-2"/></li>
                  <li><div class="font-medium text-xs pb-1 px-3 text-neutral-400 dark:text-neutral-500">Repository</div></li>
                  <li>
                    <a class="link w-full" :href="`https://github.com/${props.owner}/${props.repo}`" target="_blank">
                      <div class="truncate">{{ props.repo }}</div>
                      <Icon name="ExternalLink" class="h-4 w-4 stroke-2 shrink-0 ml-auto text-neutral-400 dark:text-neutral-500"/>
                    </a>
                  </li>
                  <li><hr class="border-t border-neutral-150 dark:border-neutral-750 my-2"/></li>
                  <li><div class="font-medium text-xs pb-1 px-3 text-neutral-400 dark:text-neutral-500">Branch</div></li>
                  <li v-if="branches.length">
                    <router-link
                      v-for="branch in branches" :to="{ name: route.name, params: {...route.params, branch: branch }}"
                      @click="isSidebarActive = false"
                      class="link w-full"
                    >
                      {{ branch }}
                      <Icon v-if="branch == props.branch" name="Check" class="h-4 w-4 stroke-2 shrink-0 ml-auto"/>
                    </router-link>
                  </li>
                  <li v-else>
                    <div class="py-2 px-3 text-neutral-400 dark:text-neutral-500">No branch</div>
                  </li>
                </ul>
              </template>
            </Dropdown>
          </div>
          <!-- Main navigation: Content, Media, Files and Settings -->
          <nav v-if="repoStore.config?.object !== undefined" class="flex flex-1 flex-col px-3 pb-2.5 lg:px-4 lg:pb-3 sidebar-navigation">
            <ul role="list" class="flex flex-1 flex-col">
              <li>
                <ul role="list" class="space-y-1" v-if="owner && repo && branch && !['error-no-config', 'error-empty-repo'].includes(status)">
                  <!-- Collections and files from the content configuration -->
                  <template v-if="repoStore.config?.object?.content?.length">
                    <li v-for="item in repoStore.config.object.content" :key="item.name">
                      <router-link :to="{ name: 'content', params: { name: item.name } }" @click="isSidebarActive = false" class="link">
                        <Icon :name="item.icon" :fallback="item.type == 'collection' ? 'FileStack' : 'FileText'" class="h-6 w-6 stroke-[1.5] shrink-0"/>
                        {{ item.label || item.name }}
                      </router-link>
                    </li>
                  </template>
                  <li v-if="repoStore.config?.object?.media != null && repoStore.config?.object?.media.input != null && repoStore.config?.object?.media.output != null">
                    <router-link :to="{ name: 'media' }" @click="isSidebarActive = false" class="link">
                      <Icon name="Image" class="h-6 w-6 stroke-[1.5] shrink-0"/>
                      Media
                    </router-link>
                  </li>
                  <!-- Settings -->
                  <li v-if="repoStore.config?.object?.settings !== false">
                    <router-link :to="{ name: 'settings' }" @click="isSidebarActive = false" class="link">
                      <Icon name="Settings" class="h-6 w-6 stroke-[1.5] shrink-0"/>
                      Settings
                    </router-link>
                  </li>
                </ul>
              </li>
            </ul>
          </nav>
          <!-- User profile (includig logout, theme and about) -->
          <div class="flex grid-x-3 max-w-full mt-auto border-t border-neutral-200 dark:border-neutral-750 px-3 py-2.5 lg:px-4 lg:py-3">
            <User/>
            <About/>
          </div>
        </div>
      </div>
    </div>
    <div class="lg:pl-72" id="main">
      <div class="w-full min-h-screen relative pb-16 lg:pb-0">
        <!-- Empty repository -->
        <template v-if="status == 'error-empty-repo'">
          <div class="error h-screen">
            <div class="text-center max-w-md">
              <h1 class="font-semibold text-2xl mb-2">Your repository is empty.</h1>
              <p class="text-neutral-400 dark:text-neutral-500 mb-6">You need to add a <code class="text-sm bg-neutral-100 dark:bg-neutral-850 rounded-lg p-1">.pages.yml</code> file to this repository and create a branch to configure it.</p>
              <div class="flex gap-x-2 justify-center">
                <button class="btn-primary" @click="createConfigFile()">Create a configuration file</button>
              </div>
            </div>
          </div>
        </template>
        <!-- No config -->
        <template v-else-if="status == 'error-no-config'">
          <div class="error h-screen">
            <div class="text-center max-w-md">
              <h1 class="font-semibold text-2xl mb-2">You need a configuration file.</h1>
              <p class="text-neutral-400 dark:text-neutral-500 mb-6">You need to add a <code class="text-sm bg-neutral-100 dark:bg-neutral-850 rounded-lg p-1">.pages.yml</code> file to this repository/branch to configure it.</p>
              <div class="flex gap-x-2 justify-center">
                <button class="btn-primary" @click="createConfigFile()">Create a configuration file</button>
              </div>
            </div>
          </div>
        </template>
        <template v-else>
          <!-- <pre>{{ config.state }}</pre> -->
          <router-view v-slot="{ Component }">
            <component :is="Component" :config="repoStore.config?.object"/>
          </router-view>
        </template>
      </div>
    </div>
    <!-- Repo picker modal -->
    <Modal ref="repoPickerModal" :customClass="'modal-repo-picker'">
      <template #header>Change repository</template>
      <template #content>
        <RepoPicker/>
      </template>
    </Modal>
  </template>
</template>

<script setup>
import { onMounted, ref, reactive, provide, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import config from '@/services/config';
import notifications from '@/services/notifications';
import github from '@/services/github';
import About from '@/components/About.vue';
import Icon from '@/components/utils/Icon.vue';
import Dropdown from '@/components/utils/Dropdown.vue';
import Modal from '@/components/utils/Modal.vue';
import RepoPicker from '@/components/RepoPicker.vue';
import User from '@/components/User.vue';

const route = useRoute();
const router = useRouter();

const props = defineProps({
  owner: String,
  repo: String,
  branch: String,
  path: String,
  name: String
});

const branches = ref(null);
const status = ref('loading');
const repoPickerModal = ref(null);
const isSidebarActive = ref(false);

const repoStore = reactive({
  owner: props.owner?.toLowerCase(),
  repo: props.repo?.toLowerCase(),
  branch: props.branch,
  config: computed(() => config.state[`${repoStore.owner}/${repoStore.repo}/${repoStore.branch}`]),
  details: null
});
provide('repoStore', repoStore);

const configValidationErrors = computed(() => repoStore.config.validation.filter(entry => entry.severity === 'error'));

const createConfigFile = async () => {
  status.value = 'loading';
  const data = await github.saveFile(repoStore.owner, repoStore.repo, repoStore.branch, '.pages.yml', '');
  if (data) {
    notifications.notify(`The configuration file (.pages.yml) was successfully created.`, 'success');
    await setRepo();
    status.value = '';
    router.push({ name: 'settings', params: { ...route.params } });
  } else {
    notifications.notify(`The configuration file (.pages.yml) couldn't be created. Try reloading the page.`, 'error', { delay: 0 });
    status.value = '';
  }
};

const setRepo = async () => {
  // TODO: move all of this to the router and prevent fetching repo details and config when redirecting.
  status.value = 'loading';
  branches.value = null;
  repoStore.owner = props.owner?.toLowerCase();
  repoStore.repo = props.repo?.toLowerCase();
  repoStore.branch = props.branch;
  repoStore.details = null;
  
  // Check if the repo exists and retrieve the repo details (private/public, branches, etc)
  const repoDetails = await github.getRepo(repoStore.owner, props.repo);
  if (!repoDetails) {
    notifications.notify(`The repo "${repoStore.owner}/${props.repo}" doesn't exist.`, 'error', { delay: 10000 });
    router.push({ name: 'home' });
    return;
  } else {
    repoStore.details = repoDetails;
  }

  // We retrieve the list of branches
  const repoBranches = await github.getBranches(repoStore.owner, props.repo);
  branches.value = repoBranches;

  if (repoBranches.length === 0) {
    // Empty repository
    notifications.notify('Your repository is empty.', 'warning');
    status.value = 'error-empty-repo';
    return;
  } else if (!props.branch) {
    // If the branch isn't provided, we use the default one
    notifications.notify(`No branch provided. Redirecting you to the default branch ("${repoDetails.default_branch}").`, 'warning');
    router.push({ name: 'content-root', params: { ...route.params, branch: repoDetails.default_branch } });
    return;
  } else if (!repoBranches.includes(props.branch)) {
    // Branch doesn't exists, switch to the default one
    notifications.notify(`The branch "${props.branch}" doesn't exist. Redirecting you to the default branch ("${repoDetails.default_branch}").`, 'error');
    router.push({ name: route.name, params: { ...route.params, branch: repoDetails.default_branch } });
    return;
  }

  // Set the configuration for this repo/branch
  await config.set(repoStore.owner, repoStore.repo, repoStore.branch);

  // We potentially redirect the user based on the config we fetched  
  if (!repoStore.config ) {
    // No config file
    notifications.notify('No configuration file (.pages.yml) in the repository.', 'warning');
    status.value = 'error-no-config';
    return;
  } else if (!repoStore.config.object) {
    // Empty config
    if (route.name !== 'settings') {
      notifications.notify('Your settings are empty, redirecting you to the settings page.', 'warning');
      router.push({ name: 'settings' });
    } else {
      notifications.notify('Your settings are empty.', 'warning');
    }
  } else {
    const validationErrors = repoStore.config.validation.filter(entry => entry.severity === 'error');
    if (validationErrors.length > 0) {
      // Errors in config
      if (route.name !== 'settings') {
        notifications.notify('Your settings are not valid, redirecting you to the settings page to fix errors.', 'warning');
        router.push({ name: 'settings' });
      } else {
        notifications.notify('Your settings are not valid, please fix errors.', 'warning');
      }
    } else {
      if (['content', 'content-root'].includes(route.name) && !repoStore.config.object.content?.[0]) {
        if (repoStore.config.object.media) {
          router.push({ name: 'media' });
        } else {
          notifications.notify('No settings for content, redirecting you to the settings page.', 'warning');
          router.push({ name: 'settings' });
        }
      } else if (route.name === 'content-root' && repoStore.config.object.content?.[0]?.name) {
          router.push({ name: 'content', params: { name: repoStore.config.object.content[0].name } });
      } else if (route.name === 'media' && !repoStore.config.object.media) {
        notifications.notify('No settings for media, redirecting you to the settings page.', 'warning');
        router.push({ name: 'settings' });
      }
    }
  }

  status.value = '';
};

onMounted(async () => {
  setRepo();
});

watch(
  [
    () => props.owner,
    () => props.repo,
    () => props.branch
  ],
  async () => {
    await setRepo();
  }
);
</script>