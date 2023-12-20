<template>
  <div v-if="status == 'loading'" class="bg-neutral-150 border-neutral-150 py-2 px-3 h-24 rounded-xl flex items-center justify-center">
    <div class="spinner-black"></div>
  </div>
  <div v-else class="editor">
    <!-- Editor buttons -->
    <div v-if="editor" class="tiptap-controls" :class="{ 'tiptap-controls-focused': isEditorFocused }">
      <div class="tiptap-controls-wrapper">
        <!-- Bold -->
        <button
          @click="editor.chain().focus().toggleBold().run()"
          :disabled="!editor.can().chain().focus().toggleBold().run()"
          class="tiptap-control group relative"
          :class="{ 'tiptap-control-active': editor.isActive('bold') }"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 12H14C16.2091 12 18 10.2091 18 8C18 5.79086 16.2091 4 14 4H6V12ZM6 12H15C17.2091 12 19 13.7909 19 16C19 18.2091 17.2091 20 15 20H6V12Z"/>
          </svg>
          <div class="tooltip-top">Bold</div>
        </button>
        <!-- Italic -->
        <button
          @click="editor.chain().focus().toggleItalic().run()"
          :disabled="!editor.can().chain().focus().toggleItalic().run()"
          class="tiptap-control group relative"
          :class="{ 'tiptap-control-active': editor.isActive('italic') }"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 4H10M14 20H5M15 4L9 20"/>
          </svg>
          <div class="tooltip-top">Italic</div>
        </button>
        <!-- Image -->
        <button
        @click="setHeadline()"
          class="tiptap-control group relative"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 4V20M18 4V20M8 4H4M18 12L6 12M8 20H4M20 20H16M20 4H16"/>
          </svg>
          <div class="tooltip-top">Headline</div>
        </button>
        <!-- Image -->
        <button
          @click="insertImageModal.openModal()"
          class="tiptap-control group relative"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
            <path d="M16.2 21H6.93137C6.32555 21 6.02265 21 5.88238 20.8802C5.76068 20.7763 5.69609 20.6203 5.70865 20.4608C5.72312 20.2769 5.93731 20.0627 6.36569 19.6343L14.8686 11.1314C15.2646 10.7354 15.4627 10.5373 15.691 10.4632C15.8918 10.3979 16.1082 10.3979 16.309 10.4632C16.5373 10.5373 16.7354 10.7354 17.1314 11.1314L21 15V16.2M16.2 21C17.8802 21 18.7202 21 19.362 20.673C19.9265 20.3854 20.3854 19.9265 20.673 19.362C21 18.7202 21 17.8802 21 16.2M16.2 21H7.8C6.11984 21 5.27976 21 4.63803 20.673C4.07354 20.3854 3.6146 19.9265 3.32698 19.362C3 18.7202 3 17.8802 3 16.2V7.8C3 6.11984 3 5.27976 3.32698 4.63803C3.6146 4.07354 4.07354 3.6146 4.63803 3.32698C5.27976 3 6.11984 3 7.8 3H16.2C17.8802 3 18.7202 3 19.362 3.32698C19.9265 3.6146 20.3854 4.07354 20.673 4.63803C21 5.27976 21 6.11984 21 7.8V16.2M10.5 8.5C10.5 9.60457 9.60457 10.5 8.5 10.5C7.39543 10.5 6.5 9.60457 6.5 8.5C6.5 7.39543 7.39543 6.5 8.5 6.5C9.60457 6.5 10.5 7.39543 10.5 8.5Z"/>
          </svg>
          <div class="tooltip-top">Image</div>
        </button>
        <!-- Link -->
        <button
          @click="linkUrl = editor.isActive('link') ? editor.getAttributes('link').href : ''; linkUrlPrev = linkUrl; linkModal.openModal();"
          class="tiptap-control group relative"
          :class="{ 'tiptap-control-active': editor.isActive('link') }"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
            <path d="M12.7076 18.3639L11.2933 19.7781C9.34072 21.7308 6.1749 21.7308 4.22228 19.7781C2.26966 17.8255 2.26966 14.6597 4.22228 12.7071L5.63649 11.2929M18.3644 12.7071L19.7786 11.2929C21.7312 9.34024 21.7312 6.17441 19.7786 4.22179C17.826 2.26917 14.6602 2.26917 12.7076 4.22179L11.2933 5.636M8.50045 15.4999L15.5005 8.49994"/>
          </svg>
          <div class="tooltip-top">Link</div>
        </button>
        <!-- Unordered list -->
        <button
          @click="editor.chain().focus().toggleBulletList().run()"
          class="tiptap-control group relative"
          :class="{ 'tiptap-control-active': editor.isActive('bulletList') }"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 12L9 12M21 6L9 6M21 18L9 18M5 12C5 12.5523 4.55228 13 4 13C3.44772 13 3 12.5523 3 12C3 11.4477 3.44772 11 4 11C4.55228 11 5 11.4477 5 12ZM5 6C5 6.55228 4.55228 7 4 7C3.44772 7 3 6.55228 3 6C3 5.44772 3.44772 5 4 5C4.55228 5 5 5.44772 5 6ZM5 18C5 18.5523 4.55228 19 4 19C3.44772 19 3 18.5523 3 18C3 17.4477 3.44772 17 4 17C4.55228 17 5 17.4477 5 18Z"/>
          </svg>
          <div class="tooltip-top">Bullet list</div>
        </button>
        <!-- Align left -->
        <button
          @click="editor.chain().focus().setTextAlign('left').run()"
          class="tiptap-control group relative"
          :class="{ 'tiptap-control-active': editor.isActive({ textAlign: 'left' }) }"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 10H3M20 6H3M20 14H3M16 18H3"/>
          </svg>
          <div class="tooltip-top">Align left</div>
        </button>
        <!-- Center -->
        <button
          @click="editor.chain().focus().setTextAlign('center').run()"
          class="tiptap-control group relative"
          :class="{ 'tiptap-control-active': editor.isActive({ textAlign: 'center' }) }"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 10H6M21 6H3M21 14H3M18 18H6"/>
          </svg>
          <div class="tooltip-top">Center</div>
        </button>
        <!-- Remove format -->
        <button
          @click="editor.chain().focus().unsetAllMarks().clearNodes().run()"
          class="tiptap-control group relative"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 7V6C4 5.45879 4.21497 4.96778 4.56419 4.60772M9 20H15M12 12V20M3 3L21 21M9.5 4H17C17.9319 4 18.3978 4 18.7654 4.15224C19.2554 4.35523 19.6448 4.74458 19.8478 5.23463C20 5.60218 20 6.06812 20 7M12 4V6.5"/>
          </svg>
          <div class="tooltip-top">Remove format</div>
        </button>
        <Dropdown :dropdownClass="'!max-w-none w-36'">
          <template #trigger>
            <button class="tiptap-control">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z"/>
                <path d="M12 6C12.5523 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4C11.4477 4 11 4.44772 11 5C11 5.55228 11.4477 6 12 6Z"/>
                <path d="M12 20C12.5523 20 13 19.5523 13 19C13 18.4477 12.5523 18 12 18C11.4477 18 11 18.4477 11 19C11 19.5523 11.4477 20 12 20Z"/>
              </svg>
            </button>
          </template>
          <template #content>
            <ul>
              <li>
                <button class="link w-full"
                  @click="editor.chain().focus().toggleStrike().run()"
                  :disabled="!editor.can().chain().focus().toggleStrike().run()"
                  :class="{ 'bg-neutral-100': editor.isActive('strike') }"
                >
                  Strikethrough
                </button>
              </li>
              <li>
                <button
                  @click="editor.chain().focus().setTextAlign('justify').run()"
                  class="link w-full"
                  :class="{ 'bg-neutral-100': editor.isActive({ textAlign: 'justify' }) }"
                >
                  Justify
                </button>
              </li>
              <li>
                <button
                  @click="editor.chain().focus().setTextAlign('right').run()"
                  class="link w-full"
                  :class="{ 'bg-neutral-100': editor.isActive({ textAlign: 'right' }) }"
                >
                  Aligh right
                </button>
              </li>
              <li>
                <button class="link w-full"
                  @click="editor.chain().focus().toggleOrderedList().run()"
                  :disabled="!editor.can().chain().focus().toggleOrderedList().run()"
                  :class="{ 'bg-neutral-100': editor.isActive('orderedList') }"
                >
                  Numbered list
                </button>
              </li>
              <li>
                <button class="link w-full"
                  @click="editor.chain().focus().toggleBlockquote().run()"
                  :disabled="!editor.can().chain().focus().toggleBlockquote().run()"
                  :class="{ 'bg-neutral-100': editor.isActive('blockquote') }"
                >
                  Blockquote
                </button>
              </li>
              <li>
                <button class="link w-full"
                  @click="editor.chain().focus().toggleCode().run()"
                  :disabled="!editor.can().chain().focus().toggleCode().run()"
                  :class="{ 'bg-neutral-100': editor.isActive('code') }"
                >
                  Code
                </button>
              </li>
              <li>
                <button class="link w-full"
                  @click="editor.chain().focus().toggleCodeBlock().run()"
                  :disabled="!editor.can().chain().focus().toggleCodeBlock().run()"
                  :class="{ 'bg-neutral-100': editor.isActive('codeBlock') }"
                >
                  Code block
                </button>
              </li>
            </ul>
          </template>
        </Dropdown>
      </div>
    </div>
    <!-- TipTap Editor -->
    <EditorContent :editor="editor"/>
  </div>
  <!-- Inser image modal -->
  <Modal ref="insertImageModal" :customClass="'modal-file-browser'">
    <template #header>Insert an image</template>
    <template #content>
      <div class="relative">
        <FileBrowser
          :owner="owner"
          :repo="repo"
          :branch="branch"
          :root="root"
          :filterByCategories="['image']"
          :isSelectable="true"
          @update:selected="imageSelection = $event"
        />
      </div>
      <footer class="flex justify-end text-sm gap-x-2 mt-3">
        <button class="btn" @click="insertImageModal.closeModal()">Cancel</button>
        <button class="btn-primary" @click="insertImage()">
          Insert
        </button>
      </footer>
    </template>
  </Modal>
  <!-- Link modal -->
  <Modal ref="linkModal">
    <template #header>{{ linkUrlPrev === '' ? 'Add a link' : 'Update a link' }}</template>
    <template #content>
      <input class="w-full" type="url" placeholder="https://example.com" v-model="linkUrl"/>
      <footer class="flex justify-end text-sm gap-x-2 mt-3">
        <button class="btn-icon-danger mr-auto group relative" @click="editor.chain().focus().unsetLink().run();linkModal.closeModal();" :disabled="!editor.isActive('link')">
          <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
            <path d="M8.5 15.5L15.5 8.49998M9 4V2M15 20V22M4 9H2M20 15H22M4.91421 4.91421L3.5 3.5M19.0858 19.0857L20.5 20.4999M12 17.6568L9.87871 19.7781C8.31662 21.3402 5.78396 21.3402 4.22186 19.7781C2.65976 18.216 2.65976 15.6833 4.22186 14.1212L6.34318 11.9999M17.6569 11.9999L19.7782 9.87859C21.3403 8.31649 21.3403 5.78383 19.7782 4.22174C18.2161 2.65964 15.6835 2.65964 14.1214 4.22174L12 6.34306"/>
          </svg>
          <div class="tooltip-top">Remove link</div>
        </button>
        <button class="btn" @click="linkModal.closeModal()">Cancel</button>
        <button class="btn-primary" @click="setLink();">
          {{ linkUrlPrev === '' ? 'Add' : 'Update' }}
        </button>
      </footer>
    </template>
  </Modal>
