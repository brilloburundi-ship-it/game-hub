const KEYS = {
  token: "game-hub.github-token",
  selected: "game-hub.selected-project",
  chats: "game-hub.chats"
};

export const state = {
  projects: [],
  selectedId: localStorage.getItem(KEYS.selected) || "neon-orbit",
  activeView: "projects",
  projectData: new Map(),
  files: [],
  selectedFile: null,
  chats: JSON.parse(localStorage.getItem(KEYS.chats) || "{}"),
  token: sessionStorage.getItem(KEYS.token) || ""
};

export function selectedProject() {
  return state.projects.find(project => project.id === state.selectedId) || state.projects[0];
}

export function selectProject(id) {
  state.selectedId = id;
  localStorage.setItem(KEYS.selected, id);
}

export function setToken(token) {
  state.token = token.trim();
  if (state.token) sessionStorage.setItem(KEYS.token, state.token);
  else sessionStorage.removeItem(KEYS.token);
}

export function messagesFor(projectId) {
  return state.chats[projectId] || [];
}

export function addMessage(projectId, message) {
  state.chats[projectId] = [...messagesFor(projectId), message].slice(-50);
  localStorage.setItem(KEYS.chats, JSON.stringify(state.chats));
}

export function clearMessages(projectId) {
  state.chats[projectId] = [];
  localStorage.setItem(KEYS.chats, JSON.stringify(state.chats));
}
