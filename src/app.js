import { GitHubClient, buildCodexBrief } from "./github.js";
import {
  addMessage,
  clearMessages,
  messagesFor,
  selectProject,
  selectedProject,
  setToken,
  state
} from "./state.js";

const content = document.querySelector("#app-content");
const title = document.querySelector("#view-title");
const eyebrow = document.querySelector("#view-eyebrow");
const toastElement = document.querySelector("#toast");
const connectionDialog = document.querySelector("#connection-dialog");
const editorDialog = document.querySelector("#editor-dialog");
const github = new GitHubClient(() => state.token);

const navItems = [
  ["projects", "Projects", "grid"],
  ["chat", "AI Chat", "spark"],
  ["files", "Files", "file"],
  ["preview", "Preview", "play"],
  ["activity", "Activity", "pulse"]
];

const icons = {
  grid: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  play: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 9 5 3-5 3z"/></svg>',
  pulse: '<svg viewBox="0 0 24 24"><path d="M3 12h4l2-6 4 12 2-6h6"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
  github: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.87c-2.78.6-3.37-1.18-3.37-1.18-.45-1.15-1.11-1.46-1.11-1.46-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.84a9.6 9.6 0 0 1 2.5.34c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/></svg>'
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

function shortSha(sha = "") {
  return sha.slice(0, 7) || "—";
}

function relativeTime(date) {
  if (!date) return "not available";
  const seconds = Math.round((new Date(date).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, amount] of units) {
    if (Math.abs(seconds) >= amount) return formatter.format(Math.round(seconds / amount), unit);
  }
  return "just now";
}

function stateBadge(status, label) {
  const normalized = ["success", "completed", "reachable"].includes(status) ? "success"
    : ["failure", "error", "unreachable"].includes(status) ? "failure"
      : ["in_progress", "queued", "pending"].includes(status) ? "pending" : "neutral";
  return `<span class="status status-${normalized}"><i></i>${escapeHtml(label || status || "unknown")}</span>`;
}

function toast(message, kind = "success") {
  toastElement.textContent = message;
  toastElement.dataset.kind = kind;
  toastElement.classList.add("is-visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toastElement.classList.remove("is-visible"), 2800);
}

function setNavigation() {
  document.querySelectorAll("[data-nav]").forEach(nav => {
    nav.innerHTML = navItems.map(([id, label, icon]) => `
      <button data-view="${id}" class="nav-item ${state.activeView === id ? "is-active" : ""}">
        ${icons[icon]}<span>${label}</span>
      </button>`).join("");
  });
}

function projectSwitcher() {
  const project = selectedProject();
  return `<button class="project-switcher" data-view="projects">
    <span class="project-avatar" style="--accent:${escapeHtml(project.accent)}">${escapeHtml(project.name.slice(0, 2).toUpperCase())}</span>
    <span><small>Current project</small><strong>${escapeHtml(project.name)}</strong></span>
    ${icons.arrow}
  </button>`;
}

async function loadProject(project) {
  const previous = state.projectData.get(project.id) || {};
  state.projectData.set(project.id, { ...previous, syncing: true });
  try {
    const [repo, commits, runs, tags] = await Promise.all([
      github.repo(project.repository),
      github.commits(project.repository, project.branch, project.rootPath, 15),
      github.workflowRuns(project.repository, project.branch).catch(() => ({ workflow_runs: [] })),
      github.tags(project.repository).catch(() => [])
    ]);
    const latestRun = runs.workflow_runs?.find(run => run.name === "Build and Deploy") || runs.workflow_runs?.[0];
    let deploy = { status: "unknown", marker: "Awaiting live proof" };
    try {
      const proofPath = project.id === "neon-orbit" ? "version.json" : "data/deploy-proof.json";
      const response = await fetch(`${project.liveUrl}${proofPath}?t=${Date.now()}`, { cache: "no-store" });
      if (response.ok) {
        const proof = await response.json();
        deploy = { status: "reachable", marker: proof.marker || proof.version || "Live" };
      } else deploy = { status: "unreachable", marker: `HTTP ${response.status}` };
    } catch {
      deploy = { status: "unknown", marker: "Live check blocked" };
    }
    state.projectData.set(project.id, { repo, commits, latestRun, tags, deploy, syncing: false });
  } catch (error) {
    state.projectData.set(project.id, { ...previous, error: error.message, syncing: false });
  }
}

async function syncAll(renderWhenDone = true) {
  await Promise.all(state.projects.map(loadProject));
  if (renderWhenDone) render();
}

function projectCard(project) {
  const data = state.projectData.get(project.id) || {};
  const commit = data.commits?.[0];
  const run = data.latestRun;
  const runStatus = run?.status === "completed" ? run.conclusion : run?.status;
  return `<article class="project-card" style="--accent:${escapeHtml(project.accent)}">
    <button class="project-card-main" data-open-project="${escapeHtml(project.id)}">
      <span class="project-avatar project-avatar-large">${escapeHtml(project.name.slice(0, 2).toUpperCase())}</span>
      <span class="project-copy">
        <span class="card-kicker">${escapeHtml(project.rootPath || "workspace root")}</span>
        <strong>${escapeHtml(project.name)}</strong>
        <small>${escapeHtml(project.description)}</small>
      </span>
      ${icons.arrow}
    </button>
    <div class="project-facts">
      <div><small>Repository</small><strong>${escapeHtml(project.repository)}</strong></div>
      <div><small>Branch</small><strong>${escapeHtml(project.branch)}</strong></div>
      <div><small>Last commit</small><strong class="mono">${shortSha(commit?.sha)}</strong></div>
    </div>
    <div class="project-status-row">
      ${stateBadge(runStatus, runStatus || "waiting")}
      ${stateBadge(data.deploy?.status, data.deploy?.status === "reachable" ? "deployed" : data.deploy?.status)}
      <a class="open-link" href="${escapeHtml(project.liveUrl)}" target="_blank" rel="noreferrer">Open Game ↗</a>
    </div>
  </article>`;
}

function renderProjects() {
  title.textContent = "Projects";
  eyebrow.textContent = "AI Game Development";
  const latest = state.projectData.get("neon-orbit")?.commits?.[0];
  content.innerHTML = `
    <section class="hero-panel">
      <span class="eyebrow">GitHub is the source of truth</span>
      <h2>Build games from<br><em>anywhere.</em></h2>
      <p>Choose a permanent project, brief Codex, commit the real files, and open the deployed game at the same URL.</p>
      <div class="hero-flow"><span>Describe</span><b>→</b><span>Commit</span><b>→</b><span>Deploy</span><b>→</b><span>Play</span></div>
      <div class="hero-orb" aria-hidden="true"></div>
    </section>
    <section class="section-heading">
      <div><span class="eyebrow">${state.projects.length} stable workspaces</span><h3>Your projects</h3></div>
      <button class="button button-ghost button-small" data-sync>↻ Sync</button>
    </section>
    <section class="project-grid">${state.projects.map(projectCard).join("")}</section>
    <section class="continuity-card">
      <span class="continuity-icon">⌁</span>
      <div><strong>Continuous project history</strong><small>Latest observed commit ${shortSha(latest?.sha)}. Git commits and tags are your versions — no generated ZIP copies.</small></div>
    </section>`;
}

function renderChat() {
  const project = selectedProject();
  const data = state.projectData.get(project.id) || {};
  const messages = messagesFor(project.id);
  title.textContent = "AI Development Chat";
  eyebrow.textContent = project.name;
  content.innerHTML = `
    ${projectSwitcher()}
    <section class="chat-workspace">
      <div class="agent-banner">
        <span class="agent-mark">✦</span>
        <div><strong>Codex handoff ready</strong><small>Repository, branch, path, checks, commit and same-URL deploy proof are added automatically.</small></div>
        ${stateBadge("success", "scoped")}
      </div>
      <div class="chat-log" id="chat-log">
        <article class="message message-agent">
          <span class="message-avatar">✦</span>
          <div><small>Game Hub</small><p>What should change in <strong>${escapeHtml(project.name)}</strong>? I’ll create a precise task for Codex to edit <code>${escapeHtml(project.repository)}</code> on <code>${escapeHtml(project.branch)}</code>.</p></div>
        </article>
        ${messages.map(message => `<article class="message message-${message.role}">
          <span class="message-avatar">${message.role === "user" ? "You" : "✦"}</span>
          <div><small>${message.role === "user" ? "You" : "Codex handoff"}</small><p>${escapeHtml(message.text)}</p>
            ${message.brief ? `<div class="brief-actions"><button class="button button-secondary button-small" data-copy-brief="${message.id}">Copy full brief</button><button class="button button-primary button-small" data-open-codex="${message.id}">Open Codex ↗</button></div>` : ""}
          </div>
        </article>`).join("")}
      </div>
      <div class="prompt-chips">
        <button data-prompt="Fix the current gameplay bug and add a regression test.">Fix a bug</button>
        <button data-prompt="Improve touch controls for iPhone without changing the stable URL.">Improve controls</button>
        <button data-prompt="Optimize runtime performance and verify it on a mobile viewport.">Optimize</button>
      </div>
      <form class="composer" id="chat-form">
        <textarea id="chat-input" rows="2" placeholder="Describe the change…" required></textarea>
        <button class="send-button" aria-label="Create Codex task">↑</button>
      </form>
      <div class="chat-meta"><span class="mono">HEAD ${shortSha(data.commits?.[0]?.sha)}</span><button class="text-button" data-clear-chat>Clear local chat</button></div>
    </section>`;
  requestAnimationFrame(() => document.querySelector("#chat-log")?.scrollTo(0, 999999));
}

async function loadFiles() {
  const project = selectedProject();
  content.innerHTML = `${projectSwitcher()}<div class="loading-card"><span class="spinner"></span>Reading repository tree…</div>`;
  try {
    state.files = await github.tree(project.repository, project.branch, project.rootPath);
    renderFiles();
  } catch (error) {
    content.innerHTML = `${projectSwitcher()}<div class="error-card"><strong>Files unavailable</strong><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function renderFiles(query = "") {
  const project = selectedProject();
  title.textContent = "Files";
  eyebrow.textContent = `${project.name} / ${project.branch}`;
  const filtered = state.files.filter(file => file.displayPath.toLowerCase().includes(query.toLowerCase()));
  content.innerHTML = `
    ${projectSwitcher()}
    <section class="files-toolbar">
      <label class="search-box"><span>⌕</span><input id="file-search" type="search" value="${escapeHtml(query)}" placeholder="Search code and files" /></label>
      <button class="button button-primary button-small" data-new-file>+ File</button>
    </section>
    <section class="file-browser">
      <div class="file-browser-head"><span>${filtered.length} files</span><span class="mono">${escapeHtml(project.rootPath || "/")}</span></div>
      <div class="file-list">
        ${filtered.slice(0, 300).map(file => `<button class="file-row" data-file="${escapeHtml(file.path)}">
          <span class="file-type">${file.displayPath.split(".").pop().slice(0, 4)}</span>
          <span><strong>${escapeHtml(file.displayPath.split("/").pop())}</strong><small>${escapeHtml(file.displayPath.includes("/") ? file.displayPath.split("/").slice(0, -1).join("/") : "project root")}</small></span>
          <span class="file-size">${Math.max(1, Math.round(file.size / 1024))} KB</span>
        </button>`).join("") || `<div class="empty-state">No matching files</div>`}
      </div>
    </section>
    <p class="files-note">Direct commits require a fine-grained GitHub token. Codex edits use your separately authorized GitHub connection.</p>`;
}

function renderPreview() {
  const project = selectedProject();
  const data = state.projectData.get(project.id) || {};
  title.textContent = "Live Preview";
  eyebrow.textContent = project.name;
  content.innerHTML = `
    ${projectSwitcher()}
    <section class="preview-toolbar">
      <div>${stateBadge(data.deploy?.status, data.deploy?.status === "reachable" ? "Live" : "Checking")}<span class="preview-url">${escapeHtml(project.liveUrl)}</span></div>
      <a class="button button-primary button-small" href="${escapeHtml(project.liveUrl)}" target="_blank" rel="noreferrer">Open Game ↗</a>
    </section>
    <section class="phone-preview">
      <div class="phone-speaker"></div>
      <iframe src="${escapeHtml(project.liveUrl)}" title="${escapeHtml(project.name)} live preview" loading="eager"></iframe>
      <div class="phone-home"></div>
    </section>
    <div class="preview-proof"><span>Deploy proof</span><strong class="mono">${escapeHtml(data.deploy?.marker || "awaiting live marker")}</strong><button data-sync class="text-button">Recheck</button></div>`;
}

function renderActivity() {
  const project = selectedProject();
  const data = state.projectData.get(project.id) || {};
  const run = data.latestRun;
  const runStatus = run?.status === "completed" ? run.conclusion : run?.status;
  title.textContent = "Build & History";
  eyebrow.textContent = project.name;
  content.innerHTML = `
    ${projectSwitcher()}
    <section class="status-grid">
      <article><span class="eyebrow">Build Status</span>${stateBadge(runStatus, runStatus || "waiting")}<strong>${escapeHtml(run?.name || "Build and Deploy")}</strong><small>${relativeTime(run?.updated_at)}</small></article>
      <article><span class="eyebrow">Deploy Status</span>${stateBadge(data.deploy?.status, data.deploy?.status || "unknown")}<strong>${escapeHtml(data.deploy?.marker || "No proof yet")}</strong><small>Same stable URL</small></article>
      <article><span class="eyebrow">Current Branch</span><span class="branch-chip">⑂ ${escapeHtml(project.branch)}</span><strong>${shortSha(data.commits?.[0]?.sha)}</strong><small>${escapeHtml(project.repository)}</small></article>
    </section>
    <section class="activity-layout">
      <div>
        <div class="section-heading"><div><span class="eyebrow">Commit History</span><h3>Recent changes</h3></div><a class="text-button" target="_blank" rel="noreferrer" href="https://github.com/${escapeHtml(project.repository)}/commits/${escapeHtml(project.branch)}">GitHub ↗</a></div>
        <div class="timeline">${(data.commits || []).map((commit, index) => `<article>
          <span class="timeline-dot ${index === 0 ? "is-current" : ""}"></span>
          <div><strong>${escapeHtml(commit.commit.message.split("\n")[0])}</strong><small>${escapeHtml(commit.commit.author?.name || "GitHub")} · ${relativeTime(commit.commit.author?.date)}</small></div>
          <code>${shortSha(commit.sha)}</code>
        </article>`).join("") || `<div class="empty-state">No commits loaded</div>`}</div>
      </div>
      <div>
        <div class="section-heading"><div><span class="eyebrow">Versions / Backup</span><h3>Recoverable history</h3></div></div>
        <div class="backup-card"><span>∞</span><strong>Every commit is a backup</strong><p>Restore through Git history. Tags mark releases without duplicating the project.</p></div>
        <div class="tag-list">${(data.tags || []).map(tag => `<span><strong>${escapeHtml(tag.name)}</strong><code>${shortSha(tag.commit.sha)}</code></span>`).join("") || `<span><strong>No tags yet</strong><small>Commit history is still fully available.</small></span>`}</div>
      </div>
    </section>`;
}

function render() {
  setNavigation();
  document.querySelector("#connection-button").classList.toggle("is-connected", Boolean(state.token));
  if (state.activeView === "projects") renderProjects();
  if (state.activeView === "chat") renderChat();
  if (state.activeView === "files") loadFiles();
  if (state.activeView === "preview") renderPreview();
  if (state.activeView === "activity") renderActivity();
}

function findBrief(id) {
  return Object.values(state.chats).flat().find(message => message.id === id)?.brief;
}

async function copyBrief(id, open = false) {
  const brief = findBrief(id);
  if (!brief) return;
  await navigator.clipboard.writeText(brief);
  toast("Codex brief copied");
  if (open) window.open("https://chatgpt.com/codex", "_blank", "noopener,noreferrer");
}

async function openFile(path) {
  const project = selectedProject();
  try {
    content.insertAdjacentHTML("beforeend", '<div class="screen-loader"><span class="spinner"></span></div>');
    const file = await github.file(project.repository, path, project.branch);
    state.selectedFile = { ...file, originalPath: path };
    document.querySelector("#editor-title").textContent = path.split("/").pop();
    document.querySelector("#editor-path").value = path;
    document.querySelector("#editor-content").value = file.text;
    document.querySelector("#editor-message").value = `Update ${path.split("/").pop()}`;
    document.querySelector("#delete-file-button").hidden = false;
    editorDialog.showModal();
  } catch (error) {
    toast(error.message, "error");
  } finally {
    document.querySelector(".screen-loader")?.remove();
  }
}

function newFile() {
  const project = selectedProject();
  const prefix = project.rootPath ? `${project.rootPath.replace(/\/$/, "")}/` : "";
  state.selectedFile = { originalPath: "", text: "" };
  document.querySelector("#editor-title").textContent = "New file";
  document.querySelector("#editor-path").value = `${prefix}new-file.js`;
  document.querySelector("#editor-content").value = "";
  document.querySelector("#editor-message").value = "Add new file";
  document.querySelector("#delete-file-button").hidden = true;
  editorDialog.showModal();
}

async function commitEditor(deleteFile = false) {
  const project = selectedProject();
  const originalPath = state.selectedFile?.originalPath || "";
  const path = document.querySelector("#editor-path").value.trim();
  const message = document.querySelector("#editor-message").value.trim();
  const fileContent = document.querySelector("#editor-content").value;
  if (!path || !message) return toast("Path and commit message are required", "error");
  if (project.rootPath && !path.startsWith(`${project.rootPath.replace(/\/$/, "")}/`)) {
    return toast(`Keep files inside ${project.rootPath}`, "error");
  }
  if (!state.token) {
    editorDialog.close();
    connectionDialog.showModal();
    return toast("Connect GitHub before committing", "error");
  }
  const changes = [];
  if (deleteFile) changes.push({ path: originalPath, delete: true });
  else {
    if (originalPath && originalPath !== path) changes.push({ path: originalPath, delete: true });
    changes.push({ path, content: fileContent });
  }
  try {
    document.querySelector("#commit-file-button").disabled = true;
    const commit = await github.commitChanges(project.repository, project.branch, message, changes);
    editorDialog.close();
    toast(`Committed ${shortSha(commit.sha)}`);
    await loadProject(project);
    await loadFiles();
  } catch (error) {
    toast(error.message, "error");
  } finally {
    document.querySelector("#commit-file-button").disabled = false;
  }
}

document.addEventListener("click", async event => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    state.activeView = viewButton.dataset.view;
    render();
    return;
  }
  const projectButton = event.target.closest("[data-open-project]");
  if (projectButton) {
    selectProject(projectButton.dataset.openProject);
    state.activeView = "chat";
    render();
    return;
  }
  if (event.target.closest("[data-sync]")) {
    toast("Syncing GitHub…");
    await syncAll();
    return;
  }
  const prompt = event.target.closest("[data-prompt]");
  if (prompt) {
    document.querySelector("#chat-input").value = prompt.dataset.prompt;
    document.querySelector("#chat-input").focus();
    return;
  }
  const copy = event.target.closest("[data-copy-brief]");
  if (copy) return copyBrief(copy.dataset.copyBrief);
  const open = event.target.closest("[data-open-codex]");
  if (open) return copyBrief(open.dataset.openCodex, true);
  if (event.target.closest("[data-clear-chat]")) {
    clearMessages(selectedProject().id);
    renderChat();
    return;
  }
  const file = event.target.closest("[data-file]");
  if (file) return openFile(file.dataset.file);
  if (event.target.closest("[data-new-file]")) return newFile();
});

document.addEventListener("submit", event => {
  if (event.target.id !== "chat-form") return;
  event.preventDefault();
  const input = document.querySelector("#chat-input");
  const request = input.value.trim();
  if (!request) return;
  const project = selectedProject();
  const id = crypto.randomUUID();
  const head = state.projectData.get(project.id)?.commits?.[0]?.sha || "unknown";
  addMessage(project.id, { id: `${id}-user`, role: "user", text: request, createdAt: new Date().toISOString() });
  addMessage(project.id, {
    id,
    role: "agent",
    text: "Task scoped to the real repository. Copy the full brief and open Codex to implement, commit, deploy, and verify it.",
    brief: buildCodexBrief(project, request, head),
    createdAt: new Date().toISOString()
  });
  renderChat();
});

document.addEventListener("input", event => {
  if (event.target.id === "file-search") renderFiles(event.target.value);
});

document.querySelector("#connection-button").addEventListener("click", () => {
  document.querySelector("#token-input").value = state.token;
  connectionDialog.showModal();
});
document.querySelector("#save-token-button").addEventListener("click", async () => {
  setToken(document.querySelector("#token-input").value);
  connectionDialog.close();
  toast(state.token ? "GitHub connected for this session" : "Public read-only mode");
  await syncAll();
});
document.querySelector("#disconnect-button").addEventListener("click", () => {
  setToken("");
  connectionDialog.close();
  render();
  toast("GitHub token cleared");
});
document.querySelector("#commit-file-button").addEventListener("click", () => commitEditor(false));
document.querySelector("#delete-file-button").addEventListener("click", () => {
  if (confirm(`Delete ${state.selectedFile?.originalPath} in a GitHub commit?`)) commitEditor(true);
});

async function init() {
  try {
    const response = await fetch(`data/projects.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Project registry unavailable");
    state.projects = await response.json();
    if (!state.projects.some(project => project.id === state.selectedId)) selectProject(state.projects[0].id);
    render();
    syncAll();
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  } catch (error) {
    content.innerHTML = `<div class="error-card"><strong>Game Hub could not start</strong><p>${escapeHtml(error.message)}</p></div>`;
  }
}

init();
