<template>  
  <template v-if="status == 'loading'">
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
                  <div class="flex items-center gap-x-3 w-full">
                    <img class="h-10 w-10 rounded-lg -ml-1 lg:-ml-1.5" :src="'https://github.com/' + props.owner + '.png'" alt="Owner's avatar"/>
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
                  <li>
                    <router-link
                      v-for="branch in branches" :to="{ name: route.name, params: {...route.params, branch: branch }}"
                      @click="isSidebarActive = false"
                      class="link w-full"
                    >
                      {{ branch }}
                      <Icon v-if="branch == props.branch" name="Check" class="h-4 w-4 stroke-2 shrink-0 ml-auto"/>
                    </router-link>
                  </li>
                </ul>
              </template>
            </Dropdown>
          </div>
          <!-- Main navigation: Content, Media, Files and Settings -->
          <nav v-if="config !== undefined" class="flex flex-1 flex-col px-3 pb-2.5 lg:px-4 lg:pb-3 sidebar-navigation">
            <ul role="list" class="flex flex-1 flex-col">
              <li>
                <ul role="list" class="space-y-1">
                  <!-- Collections and files from the content configuration -->
                  <template v-if="config && config.content && config.content.length">
                    <li v-for="item in config.content" :key="item.name">
                      <router-link :to="{ name: 'content', params: { name: item.name } }" @click="isSidebarActive = false" class="link">
                        <Icon :name="item.icon" :fallback="item.type == 'collection' ? 'FileStack' : 'FileText'" class="h-6 w-6 stroke-[1.5] shrink-0"/>
                        {{ item.label }}
                      </router-link>
                    </li>
                  </template>
                  <li v-if="config && config.media">
                    <router-link :to="{ name: 'media' }" @click="isSidebarActive = false" class="link">
                      <Icon name="Image" class="h-6 w-6 stroke-[1.5] shrink-0"/>
                      Media
                    </router-link>
                  </li>
                  <li v-if="(status !== 'error-no-config') && (!config || (config && config.settings !== false))">
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
        <!-- No config -->
        <template v-if="status == 'error-no-config'">
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
        <template v-if="status == 'error-no-valid'">
          <div class="error h-screen">
            <div class="text-center max-w-md">
              <h1 class="font-semibold text-2xl mb-2">Nothing to see here.</h1>
              <p class="text-neutral-400 dark:text-neutral-500 mb-6">Your current settings prevent you from doing anything.</p>
              <div class="flex gap-x-2 justify-center">
                <a class="btn-primary" :href="`https://github.com/${props.owner}/${props.repo}/blob/${props.branch}/.pages.yml`" target="_blank">Review settings on GitHub</a>
              </div>
            </div>
          </div>
        </template>
        <template v-else>
          <router-view v-slot="{ Component }">
            <component :is="Component" :config="config" v-on="getEventListeners(Component)"/>
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
import { onMounted, ref, reactive, provide, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import YAML from 'js-yaml';
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
const config = ref(null);
const status = ref('loading');
const repoPickerModal = ref(null);
const isSidebarActive = ref(false);

const repoStore = reactive({
  owner: props.owner,
  repo: props.repo,
  branch: props.branch,
  config: config,
  details: null
});
provide('repoStore', repoStore);

const createConfigFile = async () => {
  status.value = 'loading';
  const data = await github.saveFile(props.owner, props.repo, props.branch, '.pages.yml', '');
  if (data) {
    notifications.notify(`The configuration file (.pages.yml) was successfully created.`, 'success');
    await setRepo();
    status.value = '';
    router.push({ name: 'settings', params: { ...route.params } });
  } else {
    notifications.notify(`The configuration file (.pages.yml) couldn't be created. Try reloading the page.`, 'error', 0);
    status.value = '';
  }
};

const getEventListeners = (Component) => {
  const listeners = {};
  // For the Editor component, we add a listener on file saved to trigger a notification when updating
  // the settings offering to apply the changes (see handleFileSaved below)
  const componentName = Component.type.__name || Component.type.name;
  if (componentName === 'Editor') {
    listeners['file-saved'] = handleFileSaved;
  }
  return listeners;
};

const handleFileSaved = (filename) => {
  if (filename == '.pages.yml') {
    notifications.notify(
      'You changed your settings, do you want to apply your changes?',
      'info',
      0,
      [
        {
          label: 'Apply new settings',
          handler: async (id) => {
            notifications.close(id);
            await setRepo();
          },
          primary: true
        }
      ]
    );
  }
};

const setRepo = async () => {
  status.value = 'loading';

  branches.value = null;
  config.value = null;

  repoStore.owner = props.owner;
  repoStore.repo = props.repo;
  repoStore.branch = props.branch;
  repoStore.details = null;
  
  const repoDetails = await github.getRepo(props.owner, props.repo);
  if (!repoDetails) {
    notifications.notify(`The repo "${props.owner}/${props.repo}" doesn't exist.`, 'error');
    router.push({ name: 'home' });
    return;
  } else {
    repoStore.details = repoDetails;
  }
  
  if (!props.branch) {
    // If the branch isn't provided, we use the default one
    notifications.notify(`No branch provided. Redirecting you to the default branch ("${repoDetails.default_branch}").`, 'warning');
    router.push({ name: 'content-root', params: { ...route.params, branch: repoDetails.default_branch } });
    return;
  } else {
    // We retrieve the list of branches and check if the provided branch exists
    const repoBranches = await github.getBranches(props.owner, props.repo);
    if (!repoBranches.includes(props.branch)) {
      notifications.notify(`The branch "${props.branch}" doesn't exist. Redirecting you to the default branch ("${repoDetails.default_branch}").`, 'error', 0);
      router.push({ name: route.name, params: { ...route.params, branch: repoDetails.default_branch } });
      return;
    }
    branches.value = repoBranches;
  }  

  const configFile = await github.getFile(props.owner, props.repo, props.branch, '.pages.yml', true);
  
  if (configFile === undefined || configFile === null) {
    notifications.notify('No configuration file (.pages.yml) in the repository.', 'warning');
    status.value = 'error-no-config';
    return;
  } else if (!configFile || !configFile.trim()) {
    // TODO: add proper schema validation
    notifications.notify('Your settings are empty, redirecting you to the settings page.', 'warning');
    router.push({ name: 'settings', params: { ...route.params } });
  } else {
    config.value = YAML.load(configFile);
    if (config.value.media && typeof config.value.media === 'string') {
      config.value.media = {
        input: config.value.media,
        output: `/${config.value.media}`,
      };
    }
    // If the user is on the settings page and config.value.settings === false, we redirect to the content page
    if (route.name === 'settings' && config.value.settings === false) {
      if (config.value?.content?.length > 0) {
        router.push({ name: 'content', params: { ...route.params, name: config.value.content[0].name } });
      } else if (config.value && config.value.media) {
        router.push({ name: 'media' });
      } else {
        notifications.notify('No valid route to display.', 'warning');
        status.value = 'error-no-valid';
        return;
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
