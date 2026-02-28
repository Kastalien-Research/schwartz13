import {
  App,
  PostMessageTransport,
  applyDocumentTheme,
  applyHostStyleVariables,
  applyHostFonts,
} from '@modelcontextprotocol/ext-apps';
import {
  type AppState,
  createAppState,
  navigate,
  goBack,
  showToast,
  clearToast,
  isFormView,
} from './lib/state.js';
import { renderOperationsGuide } from './views/operations-guide.js';
import { renderItemsTable } from './views/items-table.js';
import { renderWebsetDashboard } from './views/webset-dashboard.js';
import { renderWebsetsList } from './views/websets-list.js';
import { renderCreateWebset } from './views/create-webset.js';
import { renderAddSearch } from './views/add-search.js';
import { renderAddEnrichment } from './views/add-enrichment.js';
import { renderSetMonitor } from './views/set-monitor.js';

const root = document.getElementById('app')!;
const app = new App({ name: 'schwartz13', version: '1.0.0' });
const state: AppState = createAppState();

// Toast rendering
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function renderToast(): void {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  if (!state.toast) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${state.toast.type}`;
  toast.textContent = state.toast.message;
  document.body.appendChild(toast);

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => {
      toast.remove();
      clearToast(state);
    }, 200);
  }, 3000);
}

// Main render dispatcher
function render(): void {
  root.innerHTML = '';
  const { name, params } = state.currentView;

  switch (name) {
    case 'websets-list':
      renderWebsetsList(root, (params.data ?? { data: [] }) as any, app, {
        onViewWebset(websetId) {
          navigateToView('webset-dashboard', { websetId });
        },
        onCreateNew() {
          navigateToView('create-webset', {});
        },
      });
      break;

    case 'webset-dashboard':
      renderWebsetDashboard(
        root,
        (params.data ?? params) as any,
        app,
        {
          onViewItems(websetId) {
            navigateToView('items-table', { websetId });
          },
          onAddSearch(websetId) {
            navigateToView('add-search', { websetId });
          },
          onAddEnrichment(websetId) {
            navigateToView('add-enrichment', { websetId });
          },
          onSetMonitor(websetId) {
            navigateToView('set-monitor', { websetId });
          },
          onBack() {
            goBack(state);
            render();
          },
          onDeleted() {
            // Navigate back to list
            navigate(state, 'websets-list', {});
            loadInitialView();
          },
        },
      );
      break;

    case 'items-table':
      renderItemsTable(
        root,
        (params.data ?? { data: [], websetId: params.websetId }) as any,
        app,
        {
          onBack() {
            goBack(state);
            render();
          },
        },
      );
      break;

    case 'operations-guide':
      renderOperationsGuide(root, (params.data ?? {}) as any);
      break;

    case 'create-webset':
      renderCreateWebset(root, app, {
        onCreated(websetId, data) {
          showToast(state, 'Collection created', 'success');
          renderToast();
          navigate(state, 'webset-dashboard', {
            websetId,
            data,
          });
          render();
        },
        onCancel() {
          goBack(state);
          render();
        },
      });
      break;

    case 'add-search':
      renderAddSearch(
        root,
        { websetId: params.websetId as string },
        app,
        {
          onSuccess(data) {
            showToast(state, 'Search added', 'success');
            renderToast();
            navigate(state, 'webset-dashboard', {
              websetId: params.websetId,
              data,
            });
            render();
          },
          onCancel() {
            goBack(state);
            render();
          },
        },
      );
      break;

    case 'add-enrichment':
      renderAddEnrichment(
        root,
        { websetId: params.websetId as string },
        app,
        {
          onSuccess(data) {
            showToast(state, 'Enrichment added', 'success');
            renderToast();
            navigate(state, 'webset-dashboard', {
              websetId: params.websetId,
              data,
            });
            render();
          },
          onCancel() {
            goBack(state);
            render();
          },
        },
      );
      break;

    case 'set-monitor':
      renderSetMonitor(
        root,
        { websetId: params.websetId as string },
        app,
        {
          onSuccess(data) {
            showToast(state, 'Monitor set', 'success');
            renderToast();
            navigate(state, 'webset-dashboard', {
              websetId: params.websetId,
              data,
            });
            render();
          },
          onCancel() {
            goBack(state);
            render();
          },
        },
      );
      break;

    default:
      root.innerHTML = `<div class="empty-state">Unknown view: ${name}</div>`;
  }
}

// Navigate to a view, loading data if needed
async function navigateToView(
  viewName: AppState['currentView']['name'],
  params: Record<string, unknown>,
): Promise<void> {
  navigate(state, viewName, params);

  // Views that need initial data loaded
  if (viewName === 'webset-dashboard' && params.websetId && !params.data) {
    root.innerHTML = '<div class="loading">Loading\u2026</div>';
    try {
      const result = await app.callServerTool({
        name: 'poll_collection',
        arguments: { websetId: params.websetId },
      });
      if (result.structuredContent) {
        state.currentView.params.data =
          (result.structuredContent as any).data;
      }
    } catch {
      // Render with whatever we have
    }
  }

  if (viewName === 'items-table' && params.websetId && !params.data) {
    root.innerHTML = '<div class="loading">Loading\u2026</div>';
    try {
      const result = await app.callServerTool({
        name: 'poll_items',
        arguments: { websetId: params.websetId },
      });
      if (result.structuredContent) {
        state.currentView.params.data =
          (result.structuredContent as any).data;
      }
    } catch {
      // Render with whatever we have
    }
  }

  render();
}

// Load the initial websets list
async function loadInitialView(): Promise<void> {
  root.innerHTML = '<div class="loading">Loading collections\u2026</div>';
  try {
    const result = await app.callServerTool({
      name: 'poll_collections',
      arguments: {},
    });
    if (result.structuredContent) {
      state.currentView.params.data =
        (result.structuredContent as any).data;
    }
  } catch {
    // Render empty list
    state.currentView.params.data = { data: [] };
  }
  render();
}

// Event handlers
type ViewData = { type: string; data: unknown };

app.ontoolinput = () => {
  // Show subtle loading indicator without destroying current view
  if (!isFormView(state.currentView.name)) {
    root.innerHTML = '<div class="loading">Loading\u2026</div>';
  }
};

app.ontoolresult = (params) => {
  if (!params.structuredContent) {
    if (params.isError) {
      const text = params.content
        ?.filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n') ?? 'Unknown error';
      if (isFormView(state.currentView.name)) {
        showToast(state, text, 'error');
        renderToast();
      } else {
        root.innerHTML = `<div class="error-msg">${escapeHtml(text)}</div>`;
      }
    }
    return;
  }

  const structured = params.structuredContent as ViewData;

  // If user is in a form, cache the update and show toast
  if (isFormView(state.currentView.name)) {
    state.cachedUpdate = {
      type: structured.type,
      data: structured.data,
    };
    showToast(state, 'Collection updated by agent', 'info');
    renderToast();
    return;
  }

  // Map structured content type to view name and navigate
  switch (structured.type) {
    case 'websets-list':
      state.currentView = { name: 'websets-list', params: { data: structured.data } };
      render();
      break;
    case 'webset-dashboard':
      state.currentView = { name: 'webset-dashboard', params: { data: structured.data } };
      render();
      break;
    case 'items-table':
      state.currentView = { name: 'items-table', params: { data: structured.data } };
      render();
      break;
    case 'operations-guide':
      state.currentView = { name: 'operations-guide', params: { data: structured.data } };
      render();
      break;
    default:
      root.innerHTML = `<pre>${JSON.stringify(structured, null, 2)}</pre>`;
  }
};

app.onhostcontextchanged = (ctx) => {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  if (ctx.safeAreaInsets) {
    const { top, right, bottom, left } = ctx.safeAreaInsets;
    document.body.style.padding =
      `${top}px ${right}px ${bottom}px ${left}px`;
  }
};

// Connect and boot
app.connect(new PostMessageTransport());
loadInitialView();

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
