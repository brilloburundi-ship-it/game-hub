import { GitHubClient } from "./github.js";

const CHATGPT_URL = "https://chatgpt.com/";
const TOKEN_KEY = "game-hub.github-token";
const PROJECT_KEY = "game-hub.studio-project";

const github = new GitHubClient(() => sessionStorage.getItem(TOKEN_KEY) || "");
const app = document.querySelector("#studio-content");
const pageTitle = document.querySelector("#page-title");
const pageEyebrow = document.querySelector("#page-eyebrow");
const projectSelect = document.querySelector("#project-select");
const connectionDialog = document.querySelector("#connection-dialog");
const newGameDialog = document.querySelector("#new-game-dialog");
const toastNode = document.querySelector("#toast");

const state = {
  view: "home",
  projects: [],
  selectedId: localStorage.getItem(PROJECT_KEY) || "",
  projectData: new Map(),
  assetFiles: new Map()
};

const nav = [
  ["home", "Home", "⌂"],
  ["develop", "Develop", "✦"],
  ["assets", "Assets", "◇"],
  ["preview", "Preview", "▶"],
  ["more", "More", "•••"]
];

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function shortSha(sha = "") {
  return sha ? sha.slice(0, 7) : "—";
}

function toast(message, kind = "ok") {
  toastNode.textContent = message;
  toastNode.dataset.kind = kind;
  toastNode.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toastNode.classList.remove("show"), 2600);
}

function currentProject() {
  return state.projects.find(project => project.id === state.selectedId) || state.projects[0] || null;
}

function setProject(id) {
  state.selectedId = id;
  localStorage.setItem(PROJECT_KEY, id);
  projectSelect.value = id;
  render();
  syncProject(currentProject()).then(render);
}

function setView(view) {
  state.view = view;
  location.hash = view;
  document.querySelectorAll("[data-nav-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.navView === view);
  });
  render();
}

function renderNav() {
  document.querySelectorAll("[data-studio-nav]").forEach(node => {
    node.innerHTML = nav.map(([id, label, icon]) => `
      <button class="studio-nav-item ${state.view === id ? "active" : ""}" data-nav-view="${id}">
        <span class="nav-icon">${icon}</span><span>${label}</span>
      </button>`).join("");
  });
}

function renderProjectSelect() {
  projectSelect.innerHTML = state.projects.map(project => `
    <option value="${esc(project.id)}" ${project.id === state.selectedId ? "selected" : ""}>${esc(project.name)}</option>
  `).join("");
}

async function syncProject(project) {
  if (!project) return;
  try {
    const [repo, commits, runs] = await Promise.all([
      github.repo(project.repository),
      github.commits(project.repository, project.branch, project.rootPath, 8),
      github.workflowRuns(project.repository, project.branch).catch(() => ({ workflow_runs: [] }))
    ]);
    const latestRun = runs.workflow_runs?.[0] || null;
    state.projectData.set(project.id, { repo, commits, latestRun, error: null });
  } catch (error) {
    state.projectData.set(project.id, { ...(state.projectData.get(project.id) || {}), error: error.message });
  }
}

async function syncAssets(project) {
  if (!project || state.assetFiles.has(project.id)) return;
  try {
    const tree = await github.tree(project.repository, project.branch, project.rootPath);
    const assets = tree.filter(file => /\.(png|webp|jpg|jpeg|gif|svg)$/i.test(file.path));
    state.assetFiles.set(project.id, assets);
  } catch {
    state.assetFiles.set(project.id, []);
  }
}

function statusPill(project) {
  const data = state.projectData.get(project?.id) || {};
  const run = data.latestRun;
  const status = run?.status === "completed" ? run.conclusion : run?.status;
  const ok = status === "success";
  return `<span class="status-pill ${ok ? "good" : status ? "pending" : "idle"}"><i></i>${esc(status || "ready")}</span>`;
}

