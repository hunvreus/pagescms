/**
 * Interface with the GitHub API (including the storage of the OAuth token).
 */

import { ref } from 'vue';
import axios from 'axios';
import router from '@/router';
import notifications from '@/services/notifications';

const token = ref(localStorage.getItem('token') || null);

const setToken = (value) => {
  token.value = value;
  localStorage.setItem('token', value);
};

const clearToken = () => {
  token.value = null;
  localStorage.removeItem('token');
};

const handleAuthError = () => {
  notifications.notify('Your GitHub token is invalid or has expired. Please log in again.', 'error', { delay: 0 }); // TODO: find a way to remove the notifications dependency
  clearToken();
  router.push({ name: 'login' });
};

const handleError = (message, action, error) => {
  switch (error.response?.status) {
    case 401:
      notifications.notify('Your GitHub token is invalid or has expired. Please log in again.', 'error', { delay: 0 }); // TODO: find a way to remove the notifications dependency
      clearToken();
      router.push({ name: 'login' });
      break;
    case 403:
      notifications.notify('Your do not have permissiopermissions are insuffici do not have permission to to  not allowed to perform this action.', 'error');
      break;
  }
  console.error(errorMessage, error);
}

const getProfile = async () => {
  try {
    const response = await axios.get('https://api.github.com/user', {
      params: {
        timestamp: Date.now(),
      },
      headers: {
        Authorization: `Bearer ${token.value}`,
      },
    });
    return response.data;
  } catch (error) {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      handleAuthError();
    }
    console.error('Failed to fetch user:', error);
    return null;
  }
};

const searchRepos = async (query, writeAccessOnly = false) => {
  // TODO: only show valid repos (PAT)
  if (!query) return { items: [] };
  try {
    const response = await axios.get('https://api.github.com/search/repositories', {
      params: {
        q: `${query} in:name fork:true`,
        timestamp: Date.now(),
      },
      headers: {
        Authorization: `Bearer ${token.value}`,
      },
    });
    
    return response.data;
  } catch (error) {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      handleAuthError();
    }
    console.error('Failed to search for repositories:', error.message);
    return null;
  }
};

const getRepo = async (owner, name) => {
  try {
    const url = `https://api.github.com/repos/${owner}/${name}`;
    const response = await axios.get(url, {
      params: {
        timestamp: Date.now(),
      },
      headers: {
        Authorization: `Bearer ${token.value}`,
      },
    });
    return response.data;
  } catch (error) {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      handleAuthError();
    }
    console.error('Failed to retrieve the repository details:', error);
    return null;
  }
};

const getBranches = async (owner, name) => {
  try {
    const url = `https://api.github.com/repos/${owner}/${name}/branches`;
    const response = await axios.get(url, {
      params: {
        timestamp: Date.now(),
      },
      headers: {
        Authorization: `Bearer ${token.value}`
      },
    });
    return response.data.map(branch => branch.name);
  } catch (error) {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      handleAuthError();
    }
    console.error('Failed to retrieve the list of branches:', error);
    return null;
  }
};

const getContents = async (owner, repo, branch = 'HEAD', path = '', useGraphql = true) => {
  if (useGraphql) {
    // The GraphQL query list the files AND their content (unlike the REST query)
    try {
      const response = await axios.post(
        'https://api.github.com/graphql',
        {
          query: `
            query ($owner: String!, $repo: String!, $expression: String!) {
              repository(owner: $owner, name: $repo) {
                object(expression: $expression) {
                  ... on Tree {
                    entries {
                      name
                      path
                      type
                      object {
                        ... on Blob {
                          text
                          oid
                        }
                      }
                    }
                  }
                }
              }
            }
          `,
          variables: { owner, repo, expression: `${branch}:${path}` },
        },
        {
          params: {
            timestamp: Date.now(),
          },
          headers: {
            Authorization: `Bearer ${token.value}`,
          },
        }
      );
      
      return response.data.data.repository.object.entries;
    } catch (error) {
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        handleAuthError();
      }
      console.error('Failed to fetch repository files (GraphQL):', error);
      return null;
    }
  } else {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
      const response = await axios.get(url, {
        params: {
          ref: branch,
          timestamp: Date.now()
        },
        headers: {
          Authorization: `Bearer ${token.value}`
        },
      });

      return response.data;
    } catch (error) {
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        handleAuthError();
      }
      console.error('Failed to fetch repository files (REST):', error);
      return null;
    }
  }
};

