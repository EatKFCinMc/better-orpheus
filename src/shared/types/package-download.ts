export enum PackageDownloadReason {
  NotFound,
  LoadFailed,
  UserRequested,
  UpdateAvailable,
}

export type ImportProgress = {
  step: "downloading" | "extracting" | "saving" | "completed" | "cancelled" | "failed";
  receivedBytes?: number;
  totalBytes?: number;
  fileIndex?: number;
  fileCount?: number;
  progress?: number;
  error?: string;
};
