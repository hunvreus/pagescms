/**
 * Convert image paths into raw.githubusercontent.com URLs (with some light caching).
 */

import { reactive } from 'vue';
import github from '@/services/github';

// TTL for the cache (in milliseconds)
const ttl = 10000;

// We use the state object to coordinate data fetching (mainly to prevent fetching the same content multiple time) and cacching results.
const state = reactive({
  cache: {},
  requests: {}
});

// Get the relative URL of a file
const getRelativeUrl = (owner, repo, branch, path) => {
  let relativePath = path;
  if (path.startsWith('https://raw.githubusercontent.com/')) {
    relativePath = path.replace(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`, '');
    relativePath = relativePath.split('?')[0];
  }
  
  return relativePath;
}

// Get the raw URL of a file
const getRawUrl = async (owner, repo, branch, path, isPrivate = false) => {
  if (isPrivate) {
    const filename = path.split('/').pop();
    const parentPath = path.split('/').slice(0, -1).join('/');
    const parentFullPath = `${owner}/${repo}/${branch}/${parentPath}`;
    if (!state.cache[parentFullPath]?.files?.[filename] || (Date.now() - (state.cache[parentFullPath]?.time || 0) > ttl)) {
      // If the file isn't in cache or if the cache is stale, we refresh it
      delete state.cache[parentFullPath];
      if (!state.requests[parentFullPath]) {
        // We create a request for the parent folder if it's not already being processed
        state.requests[parentFullPath] = github.getContents(owner, repo, branch, parentPath, false);
      }
      const files = await state.requests[parentFullPath];
      if (!state.cache[parentFullPath] && files) {
        // If the cache isn't updated yet AND we have files back from our request, we update the cache
        state.cache[parentFullPath] = { time: Date.now(), files: {} };
        files.forEach(file => {
          state.cache[parentFullPath].files[file.name] = file.download_url;
        });
      }
      delete state.requests[parentFullPath];
    }
    
    return state.cache[parentFullPath]?.files?.[filename];
  } else {
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodeURI(path)}`;
  }
};

// Converts relative URLs to raw.githubusercontent.com URLs in an HTML string (for display)
const relativeToRawUrls = async (owner, repo, branch, html, isPrivate = false) => {
  let newHtml = html;
  const matches = getImgSrcs(newHtml);
  for (const match of matches) {
    const src = match[1] || match[2];
    const quote = match[1] ? '"' : "'";
    if (!src.startsWith('/') && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:image/')) {  
      const rawUrl = await getRawUrl(owner, repo, branch, decodeURI(src), isPrivate);
      if (rawUrl) {
        newHtml = newHtml.replace(`src=${quote}${src}${quote}`, `src=${quote}${rawUrl}${quote}`);
      }
    }
  }
  
  return newHtml;
}

// Converts raw.githubusercontent.com URLs to relative URLs in an HTML string (for storage)
const rawToRelativeUrls = (owner, repo, branch, html) => {
  const matches = getImgSrcs(html);
  for (const match of matches) {
    const src = match[1] || match[2];
    const quote = match[1] ? '"' : "'";
    if (src.startsWith('https://raw.githubusercontent.com/')) {
      let relativePath = src.replace(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`, '');
      relativePath = relativePath.split('?')[0];
      html = html.replace(`src=${quote}${src}${quote}`, `src=${quote}${relativePath}${quote}`);
    }
  }

  return html;
}

// Swaps path prefixes (used for input/output path conversion)
const swapPrefix = (path, from, to) => {
  if (from === to) return path;
  let newPath = path;
  if (path != null && from != null && to != null) {
    if (newPath.startsWith(from) && !(from == '/' && newPath.startsWith('//')) && !newPath.startsWith('http://') && !newPath.startsWith('https://') && !newPath.startsWith('data:image/')) {
      newPath = newPath.replace(from, to);
    }
  }

  return newPath;
}

// Swaps path prefixes (used for input/output path conversion) in an HTML string
const htmlSwapPrefix = (html, from, to) => {
  if (from === to) return html;
  let newHtml = html;
  if (html != null && from != null && to != null) {
    const matches = getImgSrcs(newHtml);
    matches.forEach(match => {
      const src = match[1] || match[2];
      const quote = match[1] ? '"' : "'";
      if (src.startsWith(from) && !(from == '/' && src.startsWith('//')) && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:image/')) {
        const newSrc = src.replace(from, to);
        newHtml = newHtml.replace(`src=${quote}${src}${quote}`, `src=${quote}${newSrc}${quote}`);
      }
    });
  }

  return newHtml;
}

// Get all img srcs from an HTML string
const getImgSrcs = (html) => {
  const regex = /<img [^>]*src=(?:"([^"]+)"|'([^']+)')[^>]*>/g;
  return [...html.matchAll(regex)];
}

export default { state, getRelativeUrl, getRawUrl, relativeToRawUrls, rawToRelativeUrls, swapPrefix, htmlSwapPrefix };