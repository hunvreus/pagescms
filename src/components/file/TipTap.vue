<template>
  <div v-if="status == 'loading'" class="bg-neutral-150 dark:bg-neutral-800 border-neutral-150 dark:border-neutral-800 py-2 px-3 h-24 rounded-xl flex items-center justify-center">
    <div class="spinner-black"></div>
  </div>
  <div v-else class="editor">
    <!-- Editor buttons -->
    <div v-if="editor" class="tiptap-controls" :class="{ 'tiptap-controls-focused': isEditorFocused }">
      <div class="tiptap-controls-wrapper">
        <button
          @click="editor.chain().focus().toggleBold().run()"
          :disabled="!editor.can().chain().focus().toggleBold().run()"
          class="tiptap-control group relative"
          :class="{ 'tiptap-control-active': editor.isActive('bold') }"
        >
          <Icon name="Bold" class="h-4 w-4 stroke-2 shrink-0"/>
          <div class="tooltip-top">Bold</div>
        </button>
        <button
          @click="editor.chain().focus().toggleItalic().run()"
          :disabled="!editor.can().chain().focus().toggleItalic().run()"
          class="tiptap-control group relative"
          :class="{ 'tiptap-control-active': editor.isActive('italic') }"
        >
          <Icon name="Italic" class="h-4 w-4 stroke-2 shrink-0"/>
          <div class="tooltip-top">Italic</div>
        </button>
        <button
        @click="setHeadline()"
          class="tiptap-control group relative"
        >
          <Icon name="Heading" class="h-4 w-4 stroke-2 shrink-0"/>
          <div class="tooltip-top">Heading</div>
        </button>
        <button
          @click="insertImageModal.openModal()"
          class="tiptap-control group relative"
        >
          <Icon name="Image" class="h-4 w-4 stroke-2 shrink-0"/>
          <div class="tooltip-top">Image</div>
        </button>
        <button
          @click="linkUrl = editor.isActive('link') ? editor.getAttributes('link').href : ''; linkUrlPrev = linkUrl; linkModal.openModal();"
          class="tiptap-control group relative"
          :class="{ 'tiptap-control-active': editor.isActive('link') }"
        >
          <Icon name="Link2" class="h-4 w-4 stroke-2 shrink-0"/>
          <div class="tooltip-top">Link</div>
        </button>
        <button
          @click="editor.chain().focus().toggleBulletList().run()"
          class="tiptap-control group relative"
          :class="{ 'tiptap-control-active': editor.isActive('bulletList') }"
        >
          <Icon name="List" class="h-4 w-4 stroke-2 shrink-0"/>
          <div class="tooltip-top">Bullet list</div>
        </button>
        <button
          @click="editor.chain().focus().toggleOrderedList().run()"
          class="tiptap-control group relative"
          :class="{ 'tiptap-control-active': editor.isActive('orderedList') }"
        >
          <Icon name="ListOrdered" class="h-4 w-4 stroke-2 shrink-0"/>
          <div class="tooltip-top">Ordered list</div>
        </button>
        <button
          @click="editor.chain().focus().setTextAlign('left').run()"
          class="tiptap-control group relative"
          :class="{ 'tiptap-control-active': editor.isActive({ textAlign: 'left' }) }"
        >
          <Icon name="AlignLeft" class="h-4 w-4 stroke-2 shrink-0"/>
          <div class="tooltip-top">Align left</div>
        </button>
        <button
          @click="editor.chain().focus().setTextAlign('center').run()"
          class="tiptap-control group relative"
          :class="{ 'tiptap-control-active': editor.isActive({ textAlign: 'center' }) }"
        >
          <Icon name="AlignCenter" class="h-4 w-4 stroke-2 shrink-0"/>
          <div class="tooltip-top">Center</div>
        </button>
        <button
          @click="editor.chain().focus().setTextAlign('right').run()"
          class="tiptap-control group relative"
          :class="{ 'tiptap-control-active': editor.isActive({ textAlign: 'right' }) }"
        >
          <Icon name="AlignRight" class="h-4 w-4 stroke-2 shrink-0"/>
          <div class="tooltip-top">Align right</div>
        </button>
        <button
          @click="editor.chain().focus().unsetAllMarks().clearNodes().run()"
          class="tiptap-control group relative"
        >
          <Icon name="RemoveFormatting" class="h-4 w-4 stroke-2 shrink-0"/>
          <div class="tooltip-top">Remove format</div>
        </button>
        <Dropdown :dropdownClass="'!max-w-none w-36'">
          <template #trigger>
            <button class="tiptap-control">
              <Icon name="MoreVertical" class="h-4 w-4 stroke-2 shrink-0"/>
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
          @files-selected="imageSelection = $event"
        />
      </div>
      <footer class="flex justify-end text-sm gap-x-2 mt-4">
        <button class="btn-secondary" @click="insertImageModal.closeModal()">Cancel</button>
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
      <footer class="flex justify-end text-sm gap-x-2 mt-4">
        <button class="btn-icon-danger mr-auto group relative" @click="editor.chain().focus().unsetLink().run();linkModal.closeModal();" :disabled="!editor.isActive('link')">
          <Icon name="Link2Off" class="h-4 w-4 stroke-2 shrink-0"/>
          <div class="tooltip-top">Remove link</div>
        </button>
        <button class="btn-secondary" @click="linkModal.closeModal()">Cancel</button>
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
import Icon from '@/components/utils/Icon.vue';
import Modal from '@/components/utils/Modal.vue';

const emit = defineEmits(['update:modelValue']);

const props = defineProps({
  owner: String,
  repo: String,
  branch: String,
  root: String,
  modelValue: String,
  imagePrefix: String,
  format: { type: String, default: 'markdown' },
  private: { type: Boolean, default: false },
});

const insertImageModal = ref(null);
const linkModal = ref(null);
const linkUrl = ref('');
const linkUrlPrev = ref('');
const imageSelection = ref([]);
const isEditorFocused = ref(false);
const status = ref('loading');

const turndown = new TurndownService({ headingStyle: 'atx' });
turndown.addRule('keep-styled-elements', {
  filter: (node, options) => node.getAttribute('style'),
  replacement: (content, node, options) => `<${node.nodeName.toLowerCase()} style="${node.getAttribute('style')}">${content}</${node.nodeName.toLowerCase()}>`
})

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
  let htmlContent = (props.format == 'markdown') ? marked(content) : content;
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
  return (props.format == 'markdown') ? turndown.turndown(htmlContent) : htmlContent;
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