/**
 * Helper functions to translate relative paths into publicly accessible GitHub
 * raw.githubusercontent.com URLs (with some light caching). This is especially
 * useful for images in private repositories since we can only access them via
 * a temporary URL provided by the GitHub API.
 */

import { getFileName, getParentPath } from "@/lib/utils/file";

const ttl = 10000; // TTL for the cache (in milliseconds)
const cache: { [key: string]: any } = {};
const requests: { [key: string]: Promise<any> } = {};

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
    
    if (!cache[parentFullPath]?.files?.[filename] || (Date.now() - (cache[parentFullPath]?.time || 0) > ttl)) {
      delete cache[parentFullPath];
      
      if (!requests[parentFullPath]) {
        requests[parentFullPath] = fetch(`/api/${owner}/${repo}/${encodeURIComponent(branch)}/media/${encodeURIComponent(parentPath)}`)
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
  html: string,
  isPrivate = false,
  decode = false
) => {
  let newHtml = html;

  const matches = getImgSrcs(newHtml);
  for (const match of matches) {
    const src = match[1] || match[2];
    const quote = match[1] ? "\"" : "'";

    if (!src.startsWith("/") && !src.startsWith("http://") && !src.startsWith("https://") && !src.startsWith("data:image/")) {  
      // TODO: what does the function returns if it fails?
      const rawUrl = await getRawUrl(owner, repo, branch, src, isPrivate, true);
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
  if (path == null || from == null || to == null) return path;
  
  let newPath;
  
  if (from === to) {
    newPath = path;
  } else if (path.startsWith(from) && !(from == "/" && path.startsWith("//")) && !path.startsWith("http://") && !path.startsWith("https://") && !path.startsWith("data:image/")) {
    if (from === "" && to !== "/" && !path.startsWith("/")) {
      newPath = `${to}/${path}`;
    } else {
      newPath = path.replace(from, to);
    }
  } else {
    return path;
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
  if (from === to) return html;
  
  let newHtml = html;

  if (html != null && from != null && to != null) {
    const matches = getImgSrcs(newHtml);
    matches.forEach(match => {
      const src = match[1] || match[2];
      const quote = match[1] ? "\"" : "'";
      let newSrc;
      
      if (from === to) {
        newSrc = src;
      } else if (src.startsWith(from) && !(from == "/" && src.startsWith("//")) && !src.startsWith("http://") && !src.startsWith("https://") && !src.startsWith("data:image/")) {
        if (from === "" && to !== "/" && !src.startsWith("/")) {
          newSrc = `${to}/${src}`;
        } else {
          newSrc = src.replace(from, to);
        }
        if (newSrc && newSrc.startsWith("/") && relative) newSrc = newSrc.substring(1);
        newHtml = newHtml.replace(`src=${quote}${src}${quote}`, `src=${quote}${newSrc}${quote}`);
      }
    });
  }

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