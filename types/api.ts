export type ApiSuccess<T> = {
  status: "success";
  message: string;
  data: T;
};

export type ApiError = {
  status: "error";
  message: string;
};

export type ApiResponse<T> =
  | ApiSuccess<T>
  | ApiError;

export type EntryHistoryItem = {
  sha: string;
  html_url: string;
  author?: {
    login?: string;
  } | null;
  commit: {
    author?: {
      name?: string | null;
      date?: string | null;
    } | null;
  };
};

export type EntryData = {
  sha: string;
  path: string;
  name?: string;
  contentObject?: Record<string, unknown>;
};

export type FileSaveData = {
  type?: string;
  sha?: string;
  name?: string;
  path?: string;
  extension?: string;
  size?: number;
  url?: string;
  config?: unknown;
};

export type MediaItem = {
  type: "dir" | "file";
  sha?: string;
  name: string;
  path: string;
  extension?: string;
  size?: number;
  url?: string | null;
};
