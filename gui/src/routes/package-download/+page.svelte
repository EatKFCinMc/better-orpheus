<script lang="ts" module>
  import { PackageDownloadReason, type ImportProgress } from "@shared/types/package-download";
  declare const downloadPackage: (callback: (progress: ImportProgress) => void) => void;
  declare const importPackage: (callback: (progress: ImportProgress) => void) => void;
  declare const downloadReason: PackageDownloadReason;
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  let busy = $state(false);
  let status = $state("");
  let error = $state("");
  let percent = $state<number | undefined>();
  function start(manual = false) {
    if (busy) return;
    busy = true;
    error = "";
    percent = undefined;
    status = manual ? "请选择安装包…" : "正在连接官方下载服务器…";
    (manual ? importPackage : downloadPackage)((progress) => {
      if (progress.step === "cancelled") {
        busy = false;
        status = "";
      } else if (progress.step === "failed") {
        busy = false;
        status = "";
        error = progress.error || "资源准备失败，请重试或选择本地安装包。";
      } else if (progress.step === "downloading") {
        percent = progress.progress;
        const received = ((progress.receivedBytes ?? 0) / 1024 / 1024).toFixed(1);
        const total = progress.totalBytes
          ? ` / ${(progress.totalBytes / 1024 / 1024).toFixed(1)} MB`
          : " MB";
        status = `正在下载安装包：${received}${total}`;
      } else if (progress.step === "extracting") {
        percent = undefined;
        status = "正在解包，请稍候…";
      } else if (progress.step === "saving")
        status = `正在保存资源 ${progress.fileIndex ?? 0} / ${progress.fileCount ?? 0}`;
      else if (progress.step === "completed") status = "资源准备完成，正在启动…";
    });
  }
  onMount(() => {
    if (downloadReason !== PackageDownloadReason.UserRequested) start();
  });
</script>

<div class="flex h-screen flex-col items-center justify-center gap-6 px-8 text-center">
  <h1 class="text-2xl font-bold">准备网易云音乐资源</h1>
  <p class="max-w-lg text-gray-600">
    首次启动将从网易云官方服务器下载 2.10.13 安装包，并在本机自动提取资源。
    程序不会运行安装包。你也可以选择已下载的官方 EXE 安装包。
  </p>
  <div class="flex gap-3">
    <Button onclick={() => start()} disabled={busy} size="lg"
      >{busy ? "处理中…" : "从官方下载"}</Button
    >
    <Button onclick={() => start(true)} disabled={busy} variant="outline" size="lg"
      >选择本地安装包</Button
    >
  </div>
  {#if percent !== undefined}<progress
      class="w-full max-w-lg"
      max="1"
      value={percent}
      aria-label="安装包下载进度"
    ></progress>{/if}
  <p role="status" aria-live="polite">{status}</p>
  {#if error}<p role="alert" class="max-w-lg text-red-600">{error}</p>{/if}
</div>
