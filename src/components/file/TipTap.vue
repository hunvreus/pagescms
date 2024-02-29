<template>
  <div v-if="status == 'loading'" class="bg-neutral-150 dark:bg-neutral-800 border-neutral-150 dark:border-neutral-800 py-2 px-3 h-24 rounded-xl flex items-center justify-center">
    <div class="spinner-black"></div>
  </div>
  <div v-else class="rich-text-editor">
    <!-- Editor buttons -->
    <div v-if="editor" class="tiptap-controls" :class="{ 'tiptap-controls-focused': isEditorFocused }">
      <div class="tiptap-controls-wrapper">
        <template v-if="!isCodeEditor">
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
            v-if="repoStore.config.object.media !== undefined || (props.options?.input !== undefined && props.options?.output !== undefined)"
            @click="handleImageModal"
            class="tiptap-control group relative"
            :class="{ 'tiptap-control-active': editor.isActive('image') }"
          >
            <Icon name="Image" class="h-4 w-4 stroke-2 shrink-0"/>
            <div class="tooltip-top">Image</div>
          </button>
          <button
            @click="linkUrl = editor.isActive('link') ? editor.getAttributes('link').href : ''; newLinkUrl = linkUrl; linkModal.openModal();"
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
        </template>
        <button
          @click="toggleEditor()"
          class="tiptap-control group relative"
          :class="{ 'tiptap-control-active': isCodeEditor }"
        >
          <Icon name="Code" class="h-4 w-4 stroke-2 shrink-0"/>
          <div class="tooltip-top">{{ isCodeEditor ? 'Switch to rich-text' : 'Switch to code' }}</div>
        </button>  
        <Dropdown v-if="!isCodeEditor" :dropdownClass="'!max-w-none w-36'">
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
    <template v-if="!isCodeEditor">
      <EditorContent :editor="editor"/>
    </template>
    <template v-else>
      <CodeMirror
        :modelValue="modelValue"
        :format="format"
        @update:modelValue="$emit('update:modelValue', $event)"
      />
    </template>
  </div>
  <!-- Inser image modal -->
  <Modal ref="imageModal" :customClass="'modal-file-browser'">
    <template #header>Insert an image</template>
    <template #content>
      <div class="relative">
        <FileBrowser
          :owner="repoStore.owner"
          :repo="repoStore.repo"
          :branch="repoStore.branch"
          :root="props.options?.image?.input ?? repoStore.config.object.media?.input"
          :defaultPath="props.options?.image?.path ?? repoStore.config.object.media?.path"
          :filterByCategories="props.options?.image?.extensions ? undefined : [ 'image' ]"
          :filterByExtensions="props.options?.image?.extensions"
          :selected="selected"
          :isSelectable="true"
          @files-selected="imageSelection = $event"
          ref="fileBrowserComponent"
        />
      </div>
      <footer class="flex justify-end text-sm gap-x-2 mt-4">
        <button class="btn-secondary" @click="imageModal.closeModal()">Cancel</button>
        <button class="btn-primary" @click="insertImage(); fileBrowserComponent.selectFile();">
          Insert
        </button>
      </footer>
    </template>
  </Modal>
  <!-- Link modal -->
  <Modal ref="linkModal">
    <template #header>{{ linkUrl === '' ? 'Add a link' : 'Update a link' }}</template>
    <template #content>
      <input class="w-full" type="url" placeholder="https://example.com" v-model="newLinkUrl"/>
      <footer class="flex justify-end text-sm gap-x-2 mt-4">
        <button class="btn-icon-danger mr-auto group relative" @click="editor.chain().focus().unsetLink().run();linkModal.closeModal();" :disabled="!editor.isActive('link')">
          <Icon name="Link2Off" class="h-4 w-4 stroke-2 shrink-0"/>
          <div class="tooltip-top">Remove link</div>
        </button>
        <button class="btn-secondary" @click="linkModal.closeModal()">Cancel</button>
        <button class="btn-primary" @click="setLink();">
          {{ linkUrl === '' ? 'Add' : 'Update' }}
        </button>
      </footer>
    </template>
  </Modal>
</template>

<script setup>
// TODO: add syntax highlighting, fix tables and prevent <p> in <li>
import { inject, ref, onBeforeUnmount, onMounted, defineAsyncComponent } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import { marked } from 'marked';
import TurndownService from 'turndown';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import Table from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import notifications from '@/services/notifications';
import github from '@/services/github';
import githubImg from '@/services/githubImg';
import Dropdown from '@/components/utils/Dropdown.vue';
import FileBrowser from '@/components/FileBrowser.vue';
import Icon from '@/components/utils/Icon.vue';
import Modal from '@/components/utils/Modal.vue';

const CodeMirror = defineAsyncComponent(() => import('@/components/file/CodeMirror.vue'));

const emit = defineEmits(['update:modelValue']);

const repoStore = inject('repoStore', { owner: null, repo: null, branch: null, config: null, details: null });

const props = defineProps({
  owner: String,
  repo: String,
  branch: String,
  options: Object,
  modelValue: String,
  format: { type: String, default: 'markdown' },
  private: { type: Boolean, default: false },
});

const linkModal = ref(null);
const linkUrl = ref('');
const newLinkUrl = ref('');
const imageModal = ref(null);
const imageSelection = ref([]);
const selected = ref(null);
const isEditorFocused = ref(false);
const status = ref('loading');
const isCodeEditor = ref(false);
const prefixInput = ref(props.options?.input ?? repoStore.config.object.media?.input ?? null);
const prefixOutput = ref(props.options?.output ?? repoStore.config.object.media?.output ?? null);
const uploadPath = ref(props.options?.path ?? repoStore.config.object.media?.path ?? props.options?.input ?? repoStore.config.object.media?.input ?? '');
const fileBrowserComponent = ref(null);