const getFile = async (owner, repo, branch, path, raw = false) => {
  try {
    const accept = raw ? 'application/vnd.github.v3.raw' : 'application/vnd.github.v3+json';
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const response = await axios.get(url, {
      params: {
        ref: branch,
        timestamp: Date.now()
      },
      headers: {
        Accept: accept,
        Authorization: `Bearer ${token.value}`
      },
    });

    return response.data;
  } catch (error) {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      handleAuthError();
    }
    console.error('Failed to fetch the file:', error);
    return null;
  }
};

const getCommits = async (owner, repo, branch, path) => {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits`;
    const response = await axios.get(url, {
      params: {
        sha: branch,
        path: path,
        timestamp: Date.now()
      },
      headers: {
        Authorization: `Bearer ${token.value}`
      },
    });

    return response.data;
  } catch (error) {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      handleAuthError();
    }
    console.error('Failed to retrieve the commit history:', error);
    return null;
  }
};

// Update a file if SHA is provided, otherwise create a new one
const saveFile = async (owner, repo, branch, path, content, sha = null, retryCreate = false) => {
  let attemptsMax = retryCreate ? 5 : 1; // Max attempts only apply if retryCreate is true
  let attempt = 0;
  let currentPath = path;
  let siblingFiles = [];
  let uniqueFilenameCounter = 1;

  const generateUniqueFilename = (path, siblings, attempt) => {
    const pathSegments = path.split('/').filter(Boolean);
    const fileName = pathSegments.pop();
    const parentPath = pathSegments.length > 0 ? pathSegments.join('/') : '';
    const baseName = fileName.substring(0, fileName.lastIndexOf('.'));
    const extension = fileName.substring(fileName.lastIndexOf('.'));
    let newName;

    // Once we reach the max attempts, we switch to appending a timestamp to guarantee we
    // can save the file. This may happen with rapid successive saves, and is due to GitHub's
    // cache preventing us from getting siblings in real-time with getContents().
    if (attempt === attemptsMax - 1) {
      newName = `${baseName}-${Date.now()}${extension}`;
      return parentPath ? `${parentPath}/${newName}` : newName;
    }

    do {
      newName = `${baseName}-${uniqueFilenameCounter}${extension}`;
      uniqueFilenameCounter++;
    } while (siblings.includes(newName));

    return parentPath ? `${parentPath}/${newName}` : newName;
  };

  while (attempt < attemptsMax) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${currentPath}`;

    try {
      const params = {
        message: sha ? `Update ${currentPath} (via Pages CMS)` : `Create ${currentPath} (via Pages CMS)`,
        content: content,
        branch: branch,
      };
      if (sha) params.sha = sha;

      const response = await axios.put(url, params, {
        headers: { Authorization: `Bearer ${token.value}` },
      });

      // Notify if the file was saved under a new name to avoid conflict
      if (currentPath !== path) {
        console.warn(`File "${path}" was renamed to "${currentPath}" to avoid naming conflict.`);
      }
      return response.data;
    } catch (error) {
      if (retryCreate) {
        console.error(`Failed to save file "${path}" (attempt ${attempt + 1} of ${attemptsMax}):`, error);
      } else {
        console.error(`Failed to save file "${path}":`, error);
      }
      if (error.response && error.response.status === 422 && retryCreate) {
        attempt++;
        if (siblingFiles.length === 0) {
          // Fetch sibling files only if not already fetched
          const parentPath = path.substring(0, path.lastIndexOf('/') + 1);
          const contents = await getContents(owner, repo, branch, parentPath, false);
          siblingFiles = contents.map(file => file.name);
        }
        currentPath = generateUniqueFilename(path, siblingFiles, attempt);
      } else {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          handleAuthError();
        }
        return null;
      }
    }
  }

  return null;
};

