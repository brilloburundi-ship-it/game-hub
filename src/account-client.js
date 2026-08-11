const config = await fetch(`data/runtime-config.json?t=${Date.now()}`, { cache: "no-store" })
  .then(response => response.ok ? response.json() : null)
  .catch(() => null);

if (config?.apiBase) {
  const apiBase = String(config.apiBase).replace(/\/$/, "");
  const dialog = document.querySelector("#connection-dialog .sheet");
  const profileButton = document.querySelector("#profile-button");
  const tokenField = document.querySelector("#token-input")?.closest(".field");
  const legacyActions = document.querySelector("#connection-dialog .dialog-actions");

  const panel = document.createElement("section");
  panel.className = "production-account-panel";
  panel.innerHTML = `
    <div class="account-state"><span class="loader"></span><div><strong>Checking Game Hub account…</strong><small>Secure GitHub App authorization</small></div></div>
  `;
  const firstParagraph = dialog?.querySelector("p");
  if (dialog && firstParagraph) firstParagraph.insertAdjacentElement("afterend", panel);

  if (config.authMode === "github-app") {
    if (tokenField) tokenField.hidden = true;
    if (legacyActions) legacyActions.hidden = true;
  }

  async function api(path, options = {}) {
    return fetch(`${apiBase}${path}`, {
      ...options,
      credentials: "include",
      headers: { "content-type": "application/json", ...(options.headers || {}) }
    });
  }

  function connectUrl() {
    const clean = new URL(location.href);
    clean.searchParams.delete("auth");
    return `${apiBase}/auth/github/start?return_to=${encodeURIComponent(clean.toString())}`;
  }

  function renderSignedOut() {
    panel.innerHTML = `
      <div class="account-state"><span class="account-icon">GH</span><div><strong>Game Hub account</strong><small>Connect your GitHub account securely. No password or personal token is stored in the PWA.</small></div></div>
      <button class="primary-action full" type="button" id="production-connect">Connect GitHub</button>
    `;
    panel.querySelector("#production-connect")?.addEventListener("click", () => location.assign(connectUrl()));
    if (profileButton) {
      profileButton.textContent = "GH";
      profileButton.title = "Connect Game Hub account";
    }
  }

  function renderSignedIn(payload) {
    const plan = payload.plan || {};
    const user = payload.user || {};
    const workspace = payload.workspace || {};
    panel.innerHTML = `
      <div class="account-state">
        ${user.avatarUrl ? `<img class="account-avatar" src="${user.avatarUrl}" alt="" />` : `<span class="account-icon">${String(user.githubLogin || "GH").slice(0, 2).toUpperCase()}</span>`}
        <div><strong>${user.displayName || user.githubLogin || "Game Hub user"}</strong><small>@${user.githubLogin || "github"} · ${workspace.name || "Workspace"}</small></div>
      </div>
      <div class="plan-row"><span>Plan</span><strong>${plan.label || plan.id || "Free"}${plan.lockedFree ? " · free forever" : ""}</strong></div>
      <button class="ghost-button full" type="button" id="production-logout">Disconnect account</button>
    `;
    panel.querySelector("#production-logout")?.addEventListener("click", async () => {
      await api("/auth/logout", { method: "POST", body: "{}" });
      renderSignedOut();
    });
    if (profileButton) {
      profileButton.textContent = String(user.githubLogin || "GH").slice(0, 1).toUpperCase();
      profileButton.title = `${user.githubLogin || "Game Hub"} · ${plan.label || plan.id || "Free"}`;
    }
  }

  async function refreshAccount() {
    try {
      const response = await api("/api/me", { method: "GET", headers: {} });
      if (!response.ok) return renderSignedOut();
      renderSignedIn(await response.json());
    } catch {
      renderSignedOut();
    }
  }

  await refreshAccount();

  const current = new URL(location.href);
  if (current.searchParams.get("auth") === "connected") {
    current.searchParams.delete("auth");
    history.replaceState({}, "", current);
  }
}