function projectCard(project) {
  const data = state.projectData.get(project.id) || {};
  const commit = data.commits?.[0];
  return `<article class="game-card ${project.id === state.selectedId ? "selected" : ""}">
    <button class="game-card-main" data-select-project="${esc(project.id)}">
      <span class="game-icon" style="--accent:${esc(project.accent || "#91ffd7")}">${esc(project.name.slice(0, 2).toUpperCase())}</span>
      <span class="game-copy"><small>${esc(project.rootPath || "repository root")}</small><strong>${esc(project.name)}</strong><p>${esc(project.description || "Game project")}</p></span>
      <span class="chevron">›</span>
    </button>
    <div class="game-card-footer"><span class="mono">${shortSha(commit?.sha)}</span>${statusPill(project)}<a href="${esc(project.liveUrl)}" target="_blank" rel="noreferrer">Open game ↗</a></div>
  </article>`;
}

function renderHome() {
  pageEyebrow.textContent = "Game Hub Studio";
  pageTitle.textContent = "Create & build";
  app.innerHTML = `
    <section class="creator-hero">
      <div class="hero-glow"></div>
      <span class="product-chip">ChatGPT is the engine</span>
      <h2>Describe a game.<br><em>Build the real project.</em></h2>
      <p>Game Hub keeps your projects, assets, versions, previews and deploys together. ChatGPT/Codex does the development with your own account.</p>
      <div class="hero-actions">
        <button class="primary-action" data-new-game>＋ Create new game</button>
        <button class="secondary-action" data-view="develop">✦ Develop current</button>
      </div>
      <div class="flow-strip"><span>Prompt</span><b>→</b><span>Code + assets</span><b>→</b><span>Deploy</span><b>→</b><span>Play</span></div>
    </section>

    <section class="quick-grid">
      <button class="quick-card" data-new-game><span>＋</span><strong>New Game</strong><small>Start from a natural-language idea</small></button>
      <button class="quick-card" data-view="assets"><span>◇</span><strong>Asset Studio</strong><small>Plan and generate project assets</small></button>
      <button class="quick-card" data-view="preview"><span>▶</span><strong>Live Preview</strong><small>Test the same deployed URL</small></button>
      <button class="quick-card" data-view="more"><span>⌁</span><strong>Build & Bridge</strong><small>Versions, deploy and LIVE tools</small></button>
    </section>

    <div class="section-title"><div><span>YOUR WORKSPACE</span><h3>My Games</h3></div><button class="text-action" data-sync>Sync</button></div>
    <section class="games-list">${state.projects.map(projectCard).join("")}</section>
  `;
}

function projectContext(project) {
  const data = state.projectData.get(project.id) || {};
  return {
    repo: project.repository,
    branch: project.branch,
    root: project.rootPath || "repository root",
    url: project.liveUrl,
    head: data.commits?.[0]?.sha || "unknown"
  };
}

function developmentBrief(project, request) {
  const ctx = projectContext(project);
  return `Work on my Game Hub project directly in GitHub.\n\nProject: ${project.name}\nRepository: ${ctx.repo}\nBranch: ${ctx.branch}\nPermanent path: ${ctx.root}\nCurrent observed HEAD: ${ctx.head}\nStable preview URL: ${ctx.url}\n\nREQUEST\n${request.trim()}\n\nRULES\n- Read and understand the existing project before changing it.\n- Modify the real project in place. Never create a ZIP, timestamped copy, duplicate game folder or replacement repository.\n- Preserve the stable project path and preview URL.\n- For new visual content, determine the assets the game actually needs. Prefer lightweight 2D game-ready assets with transparent backgrounds when appropriate, consistent scale, clean silhouettes and no baked-in UI text.\n- Put assets into organized project folders and wire them into the game instead of merely generating unused images.\n- Reuse existing assets when they are suitable; replace them only when the request requires it.\n- Keep mobile performance, touch controls and loading time in mind.\n- Run available checks/builds, commit focused changes, then verify the deploy.\n- Report the commit SHA and what changed.\n\nGame Hub is the workspace; ChatGPT/Codex is the development engine.`;
}

