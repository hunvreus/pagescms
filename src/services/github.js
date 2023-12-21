import { ref } from 'vue';
import axios from 'axios';

const token = ref(localStorage.getItem('token') || null);

const setToken = (value) => {
  token.value = value;
  localStorage.setItem('token', value);
};

const clearToken = () => {
  token.value = null;
  localStorage.removeItem('token');
};

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
    console.error('Failed to fetch user:', error);
    return null;
  }
};

// Search repositories by name
const searchRepos = async (query, writeAccessOnly = false) => {
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
    console.error('Failed to search for repositories:', error.message);
    return null;
  }
};

// Fetch the repository details
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
    console.error('Failed to retrieve the repository details:', error);
    return null;
  }
};

// Fetch list of branches in a repo
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
    console.error('Failed to retrieve the list of branches:', error);
    return null;
  }
};

// Fetch list of files and their content in a repo folder
const getContents = async (owner, repo, branch = 'HEAD', path = '', graphql = true) => {
  if (graphql) {
    // The GraphQL query gives us the contents of the path along with the content of each file
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
      console.error('Failed to fetch repository files (GraphQL):', error);
      return null;
    }
  } else {
    // If not GraphQL, we use REST (which comes with)the size and download URL for eahc file)
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
      console.error('Failed to fetch repository files (REST):', error);
      return null;
    }
  }
};

// Fetch a file from a repo
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
    console.error('Failed to fetch the file:', error);
    return null;
  }
};

// Retrieve list of commits for a specific file
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
    console.error('Failed to retrieve the commit history:', error);
    return null;
  }
};

// Update or create a file (depending on whether a SHA is provided)
const saveFile = async (owner, repo, branch, path, content, sha = null) => {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  
  const params = {
    path: path,
    message: sha ? `Update ${path} (via via Pages CMS)` : `Create ${path} (via Pages CMS)`,
    content: content,
    branch: branch,
  };
  
  if (sha) {
    params.sha = sha;
  }

  try {
    const response = await axios.put(url, params, {
      headers: {
        Authorization: `Bearer ${token.value}`,
      },
    });

    return response.data;
  } catch (error) {
    console.error('Failed to save the file:', error);
    return null;
  }
};

// Delete a file
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

    // Handle success
    return response.data;
  } catch (error) {
    console.error('Failed to delete the file:', error);
    return null;
  }
};

// Revoke Oauth token and clear local storage
const logout = async () => {
  try {
    await axios.get('/auth/revoke?token=' + token.value);
    clearToken();
  } catch (error) {
    console.error('Failed to revoke token:', error);
    return null;
  }
};

// /!\ THE FOLLOWING IS A BIT OF A WTF... But hear me out.
// We can't easily rename a file via the GitHub API. We could copy the file with a new path and
// then delete the original, but we'd then lose the commit history. So we need to resort to a rather
// barbaric approach, chaining 5 sequential API calls. More about the why and how:
// https://stackoverflow.com/questions/31563444/rename-a-file-with-github-api
// https://medium.com/@obodley/renaming-a-file-using-the-git-api-fed1e6f04188
// https://www.levibotelho.com/development/commit-a-file-with-the-github-api/

// Rename a file (using the 5 steps)
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

    return commitSha; // Return new commit SHA if successful
  } catch (error) {
    console.error('Failed to rename the file:', error);
    return null;
  }
};

export default { token, setToken, clearToken, getProfile, searchRepos, getRepo, getBranches, getContents, getFile, getCommits, saveFile, renameFile, deleteFile, logout };