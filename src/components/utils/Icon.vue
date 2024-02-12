<script setup>
import { computed } from 'vue';
import * as icons from "lucide-vue-next";
// FileStack, FileText, Settings, Image, HelpCircle, ChevronsUpDown, ExternalLink, Check, Menu, ArrowLeft, MoreVertical, Grip, Trash2, ImagePlus, Pencil
// Bold, Italic, Heding, Image, Link2, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, RemoveFormatting, X, Bell, Search, Folder, FolderPlus, CornerLeftUp, SlidersHorizontal, Ban

const props = defineProps({
  name: String,
  fallback: String,
  size: Number,
  color: String,
  strokeWidth: Number,
  defaultClass: String
})

const icon = computed(() => {
  if (props.name) {
    if (Object.keys(icons).includes(props.name)) {
      return icons[props.name];
    } else  {
      const pascalCaseName = props.name.replace(/(^|-)([a-z])/g, (match, _, letter) => letter.toUpperCase());
      if (Object.keys(icons).includes(pascalCaseName)) {
        return icons[pascalCaseName];
      } 
    }
  }
  if (props.fallback && Object.keys(icons).includes(props.fallback)) {
    return icons[props.fallback];
  }
  return null;
});
</script>

<template>
  <component
    :is="icon"
    :size="size"
    :color="color"
    :stroke-width="strokeWidth" :default-class="defaultClass"
  />
</template>