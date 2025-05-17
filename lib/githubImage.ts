/**
 * Helper functions to translate relative paths into publicly accessible GitHub
 * raw.githubusercontent.com URLs (required for images in private repositories).
 * Runs client-side with some temporary caching.
 */

import { getFileName, getParentPath } from "@/lib/utils/file";

const ttl = 10000; // TTL for the cache (in milliseconds)
const cache: { [key: string]: any } = {};
const requests: { [key: string]: Promise<any> | undefined } = {};

// Get the relative path for an image.
const getRelativeUrl = (
  owner: string,
  repo: string,
  branch: string,
  path: string,
  encode = true
) => {
  let relativePath = path;

  if (path.startsWith("https://raw.githubusercontent.com/")) {
    const pattern = new RegExp(`^https://raw\\.githubusercontent\\.com/${owner}/${repo}/${encodeURIComponent(branch)}/`, "i");
    relativePath = path.replace(pattern, "");
    relativePath = relativePath.split("?")[0];
  }

  return encode ? encodePath(relativePath) : relativePath;
}

// Get the raw.githubusercontent.com URL for an image.
const getRawUrl = async (
  owner: string,
  repo: string,
  branch: string,
  name: string,
  path: string,
  isPrivate = false,
  decode = false
) => {
  const decodedPath = decode ? decodeURIComponent(path) : path;
  
  if (isPrivate) {
    const filename = getFileName(decodedPath);
    if (!filename) return null;
    const parentPath = getParentPath(decodedPath);
    
    const parentFullPath = `${owner}/${repo}/${encodeURIComponent(branch)}/${parentPath}`;
    
    if (requests[parentFullPath]) {
      await requests[parentFullPath];
      return cache[parentFullPath]?.files?.[filename];
    }

    if (cache[parentFullPath]?.files?.[filename]) return cache[parentFullPath].files[filename];
    if ((Date.now() - (cache[parentFullPath]?.time || 0) > ttl)) {
      delete cache[parentFullPath];
      
      if (!requests[parentFullPath]) {
        requests[parentFullPath] = fetch(`/api/${owner}/${repo}/${encodeURIComponent(branch)}/media/${encodeURIComponent(name)}/${encodeURIComponent(parentPath)}?nocache=true`)
          .then(response => {
            if (!response.ok) throw new Error(`Failed to fetch media: ${response.status} ${response.statusText}`);
            
            return response.json();
          });
      }

      const response = await requests[parentFullPath];
      
      if (!cache[parentFullPath] && response.status === "success") {
        cache[parentFullPath] = {
          time: Date.now(),
          files: {}
        };
        response.data.forEach((file: any) => {
          cache[parentFullPath].files[file.name] = file.url;
        });
      } else if (response.status === "error") {
        throw new Error(response.message);
      }

      delete requests[parentFullPath];
    }

    return cache[parentFullPath]?.files?.[filename];
  } else {
    return `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${encodeURI(decodedPath)}`;
  }
};

// Convert all raw.githubusercontent.com URLs in a HTML string to relative paths.
const rawToRelativeUrls = (
  owner: string,
  repo: string,
  branch: string,
  html: string,
  encode = true
) => {
  const matches = getImgSrcs(html);
  for (const match of matches) {
    const src = match[1] || match[2];
    const quote = match[1] ? "\"" : "'";

    if (src.startsWith("https://raw.githubusercontent.com/")) {
      let relativePath = src.replace(new RegExp(`https://raw\\.githubusercontent\\.com/${owner}/${repo}/${encodeURIComponent(branch)}/`, "gi"), "");
      relativePath = relativePath.split("?")[0];

      if (!encode) relativePath = decodeURIComponent(relativePath);
      
      html = html.replace(`src=${quote}${src}${quote}`, `src=${quote}${relativePath}${quote}`);
    }
  }

  return html;
}

// Convert all relative image paths in a HTML string to raw.githubusercontent.com URLs.
const relativeToRawUrls = async (
  owner: string,
  repo: string,
  branch: string,
  name: string,
  html: string,
  isPrivate = false,
  decode = false
) => {
  let newHtml = html;

  const matches = getImgSrcs(newHtml);
  for (const match of matches) {
    const src = match[1] || match[2];
    const quote = match[1] ? "\"" : "'";

    if (!src.startsWith("http://") && !src.startsWith("https://") && !src.startsWith("data:image/")) {  
      // TODO: what does the function returns if it fails?
      const rawUrl = await getRawUrl(owner, repo, branch, name, src, isPrivate, true);
      if (rawUrl) {
        newHtml = newHtml.replace(`src=${quote}${src}${quote}`, `src=${quote}${rawUrl}${quote}`);
      }
    }
  }
  
  return newHtml;
}

// Swap the prefix of an image path (raw.githubusercontent.com url <> relative path)
const swapPrefix = (
  path: string,
  from: string,
  to: string,
  relative = false
) => {
  if (
    path == null
    || from == null
    || to == null
    || (from === to)
    || path.startsWith("//")
    || path.startsWith("http://")
    || path.startsWith("https://")
    || path.startsWith("data:image/")
    || !path.startsWith(from)
  ) return path;
  
  let newPath;
  
  if (from === "" && to !== "/") {
    newPath = `${to}/${path}`;
  } else if (from === "" && to === "/") {
    newPath = `/${path}`;
  } else {
    const remainingPath = path.slice(from.length);
    newPath = to === "/" 
      ? `/${remainingPath.replace(/^\//, '')}` 
      : `${to}/${remainingPath.replace(/^\//, '')}`;
  }

  if (newPath && newPath.startsWith("/") && relative) newPath = newPath.substring(1);

  return newPath;
}

// Swap the prefix of all images in a HTML string.
const htmlSwapPrefix = (
  html: string,
  from: string,
  to: string,
  relative = false
) => {
  if (from === to || html == null || from == null || to == null) return html;
  
  let newHtml = html;
  const matches = getImgSrcs(newHtml);
  
  matches.forEach(match => {
    const src = match[1] || match[2];
    const quote = match[1] ? "\"" : "'";
    
    const newSrc = swapPrefix(src, from, to, relative);
    if (newSrc !== src) {
      // Use a regex with global flag to replace all occurrences
      const escapedSrc = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape special regex chars
      const regex = new RegExp(`src=${quote}${escapedSrc}${quote}`, 'g');
      newHtml = newHtml.replace(regex, `src=${quote}${newSrc}${quote}`);
    }
  });

  return newHtml;
}

// Encode a path for use in a URL.
const encodePath = (path: string) => {
  return path.split("/").map(encodeURIComponent).join("/");
}

// Get all image sources from an HTML string.
const getImgSrcs = (html: string) => {
  const regex = /<img [^>]*src=(?:"([^"]+)"|'([^']+)')[^>]*>/g;
  return Array.from(html.matchAll(regex));
}

export { getRelativeUrl, getRawUrl, relativeToRawUrls, rawToRelativeUrls, swapPrefix, htmlSwapPrefix, encodePath, getImgSrcs };