function newGameBrief(idea, platform, art) {
  return `Create a new production-ready web game for my Game Hub workspace.\n\nGAME IDEA\n${idea.trim()}\n\nTARGET\nPlatform: ${platform}\nVisual direction: ${art}\n\nBUILD REQUIREMENTS\n- Create one permanent project with a clean game-oriented folder structure.\n- Do not create versioned ZIPs or duplicate project folders.\n- Choose an appropriate lightweight web game stack based on the request instead of forcing a fixed template.\n- Build actual playable gameplay, not a static mockup.\n- First infer an asset manifest: player, enemies/vehicles/units, environment, props, UI, VFX and other visuals actually required by the design.\n- Create/import the needed game-ready visual assets. For 2D sprites, use transparent backgrounds, clean edges, consistent perspective and scale, and keep assets separated so the game can animate/place them independently.\n- Store assets in organized folders such as assets/characters, assets/vehicles, assets/environment, assets/ui and assets/vfx as appropriate.\n- Import and use every generated asset in the actual game. Do not leave a disconnected concept sheet as the final result.\n- Optimize asset resolution and runtime for mobile.\n- Add touch controls when mobile is targeted.\n- Add a clear entry point and loading/error handling.\n- Run checks and build before considering the task complete.\n\nWhen repository tools are available, create or register the project in my Game Hub-connected GitHub workspace and commit the real files. If a required repository creation/publishing tool is not available, stop at that boundary and tell me exactly what one-time action is needed instead of pretending it was deployed.`;
}

async function copyAndOpenChatGPT(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Prompt copied — opening ChatGPT");
  } catch {
    toast("Open ChatGPT and paste the prepared brief", "warn");
  }
  window.open(CHATGPT_URL, "_blank", "noopener,noreferrer");
}

function renderDevelop() {
  const project = currentProject();
  pageEyebrow.textContent = project?.name || "Project";
  pageTitle.textContent = "Develop with ChatGPT";
  if (!project) return renderEmpty();
  const data = state.projectData.get(project.id) || {};
  app.innerHTML = `
    <section class="chatgpt-panel">
      <div class="engine-header"><div class="engine-logo">✦</div><div><span>DEVELOPMENT ENGINE</span><h2>ChatGPT / Codex</h2></div><span class="external-badge">External</span></div>
      <p class="engine-copy">Game Hub does not run a hidden AI model. It prepares the exact project context; your own ChatGPT/Codex account performs the development.</p>
      <div class="context-card">
        <div><small>Repository</small><strong>${esc(project.repository)}</strong></div>
        <div><small>Path</small><strong>${esc(project.rootPath || "/")}</strong></div>
        <div><small>HEAD</small><strong class="mono">${shortSha(data.commits?.[0]?.sha)}</strong></div>
        <div><small>Deploy</small>${statusPill(project)}</div>
      </div>
      <form id="develop-form" class="prompt-box">
        <label for="develop-prompt">What should ChatGPT build or change?</label>
        <textarea id="develop-prompt" rows="7" placeholder="Example: Improve the medieval battles. Create the missing transparent 2D siege assets, import them into the game, add formations and keep 60 FPS on iPhone." required></textarea>
        <div class="prompt-suggestions">
          <button type="button" data-fill-prompt="Create the missing game-ready 2D assets with transparent backgrounds and import them into the current game. Keep the existing visual style consistent.">Generate + import assets</button>
          <button type="button" data-fill-prompt="Improve the gameplay and controls for iPhone while preserving the current project URL and existing features.">Improve gameplay</button>
          <button type="button" data-fill-prompt="Profile the project for performance bottlenecks and optimize it for a stable mobile frame rate without reducing the important visuals.">Optimize mobile</button>
        </div>
        <button class="primary-action full" type="submit">✦ Copy brief & open ChatGPT</button>
      </form>
      <p class="fine-print">The prepared brief tells ChatGPT to edit the real repository, keep the same URL, generate only useful assets, import them into the game, build and verify the result.</p>
    </section>
  `;
}

function assetUrl(project, file) {
  const relative = project.rootPath ? file.path.slice(project.rootPath.replace(/\/$/, "").length + 1) : file.path;
  return `${project.liveUrl}${relative.split("/").map(encodeURIComponent).join("/")}`;
}

