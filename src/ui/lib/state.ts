export type ViewName =
  | 'websets-list'
  | 'webset-dashboard'
  | 'items-table'
  | 'operations-guide'
  | 'create-webset'
  | 'add-search'
  | 'add-enrichment'
  | 'set-monitor';

export interface ViewEntry {
  name: ViewName;
  params: Record<string, unknown>;
}

export interface ToastData {
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface AppState {
  currentView: ViewEntry;
  history: ViewEntry[];
  toast: ToastData | null;
  loading: boolean;
  cachedUpdate: { type: string; data: unknown } | null;
}

const MAX_HISTORY = 20;

export function createAppState(): AppState {
  return {
    currentView: { name: 'websets-list', params: {} },
    history: [],
    toast: null,
    loading: false,
    cachedUpdate: null,
  };
}

export function navigate(
  state: AppState,
  name: ViewName,
  params: Record<string, unknown> = {},
): void {
  state.history.push({ ...state.currentView });
  if (state.history.length > MAX_HISTORY) {
    state.history.shift();
  }
  state.currentView = { name, params };
  state.cachedUpdate = null;
}

export function goBack(state: AppState): void {
  const prev = state.history.pop();
  if (prev) {
    state.currentView = prev;
    state.cachedUpdate = null;
  }
}

export function showToast(
  state: AppState,
  message: string,
  type: ToastData['type'] = 'info',
): void {
  state.toast = { message, type };
}

export function clearToast(state: AppState): void {
  state.toast = null;
}

export function isFormView(name: ViewName): boolean {
  return (
    name === 'create-webset' ||
    name === 'add-search' ||
    name === 'add-enrichment' ||
    name === 'set-monitor'
  );
}
