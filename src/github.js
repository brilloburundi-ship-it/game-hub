const API_ROOT = "https://api.github.com";

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function decodeBase64(value) {
  const bytes = Uint8Array.from(atob(value.replace(/\n/g, "")), character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function splitRepository(repository) {
  const [owner, repo, ...rest] = String(repository).split("/");
  if (!owner || !repo || rest.length) throw new Error("Repository must use owner/name format.");
  return { owner, repo };
}

export function buildCodexBrief(project, request, head = "unknown") {
  const root = project.rootPath || "repository root";
  return [
    `Work directly in GitHub repository ${project.repository}.`,
    `Branch: ${project.branch}. Current observed head: ${head}.`,
    `Permanent project path: ${root}.`,
    `Stable live URL that must not change: ${project.liveUrl}`,
    "",
    "Requested change:",
    request.trim(),
    "",
    "Use the authorized GitHub connection and modify the real files. Read and search the code first, then create, edit, delete, rename, or update assets/configuration as needed. Do not create a ZIP, copied project, timestamped version folder, or parallel replacement repository.",
    "Run the repository checks, create a focused commit, wait for GitHub Actions, and verify the live URL serves the updated result. Report the commit SHA, workflow result, and same-URL deploy proof. Do not call the task complete if the deploy was not verified."
  ].join("\n");
}

export class GitHubClient {
  constructor(getToken = () => "") {
    this.getToken = getToken;
  }

  async request(path, options = {}) {
    const token = this.getToken();
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API_ROOT}${path}`, { ...options, headers });
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message || `GitHub request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  repo(repository) {
    return this.request(`/repos/${repository}`);
  }

  branch(repository, branch) {
    return this.request(`/repos/${repository}/branches/${encodeURIComponent(branch)}`);
  }

  commits(repository, branch, path = "", perPage = 15) {
    const query = new URLSearchParams({ sha: branch, per_page: String(perPage) });
    if (path) query.set("path", path);
    return this.request(`/repos/${repository}/commits?${query}`);
  }

  workflowRuns(repository, branch) {
    const query = new URLSearchParams({ branch, per_page: "10" });
    return this.request(`/repos/${repository}/actions/runs?${query}`);
  }

  tags(repository) {
    return this.request(`/repos/${repository}/tags?per_page=20`);
  }

  async tree(repository, branch, rootPath = "") {
    const branchData = await this.branch(repository, branch);
    const treeSha = branchData.commit.commit.tree.sha;
    const tree = await this.request(`/repos/${repository}/git/trees/${treeSha}?recursive=1`);
    const prefix = rootPath ? `${rootPath.replace(/\/$/, "")}/` : "";
    return tree.tree
      .filter(entry => entry.type === "blob" && (!prefix || entry.path.startsWith(prefix)))
      .map(entry => ({ ...entry, displayPath: prefix ? entry.path.slice(prefix.length) : entry.path }));
  }

  async file(repository, path, branch) {
    const query = new URLSearchParams({ ref: branch });
    const data = await this.request(`/repos/${repository}/contents/${encodePath(path)}?${query}`);
    return { ...data, text: data.encoding === "base64" ? decodeBase64(data.content) : data.content };
  }

  async createBlob(repository, content) {
    return this.request(`/repos/${repository}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content, encoding: "utf-8" })
    });
  }

  async commitChanges(repository, branch, message, changes) {
    if (!this.getToken()) throw new Error("Connect a GitHub token before committing.");
    if (!message.trim()) throw new Error("A commit message is required.");
    if (!changes.length) throw new Error("No file changes to commit.");

    const refPath = `/repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`;
    const ref = await this.request(refPath);
    const parentSha = ref.object.sha;
    const parent = await this.request(`/repos/${repository}/git/commits/${parentSha}`);
    const entries = [];

    for (const change of changes) {
      if (change.delete) {
        entries.push({ path: change.path, mode: "100644", type: "blob", sha: null });
      } else {
        const blob = await this.createBlob(repository, change.content);
        entries.push({ path: change.path, mode: "100644", type: "blob", sha: blob.sha });
      }
    }

    const tree = await this.request(`/repos/${repository}/git/trees`, {
      method: "POST",
      body: JSON.stringify({ base_tree: parent.tree.sha, tree: entries })
    });
    const commit = await this.request(`/repos/${repository}/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message: message.trim(), tree: tree.sha, parents: [parentSha] })
    });
    await this.request(`/repos/${repository}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false })
    });
    return commit;
  }
}