</template>

<script setup>
import { ref, onBeforeUnmount, onMounted } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import { marked } from 'marked';
import TurndownService from 'turndown';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'

import githubImg from '@/services/githubImg';
import Dropdown from '@/components/utils/Dropdown.vue';
import FileBrowser from '@/components/FileBrowser.vue';
import Modal from '@/components/utils/Modal.vue';

const emit = defineEmits(['update:modelValue']);

const props = defineProps({
  owner: String,
  repo: String,
  branch: String,
  root: String,
  modelValue: String,
  imagePrefix: String,
  source: { type: String, default: 'markdown' },
  private: { type: Boolean, default: false },
});
const insertImageModal = ref(null);
const linkModal = ref(null);
const linkUrl = ref('');
const linkUrlPrev = ref('');
const imageSelection = ref([]);
const isEditorFocused = ref(false);
const status = ref('loading');

const turndown = new TurndownService();

const setHeadline = () => {
  if (editor.value.isActive('heading', { level: 1 })) {
    editor.value.chain().focus().toggleHeading({ level: 2 }).run();
  } else if (editor.value.isActive('heading', { level: 2 })) {
    editor.value.chain().focus().toggleHeading({ level: 3 }).run();
  } else if (editor.value.isActive('heading', { level: 3 })) {
    editor.value.chain().focus().toggleHeading({ level: 3 }).run();
  } else {
    editor.value.chain().focus().toggleHeading({ level: 1 }).run();
  }
};