async function renderAssets() {
  const project = currentProject();
  pageEyebrow.textContent = project?.name || "Project";
  pageTitle.textContent = "Assets";
  if (!project) return renderEmpty();
  app.innerHTML = `<div class="loading-panel"><span class="loader"></span>Reading project assets…</div>`;
  await syncAssets(project);
  const files = state.assetFiles.get(project.id) || [];
  app.innerHTML = `
    <section class="asset-intro">
      <div><span>PROJECT ASSET LIBRARY</span><h2>Visuals used by the game</h2><p>Generate through ChatGPT, then keep assets organized and actually wired into gameplay.</p></div>
      <button class="primary-action" data-asset-chat>✦ Generate with ChatGPT</button>
    </section>
    <div class="asset-rules"><span>Transparent 2D</span><span>Game-ready scale</span><span>Organized folders</span><span>Used in code</span></div>
    ${files.length ? `<section class="asset-grid">${files.slice(0, 80).map(file => `
      <article class="asset-tile">
        <div class="checker"><img src="${esc(assetUrl(project, file))}" alt="" loading="lazy" onerror="this.closest('.asset-tile').classList.add('broken')" /></div>
        <strong>${esc(file.displayPath.split("/").pop())}</strong><small>${esc(file.displayPath)}</small>
      </article>`).join("")}</section>` : `<section class="empty-card"><span>◇</span><h3>No image assets found yet</h3><p>Ask ChatGPT to create the first asset pack and import it into this project.</p><button class="primary-action" data-asset-chat>Generate first asset pack</button></section>`}
  `;
}

function renderPreview() {
  const project = currentProject();
  pageEyebrow.textContent = project?.name || "Project";
  pageTitle.textContent = "Live Preview";
  if (!project) return renderEmpty();
  app.innerHTML = `
    <section class="preview-toolbar">
      <div><span>STABLE URL</span><strong>${esc(project.liveUrl)}</strong></div>
      <a class="primary-action compact" href="${esc(project.liveUrl)}" target="_blank" rel="noreferrer">Open game ↗</a>
    </section>
    <section class="phone-preview"><div class="phone-speaker"></div><iframe src="${esc(project.liveUrl)}" title="${esc(project.name)} preview" loading="eager"></iframe></section>
    <p class="fine-print center">The preview keeps the same URL across commits. If a service worker caches an older build, use Open game and refresh once.</p>
  `;
}

function renderMore() {
  const project = currentProject();
  const data = project ? state.projectData.get(project.id) || {} : {};
  pageEyebrow.textContent = project?.name || "Workspace";
  pageTitle.textContent = "Project tools";
  if (!project) return renderEmpty();
  const repoPath = project.rootPath ? `/tree/${encodeURIComponent(project.branch)}/${project.rootPath}` : "";
  app.innerHTML = `
    <section class="tool-list">
      <a class="tool-row" href="https://github.com/${esc(project.repository)}${repoPath}" target="_blank" rel="noreferrer"><span class="tool-icon">⌘</span><div><strong>Files & code</strong><small>Browse the real GitHub project</small></div><b>›</b></a>
      <button class="tool-row" data-view="develop"><span class="tool-icon">✦</span><div><strong>Develop with ChatGPT</strong><small>Prepare project-scoped instructions</small></div><b>›</b></button>
      <a class="tool-row" href="https://github.com/${esc(project.repository)}/commits/${esc(project.branch)}" target="_blank" rel="noreferrer"><span class="tool-icon">⌁</span><div><strong>Versions</strong><small>${data.commits?.length || 0} recent commits observed</small></div><b>›</b></a>
      <button class="tool-row" data-bridge-info><span class="tool-icon">⇄</span><div><strong>LIVE Bridge</strong><small>TikFinity / WebSocket connection tools</small></div><span class="soon">Setup</span></button>
      <button class="tool-row" data-connect-github><span class="tool-icon">GH</span><div><strong>GitHub connection</strong><small>Current prototype session access</small></div><b>›</b></button>
    </section>
    <section class="founder-card"><span>FOUNDER PLAN</span><h3>Free forever for this workspace</h3><p>Founder access is internal and independent from future customer plans.</p></section>
  `;
}

function renderEmpty() {
  app.innerHTML = `<section class="empty-card"><span>＋</span><h3>No project selected</h3><p>Create or register a game to start.</p><button class="primary-action" data-new-game>Create game</button></section>`;
}

