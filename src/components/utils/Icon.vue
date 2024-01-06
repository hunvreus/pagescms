<script setup>
import { computed } from 'vue';
import * as icons from "lucide-vue-next";
// FileStack, FileText, Settings, Image, HelpCircle, ChevronsUpDown, ExternalLink, Check, Menu, ArrowLeft, MoreVertical, Grip, Trash2, ImagePlus, Pencil
// Bold, Italic, Heding, Image, Link2, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, RemoveFormatting, X, Bell, Search, Folder, CornerLeftUp, SlidersHorizontal
// 

const props = defineProps({
  name: {
    type: String,
    required: true
  },
  size: Number,
  color: String,
  strokeWidth: Number,
  defaultClass: String
})

const icon = computed(() => icons[props.name]);
</script>

<template>
  <component
    :is="icon"
    :size="size"
    :color="color"
    :stroke-width="strokeWidth" :default-class="defaultClass"
  />
</template>