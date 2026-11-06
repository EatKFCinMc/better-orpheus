<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { getBridge } from "$lib/bridge";
  import type { ManageContract } from "@shared/contracts/manage-api";

  const api = getBridge<ManageContract>("manage");

  function loadPlugins() {
    return api.plugins
      .list()
      .then((plugins) => plugins.sort((a, b) => Number(b.protected) - Number(a.protected)));
  }

  let pluginsPromise = $state(loadPlugins());
  let clearingPlugins = $state(false);
  let pluginError = $state("");
  let selectedPlugins = $state<string[]>([]);
  async function clearPlugins() {
    if (!selectedPlugins.length) return;
    clearingPlugins = true;
    pluginError = "";
    try {
      await api.plugins.remove([...selectedPlugins]);
      selectedPlugins = [];
    } catch {
      pluginError = "删除插件失败，请重试。";
    } finally {
      pluginsPromise = loadPlugins();
      clearingPlugins = false;
    }
  }
</script>

<h1 class="text-2xl font-bold">插件菜单</h1>
<p class="mt-2 text-gray-700">查看已安装的插件，选择需要删除的插件进行管理。</p>
<div class="mt-4 rounded-lg border p-4">
  <h2 class="font-semibold">已安装的插件</h2>
  {#await pluginsPromise}
    <p class="mt-1 text-sm text-gray-600">正在加载…</p>
  {:then plugins}
    {@const removable = plugins.filter((plugin) => !plugin.protected)}
    <p class="mt-1 text-sm text-gray-600">{plugins.length} 个</p>
    {#if plugins.length}
      <label class="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          disabled={clearingPlugins || removable.length === 0}
          checked={removable.length > 0 && selectedPlugins.length === removable.length}
          indeterminate={selectedPlugins.length > 0 && selectedPlugins.length < removable.length}
          onchange={(event) =>
            (selectedPlugins = event.currentTarget.checked
              ? removable.map((plugin) => plugin.id)
              : [])}
        />
        全选
      </label>
      <div class="mt-2 divide-y">
        {#each plugins as plugin (plugin.id)}
          <label class="flex items-center gap-3 py-2 text-sm" class:opacity-50={plugin.protected}>
            <input
              type="checkbox"
              value={plugin.id}
              bind:group={selectedPlugins}
              disabled={clearingPlugins || plugin.protected}
            />
            <span class="min-w-0 flex-1 break-all"
              >{plugin.name}{plugin.protected ? "（不可删除）" : ""}</span
            >
            <span class="text-gray-600"
              >{plugin.version}{plugin.development ? "（开发插件）" : ""}</span
            >
          </label>
        {/each}
      </div>
    {:else}
      <p class="mt-2 text-sm text-gray-600">暂无已安装的插件。</p>
    {/if}
    <p class="mt-2 text-xs text-gray-600">删除后将重新加载主界面</p>
    <Button
      class="mt-3 enabled:border-red-600 enabled:bg-red-600 enabled:text-white enabled:hover:bg-red-700"
      variant="outline"
      size="sm"
      disabled={clearingPlugins || selectedPlugins.length === 0}
      onclick={clearPlugins}>删除</Button
    >
  {:catch}
    <p class="mt-1 text-sm text-red-500">获取插件列表失败。</p>
  {/await}
  {#if pluginError}<p class="mt-1 text-sm text-red-500">{pluginError}</p>{/if}
</div>