const deleteFile = async (owner, repo, branch, path, sha) => {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  const params = {
    message: `Delete ${path} (via Pages CMS)`,
    sha: sha,
    branch: branch
  };

  try {
    const response = await axios.delete(url, {
      headers: {
        Authorization: `Bearer ${token.value}`
      },
      data: params
    });

    return response.data;
  } catch (error) {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      handleAuthError();
    }
    console.error('Failed to delete the file:', error);
    return null;
  }
};

// /!\ THE FOLLOWING IS A BIT OF A WTF... But hear me out.
// We can't easily rename a file via the GitHub API. We could copy the file with a new path and
// then delete the original, but we'd then lose the commit history. So we resort to a rather
// barbaric approach, chaining 5 sequential API calls. More about the why and how:
// https://stackoverflow.com/questions/31563444/rename-a-file-with-github-api
// https://medium.com/@obodley/renaming-a-file-using-the-git-api-fed1e6f04188
// https://www.levibotelho.com/development/commit-a-file-with-the-github-api/
const renameFile = async (owner, repo, branch, oldPath, newPath) => {
  // Step 1: Get the current branch commit SHA
  const getCurrentBranchSHA = async () => {
    const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/branches/${branch}`, {
      headers: {
        Authorization: `Bearer ${token.value}`,
      },
      params: {
        timestamp: Date.now()
      },
    });
    return response.data.commit.sha;
  };

  // Step 2: Get the current tree
  const getCurrentTree = async (sha) => {
    const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`, {
      headers: {
        Authorization: `Bearer ${token.value}`,
      },
      params: {
        timestamp: Date.now()
      },
    });
    return response.data.tree;
  };

  // Step 3: Create a new tree
  const createNewTree = async (tree) => {
    const response = await axios.post(`https://api.github.com/repos/${owner}/${repo}/git/trees`, 
      { tree },
      { 
        headers: {
          Authorization: `Bearer ${token.value}`,
        },
        params: {
          timestamp: Date.now()
        },
      }
    );
    return response.data.sha;
  };

  // Step 4: Create a commit for the new tree
  const createCommitForNewTree = async (treeSha, parentSha) => {
    const response = await axios.post(`https://api.github.com/repos/${owner}/${repo}/git/commits`, 
      {
        message: `Rename ${oldPath} to ${newPath}`,
        tree: treeSha,
        parents: [parentSha]
      },
      { 
        headers: {
          Authorization: `Bearer ${token.value}`,
        },
        params: {
          timestamp: Date.now()
        },
      }
    );
    return response.data.sha;
  };

  // Step 5: Point the branch at the new commit
  const updateBranch = async (commitSha) => {
    await axios.patch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`, 
      { sha: commitSha },
      { 
        headers: {
          Authorization: `Bearer ${token.value}`,
        },
        params: {
          timestamp: Date.now()
        },
      }
    );
  };

  try {
    const currentSha = await getCurrentBranchSHA();
    const tree = await getCurrentTree(currentSha);
    const newTree = tree
      .filter(item => item.type !== 'tree')
      .map(item => ({
        path: item.path === oldPath ? newPath : item.path,
        mode: item.mode,
        type: item.type,
        sha: item.sha
      }));
    const newTreeSha = await createNewTree(newTree);
    const commitSha = await createCommitForNewTree(newTreeSha, currentSha);
    await updateBranch(commitSha);

    return commitSha;
  } catch (error) {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      handleAuthError();
    }
    console.error('Failed to rename the file:', error);
    return null;
  }
};

const logout = async () => {
  try {
    if (!token.value.startsWith('github_pat_')) {
      await axios.get('/auth/revoke?token=' + token.value);
    }
    clearToken();
  } catch (error) {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      handleAuthError();
    }
    console.error('Failed to revoke token:', error);
    return null;
  }
};

export default { token, setToken, clearToken, getProfile, searchRepos, getRepo, getBranches, getContents, getFile, getCommits, saveFile, renameFile, deleteFile, logout };