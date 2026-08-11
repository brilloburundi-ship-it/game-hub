export const PLAN_DEFINITIONS = Object.freeze({
  founder: {
    id: "founder",
    label: "Founder",
    projectLimit: null,
    privateProjects: true,
    publish: true,
    liveBridge: true,
    price: 0,
    internalOnly: true
  },
  free: {
    id: "free",
    label: "Free",
    projectLimit: 1,
    privateProjects: true,
    publish: true,
    liveBridge: false,
    price: 0,
    internalOnly: false
  },
  creator: {
    id: "creator",
    label: "Creator",
    projectLimit: 10,
    privateProjects: true,
    publish: true,
    liveBridge: true,
    internalOnly: false
  },
  pro: {
    id: "pro",
    label: "Pro",
    projectLimit: null,
    privateProjects: true,
    publish: true,
    liveBridge: true,
    internalOnly: false
  }
});

export function founderLogins(env) {
  return new Set(
    String(env.FOUNDER_GITHUB_LOGINS || "brilloburundi-ship-it")
      .split(",")
      .map(value => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function initialPlanForGitHubLogin(login, env) {
  return founderLogins(env).has(String(login || "").toLowerCase()) ? "founder" : "free";
}

export function isLockedFreePlan(planId) {
  return planId === "founder";
}