const insertImage = async () => {
  if (imageSelection.value.length) {
    const rawUrl = await githubImg.getRawUrl(props.owner, props.repo, props.branch, imageSelection.value[0], props.private);
    editor.value.chain().focus().setImage({ src: rawUrl }).run();
  }
  insertImageModal.value.closeModal();
};

const importContent = async (content) => {
  let htmlContent = (props.source == 'markdown') ? marked(content) : content;
  if (props.imagePrefix) {
    htmlContent = githubImg.removePrefix(htmlContent, props.imagePrefix);
  }
  htmlContent = await githubImg.relativeToRawUrls(props.owner, props.repo, props.branch, htmlContent, props.private);
  return htmlContent;
};

const exportContent = (content) => {
  let htmlContent = githubImg.rawToRelativeUrls(props.owner, props.repo, props.branch, content);
  if (props.imagePrefix) {
    htmlContent = githubImg.addPrefix(htmlContent, props.imagePrefix);
  }
  return (props.source == 'markdown') ? turndown.turndown(htmlContent) : htmlContent;
};

const setContent = async () => {
  status.value = 'loading';
  const htmlContent = await importContent(props.modelValue);
  if (editor.value) {
    editor.value.commands.setContent(htmlContent);
  }
  status.value = '';
};

const editor = useEditor({
  extensions: [
    StarterKit,
    Image.configure({ inline: true }),
    Link.configure({
      openOnClick: false,
    }),
    TextAlign.configure({ types: ['heading', 'paragraph'], }),
  ],
  onUpdate: ({ editor }) => {
    emit('update:modelValue', exportContent(editor.getHTML()));
  },
});

const setLink = () => {
  if (linkUrl.value === '') {
    editor.value.chain().focus().extendMarkRange('link').unsetLink().run();
    linkModal.value.closeModal();
  } else {
    editor.value.chain().focus().extendMarkRange('link').setLink({ href: linkUrl.value }).run()
    linkModal.value.closeModal();
  }
};

onMounted(async () => {
  await setContent();
});

onBeforeUnmount(() => {
  editor.value.destroy();
});
</script>