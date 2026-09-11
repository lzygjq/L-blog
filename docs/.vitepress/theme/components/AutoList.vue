<script setup>
// 自动文章列表：数据由各页面同目录的 index.data.js（createContentLoader）构建时注入
// 渲染为与手写表一致的「文章 | 说明」表格，说明取 frontmatter.desc，缺失回退 date
defineProps({
  items: { type: Array, required: true },
})
</script>

<template>
  <table>
    <thead>
      <tr><th>文章</th><th>说明</th></tr>
    </thead>
    <tbody>
      <tr v-for="it in items" :key="it.url">
        <td><a :href="it.url">{{ it.frontmatter.title }}</a></td>
        <td>{{ it.frontmatter.desc || it.frontmatter.date }}</td>
      </tr>
    </tbody>
  </table>
</template>
