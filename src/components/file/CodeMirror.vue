<template>
  <div ref="editorContainer" :class="`cm-lang-${lang}`"></div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import { HighlightStyle, syntaxHighlighting, StreamLanguage } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { yaml } from "@codemirror/legacy-modes/mode/yaml"
import { linter } from "@codemirror/lint";

const props = defineProps({
  modelValue: { type: String, default: '' },
  language: { type: String, default: 'markdown' },
  validation: { type: Array, default: [] }
});

const emit = defineEmits(['update:modelValue']);

const editorContainer = ref(null);
const lang = ref(null);

let view = null;

const classHighlightStyle = HighlightStyle.define([
  { tag: t.atom, class: 'cmt-atom' },
  { tag: t.comment, class: 'cmt-comment' },
  { tag: t.keyword, class: 'cmt-keyword' },
  { tag: t.literal, class: 'cmt-literal' },
  { tag: t.operator, class: 'cmt-operator' },
  { tag: t.separator, class: 'cmt-separator' },
  { tag: t.number, class: 'cmt-number' },
  { tag: t.bool, class: 'cmt-bool' },
  { tag: t.string, class: 'cmt-string' },
  { tag: t.bracket, class: 'cmt-bracket' },
  { tag: [t.standard(t.tagName), t.tagName], class: 'cmt-tagName' },
  { tag: t.className, class: 'cmt-className' },
  { tag: t.propertyName, class: 'cmt-propertyName' },
  { tag: t.variableName, class: 'cmt-variableName' },
  { tag: t.attributeName, class: 'cmt-attributeName' },
  { tag: t.typeName, class: 'cmt-typeName' },
  { tag: t.typeOperator, class: 'cmt-typeOperator' },
  { tag: t.typeName, class: 'cmt-typeName' },
  { tag: t.meta, class: 'cmt-meta' },
  { tag: t.regexp, class: 'cmt-regexp' },
  { tag: t.name, class: 'cmt-name' },
  { tag: t.quote, class: 'cmt-quote' },
  { tag: t.heading, class: 'cmt-heading' },
  { tag: t.strong, class: 'cmt-strong' },
  { tag: t.emphasis, class: 'cmt-emphasis' },
  { tag: t.deleted, class: 'cmt-deleted' },
  { tag: t.link, class: 'cmt-link' },
  { tag: t.strikethrough, class: 'cmt-strikethrough' },
  { tag: t.invalid, class: 'cmt-invalid' },
]);

onMounted(() => {
  let extensions = [
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    syntaxHighlighting(classHighlightStyle),
    EditorView.lineWrapping,
    EditorView.updateListener.of(update => {
      if (update.docChanged) {
        emit('update:modelValue', update.state.doc.toString());
      }
    }),
  ];
  if (props.validation !== undefined) {
    extensions.push(linter((view) => props.validation.filter(item => item.message)));
  }
  switch (props.language) {
    case 'yaml':
    case 'yml':
      lang.value = 'yaml';
      extensions.push(StreamLanguage.define(yaml));
      break;
    case 'javascript':
    case 'js':
    case 'jsx':
    case 'typescript':
    case 'ts':
    case 'tsx':
      lang.value = 'javascript';
      extensions.push(javascript());
      break;
    case 'json':
      lang.value = 'json';
      extensions.push(json());
    case 'html':
    case 'htm':
      lang.value = 'html';
      extensions.push(html());
      break;
    default:
      lang.value = 'markdown';
      extensions.push(markdown({ base: markdownLanguage }));
      break;
  }

  const startState = EditorState.create({ doc: props.modelValue, extensions });

  view = new EditorView({ state: startState, parent: editorContainer.value });
});

watch(() => props.modelValue, (newValue) => {
  if (view && newValue !== view.state.doc.toString()) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: newValue }
    });
  }
});

onBeforeUnmount(() => {
  if (view) {
    view.destroy();
  }
});
</script>
