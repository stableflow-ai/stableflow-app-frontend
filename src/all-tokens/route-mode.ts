import { matchPath, useLocation } from "react-router-dom";
import { useHistoryStore, type HistoryMode } from "@/stores/use-history";

export const MODE_ROUTES: Record<HistoryMode, { bridge: string; history: string }> = {
  stablecoin: { bridge: "/", history: "/history" },
  allTokens: { bridge: "/all-tokens", history: "/all-tokens/history" },
};

type HistoryRouter = {
  state: { location: { pathname: string } };
  subscribe: (fn: (state: { location: { pathname: string } }) => void) => () => void;
};

function normalizePathname(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.replace(/\/+$/, "");
  }
  return pathname;
}

function matches(pattern: string, pathname: string) {
  return matchPath(
    { path: pattern, end: true, caseSensitive: false },
    normalizePathname(pathname),
  ) !== null;
}

export function getRouteMode(pathname: string): HistoryMode {
  return matchPath(
    { path: "/all-tokens", end: false, caseSensitive: false },
    normalizePathname(pathname),
  )
    ? "allTokens"
    : "stablecoin";
}

export function isBridgePath(pathname: string) {
  return matches("/", pathname) || matches("/all-tokens", pathname);
}

export function isHistoryPath(pathname: string) {
  return matches("/history", pathname) || matches("/all-tokens/history", pathname);
}

export function useRouteMode(): HistoryMode {
  return getRouteMode(useLocation().pathname);
}

export function useIsAllTokens() {
  return useRouteMode() === "allTokens";
}

export function bindHistoryModeToRouter(router: HistoryRouter) {
  const activate = (pathname: string) => {
    useHistoryStore.getState().activate(getRouteMode(pathname));
  };
  activate(router.state.location.pathname);
  router.subscribe((state) => {
    activate(state.location.pathname);
  });
}