const turndownService = new TurndownService({ headingStyle: 'atx' });
turndownService.addRule('styled-or-classed', {
  filter: (node, options)  => (node.getAttribute('style') || node.getAttribute('class')),
  replacement: (content, node, options) => node.outerHTML
});

const setHeadline = () => {
  if (editor.value.isActive('heading', { level: 1 })) {
    editor.value.chain().focus().toggleHeading({ level: 2 }).run();
  } else if (editor.value.isActive('heading', { level: 2 })) {
    editor.value.chain().focus().toggleHeading({ level: 3 }).run();
  } else if (editor.value.isActive('heading', { level: 3 })) {
    editor.value.chain().focus().toggleHeading({ level: 4 }).run();
  } else {
    editor.value.chain().focus().toggleHeading({ level: 1 }).run();
  }
};

const handleImageModal = () => {
  imageSelection.value = [];
  selected.value = editor.value.isActive('image') ? githubImg.getRelativeUrl(repoStore.owner, repoStore.repo, repoStore.branch, editor.value.getAttributes('image').src) : null;
  if (fileBrowserComponent.value) {
    // If the file browser is already mounted, we refresh its content
    fileBrowserComponent.value.setContents();
  }
  imageModal.value.openModal();
};

const insertImage = async () => {
  if (imageSelection.value.length) {
    imageSelection.value.forEach(async (selectedImage) => {
      const rawUrl = await githubImg.getRawUrl(repoStore.owner, repoStore.repo, repoStore.branch, selectedImage, repoStore.details.private);
      editor.value.chain().focus().setImage({ src: rawUrl }).run();
    });
  }
  imageModal.value.closeModal();
};

const importContent = async (content) => {
  let htmlContent = (props.format == 'markdown') ? marked(content) : content;
  htmlContent = githubImg.htmlSwapPrefix(htmlContent, prefixOutput.value, prefixInput.value, true);
  // TODO: find a way to display spinner while the files are being loaded.
  htmlContent = await githubImg.relativeToRawUrls(repoStore.owner, repoStore.repo, repoStore.branch, htmlContent, repoStore.details.private);

  return htmlContent;
};

const exportContent = (content) => {
  let htmlContent = githubImg.rawToRelativeUrls(repoStore.owner, repoStore.repo, repoStore.branch, content);
  htmlContent = githubImg.htmlSwapPrefix(htmlContent, prefixInput.value, prefixOutput.value);
  
  return (props.format == 'markdown') ? turndownService.turndown(htmlContent) : htmlContent;
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
    StarterKit.configure({
      dropcursor: { width: 2}
    }),
    Image.configure({ inline: true }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        rel: null,
        target: null,
      }
    }),
    TextAlign.configure({ types: ['heading', 'paragraph'], }),
    Table.configure({
      resizable: true,
    }),
    TableRow,
    TableHeader,
    TableCell,
  ],
  editorProps: {
    handleDrop: async function(view, event, slice, moved) {
      if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
        const files = Array.from(event.dataTransfer.files);
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml', 'image/bmp', 'image/tif', 'image/tiff'];
        const { schema } = view.state;
        const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
        let position = coordinates.pos;
        for (const file of files) {
          if (allowedTypes.includes(file.type)) {
            const imagePath = await upload(file);
            if (imagePath) {
              const imageRawUrl = await githubImg.getRawUrl(repoStore.owner, repoStore.repo, repoStore.branch, imagePath, repoStore.details.private);
              if (imageRawUrl) {
                const node = schema.nodes.image.create({ src: imageRawUrl });
                const transaction = view.state.tr.insert(position, node);
                view.dispatch(transaction);
                position += node.nodeSize;
              }
            }
          } else {
            notifications.notify('Only images can be uploaded (JPEG, PNG, GIF, SVG, TIFF and BMP).', 'error');
          }
        }
        return true;
      }
      return false;
    }
  },
  onUpdate: ({ editor }) => {
    emit('update:modelValue', exportContent(editor.getHTML()));
  },
});

// TODO: move to Upload component
const upload = async (file) => {
  if (file) {
    let content = await readFileContent(file);
    if (content) {
      const notificationId = notifications.notify(`Uploading "${file.name}".`, 'processing', { delay: 0 });
      content = content.replace(/^(.+,)/, ''); // We strip out the info at the beginning of the file (mime type + encoding)
      const fullPath = uploadPath.value ? `${uploadPath.value}/${file.name}` : file.name;
      const data = await github.saveFile(repoStore.owner, repoStore.repo, repoStore.branch, fullPath, content, null, true);
      notifications.close(notificationId);
      if (data) {
        notifications.notify(`File '${file.name}' successfully uploaded.`, 'success');
        return data.content.path;
      } else {
        notifications.notify(`File upload failed.`, 'error');
        return;
      }
    }
  }
};

const readFileContent = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file); // Reads the file as base64 encoded string
  });
};

const setLink = () => {
  if (newLinkUrl.value === '') {
    editor.value.chain().focus().extendMarkRange('link').unsetLink().run();
    linkModal.value.closeModal();
  } else {
    editor.value.chain().focus().extendMarkRange('link').setLink({ href: newLinkUrl.value }).run()
    linkModal.value.closeModal();
  }
};

onMounted(async () => {
  await setContent();
});

onBeforeUnmount(() => {
  if (editor.value) {
    editor.value.destroy();
  }
});

const toggleEditor = () => {
  isCodeEditor.value = !isCodeEditor.value;
  if (!isCodeEditor.value) {
    setContent();
  }
};
</script>