function render() {
  renderNav();
  renderProjectSelect();
  if (state.view === "home") renderHome();
  else if (state.view === "develop") renderDevelop();
  else if (state.view === "assets") renderAssets();
  else if (state.view === "preview") renderPreview();
  else renderMore();
}

function openNewGame() {
  document.querySelector("#new-game-form")?.reset();
  newGameDialog.showModal();
}

function wireEvents() {
  document.addEventListener("click", async event => {
    const navButton = event.target.closest("[data-nav-view], [data-view]");
    if (navButton) {
      setView(navButton.dataset.navView || navButton.dataset.view);
      return;
    }
    const selectButton = event.target.closest("[data-select-project]");
    if (selectButton) return setProject(selectButton.dataset.selectProject);
    if (event.target.closest("[data-new-game]")) return openNewGame();
    if (event.target.closest("[data-sync]")) {
      await Promise.all(state.projects.map(syncProject));
      toast("Workspace synced");
      return render();
    }
    if (event.target.closest("[data-connect-github]")) return connectionDialog.showModal();
    if (event.target.closest("[data-asset-chat]")) {
      const project = currentProject();
      const brief = developmentBrief(project, "Audit the visual needs of this game, create the missing lightweight game-ready assets with transparent backgrounds where appropriate, organize them in the asset folders, import them into the actual game code, remove unused replacements only when safe, then build and verify the deployed game.");
      return copyAndOpenChatGPT(brief);
    }
    if (event.target.closest("[data-bridge-info]")) {
      toast("Bridge control will be connected after the project bridge protocol is standardized", "warn");
    }
    const fill = event.target.closest("[data-fill-prompt]");
    if (fill) {
      const input = document.querySelector("#develop-prompt");
      if (input) input.value = fill.dataset.fillPrompt;
    }
  });

  document.addEventListener("submit", async event => {
    if (event.target.id === "develop-form") {
      event.preventDefault();
      const project = currentProject();
      const request = document.querySelector("#develop-prompt").value;
      await copyAndOpenChatGPT(developmentBrief(project, request));
    }
    if (event.target.id === "new-game-form") {
      event.preventDefault();
      const idea = document.querySelector("#game-idea").value;
      const platform = document.querySelector("#game-platform").value;
      const art = document.querySelector("#game-art").value;
      newGameDialog.close();
      await copyAndOpenChatGPT(newGameBrief(idea, platform, art));
    }
  });

  projectSelect.addEventListener("change", () => setProject(projectSelect.value));
  document.querySelector("#profile-button").addEventListener("click", () => connectionDialog.showModal());
  document.querySelector("#close-connection").addEventListener("click", () => connectionDialog.close());
  document.querySelector("#close-new-game").addEventListener("click", () => newGameDialog.close());
  document.querySelector("#save-token-button").addEventListener("click", () => {
    const token = document.querySelector("#token-input").value.trim();
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
    connectionDialog.close();
    toast(token ? "GitHub session connected" : "GitHub session cleared");
    syncProject(currentProject()).then(render);
  });
  document.querySelector("#disconnect-button").addEventListener("click", () => {
    sessionStorage.removeItem(TOKEN_KEY);
    document.querySelector("#token-input").value = "";
    connectionDialog.close();
    toast("GitHub session disconnected");
  });
}

async function boot() {
  const initialView = location.hash.replace("#", "");
  if (nav.some(([id]) => id === initialView)) state.view = initialView;
  try {
    const response = await fetch(`data/projects.json?t=${Date.now()}`, { cache: "no-store" });
    state.projects = await response.json();
    if (!state.selectedId || !state.projects.some(project => project.id === state.selectedId)) {
      state.selectedId = state.projects[0]?.id || "";
    }
    renderProjectSelect();
    renderNav();
    wireEvents();
    render();
    await Promise.all(state.projects.map(syncProject));
    render();
  } catch (error) {
    app.innerHTML = `<section class="empty-card"><h3>Workspace could not load</h3><p>${esc(error.message)}</p></section>`;
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
}

boot();
