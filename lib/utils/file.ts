/**
 * Define file types and provide Helper functions (get file info, get parent path, normalize paths...)
 */

const serializedTypes = ["yaml-frontmatter", "json-frontmatter", "toml-frontmatter", "yaml", "json", "toml"];

const extensionCategories: Record<string, string[]> = {
  image: ["jpg", "jpeg", "apng", "png", "gif", "svg", "ico", "avif", "bmp", "tif", "tiff", "webp"],
  document: ["pdf", "doc", "docx", "ppt", "pptx", "vxls", "xlsx", "txt", "rtf"],
  video: ["mp4", "avi", "mov", "wmv", "flv", "mpeg", "webm", "ogv", "ts", "3gp", "3g2"],
  audio: ["mp3", "wav", "aac", "ogg", "flac", "weba", "oga", "opus", "mid", "midi", "3gp", "3g2"],
  compressed: ["zip", "rar", "7z", "tar", "gz", "tgz", "bz", "bz2"],
  code: ["js", "jsx", "ts", "tsx", "html", "css", "scss", "json", "xml", "yaml", "yml", "md", "py", "rb", "php", "java", "c", "cpp", "h", "cs", "go", "rs", "sql"],
  font: ["ttf", "otf", "woff", "woff2", "eot"],
  spreadsheet: ["csv", "tsv", "ods"]
};

const getFileSize = (
  bytes: number,
  decimals: number = 2
): string => {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

const getFileExtension = (path: string): string => {
  const filename = getFileName(path);
  if (filename.startsWith(".") && !filename.includes(".", 1)) return "";
  const extensionMatch = /(?:\.([^.]+))?$/.exec(filename);
  return extensionMatch?.[1] ?? "";
}

function getFileName(path: string): string {
  return normalizePath(path).split("/").pop() || "";
}

function normalizePath(path: string): string {
  const pathSegments = path.replace("//", "/").replace(/\/+$/, "").split("/");

  const normalizedPathSegments = pathSegments.reduce((acc: string[], segment: string) => {
    if (segment === "..") {
      if (acc.length === 0 || acc[acc.length - 1] === "..") {
        acc.push(segment);
      } else {
        acc.pop();
      }
    } else if (segment !== "." && segment !== "") {
      acc.push(segment);
    }
    return acc;
  }, []);

  return normalizedPathSegments.join("/");
}

const getParentPath = (path: string): string => {
  return (path === "" || path === "/")
    ? ""
    : path.split("/").slice(0, -1).join("/") || "";
}

const getRelativePath = (path: string, rootPath: string): string => {
  if (!path.startsWith(rootPath)) {
    console.error(`Path "${path}" is not within root path "${rootPath}"`);
    return path;
  }
  return !rootPath ? path : path.slice(rootPath.length + 1);
}

const joinPathSegments = (segments: string[]): string => {
  return segments
    .map(segment => segment.replace(/^\/+|\/+$/g, ""))
    .filter(segment => segment.length > 0)
    .join("/");
};

const decodePathSafely = (path: string): string => {
  let current = path;
  for (let i = 0; i < 2; i += 1) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch {
      break;
    }
  }
  return current;
};

const normalizeMediaPath = (path: string): string => {
  if (!path) return path;
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("//") ||
    path.startsWith("data:")
  ) {
    return path;
  }

  const [pathWithoutHash, hash = ""] = path.split("#");
  const [pathname = "", query = ""] = (pathWithoutHash ?? "").split("?");
  const decodedPath = decodePathSafely(pathname);
  const hasLeadingSlash = decodedPath.startsWith("/");
  const normalizedPath = normalizePath(decodedPath);
  const withSlash = hasLeadingSlash ? `/${normalizedPath}` : normalizedPath;
  const withQuery = query ? `${withSlash}?${query}` : withSlash;
  return hash ? `${withQuery}#${hash}` : withQuery;
};

const generateRandomUploadName = (extension?: string): string => {
  const rand = Math.random().toString(36).slice(2, 10);
  const stamp = Date.now().toString(36);
  const ext = extension ? `.${extension.toLowerCase()}` : "";
  return `${stamp}-${rand}${ext}`;
};

const sortFiles = (data: Record<string, any>[]): Record<string, any>[] => {
  return data.sort((a, b) => {
    if (a.type === b.type) {
      return a.name.localeCompare(b.name);
    }
    return a.type === "dir" ? -1 : 1;
  });
};

export {
  getFileSize,
  getFileExtension,
  getFileName,
  getParentPath,
  getRelativePath,
  normalizePath,
  normalizeMediaPath,
  joinPathSegments,
  decodePathSafely,
  generateRandomUploadName,
  sortFiles,
  extensionCategories,
  serializedTypes
};
