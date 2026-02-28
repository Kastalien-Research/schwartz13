import type { App } from '@modelcontextprotocol/ext-apps';
import { escapeHtml } from '../lib/forms.js';

interface WebsetSummary {
  id?: string;
  status?: string;
  title?: string | null;
  entityType?: string | null;
  searches?: Array<{
    progress?: { found?: number } | null;
  }> | null;
}

interface WebsetsListData {
  data: WebsetSummary[];
  count?: number;
  truncated?: boolean;
}

export interface WebsetsListCallbacks {
  onViewWebset: (websetId: string) => void;
  onCreateNew: () => void;
}

const ENTITY_CLASS_MAP: Record<string, string> = {
  company: 'entity-company',
  person: 'entity-person',
  research_paper: 'entity-paper',
  paper: 'entity-paper',
  article: 'entity-article',
  custom: 'entity-custom',
};

function entityBadgeClass(type: string): string {
  return ENTITY_CLASS_MAP[type.toLowerCase()] ?? 'entity-default';
}

function statusClass(status: string): string {
  const s = (status ?? '').toLowerCase();
  if (s === 'idle' || s === 'completed') return 'status-idle';
  if (s === 'searching' || s === 'running') return 'status-searching';
  if (s === 'enriching') return 'status-enriching';
  if (s === 'monitoring') return 'status-monitoring';
  if (s === 'canceled' || s === 'cancelled' || s === 'failed')
    return 'status-canceled';
  return 'status-idle';
}

export function renderWebsetsList(
  root: HTMLElement,
  payload: WebsetsListData,
  app: App,
  callbacks: WebsetsListCallbacks,
): void {
  const websetsList = payload.data ?? [];
  const container = document.createElement('div');

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  const title = document.createElement('div');
  title.className = 'dashboard-title';
  title.textContent = 'Collections';
  toolbar.appendChild(title);

  const spacer = document.createElement('div');
  spacer.className = 'toolbar-spacer';
  toolbar.appendChild(spacer);

  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'btn';
  refreshBtn.textContent = 'Refresh';
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing\u2026';
    try {
      const result = await app.callServerTool({
        name: 'poll_collections',
        arguments: {},
      });
      if (
        result.structuredContent &&
        (result.structuredContent as any).type === 'websets-list'
      ) {
        root.innerHTML = '';
        renderWebsetsList(
          root,
          (result.structuredContent as any).data,
          app,
          callbacks,
        );
        return;
      }
    } catch {
      // Keep existing view
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Refresh';
    }
  });
  toolbar.appendChild(refreshBtn);

  const createBtn = document.createElement('button');
  createBtn.className = 'btn-primary';
  createBtn.textContent = 'New Collection';
  createBtn.addEventListener('click', () => callbacks.onCreateNew());
  toolbar.appendChild(createBtn);

  container.appendChild(toolbar);

  // Empty state
  if (websetsList.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No collections yet. Create one to get started.';
    container.appendChild(empty);
    root.appendChild(container);
    return;
  }

  // Cards list
  const list = document.createElement('div');
  list.className = 'card-list';

  for (const ws of websetsList) {
    const card = document.createElement('div');
    card.className = 'card card-clickable';
    card.addEventListener('click', () => {
      if (ws.id) callbacks.onViewWebset(ws.id);
    });

    const row = document.createElement('div');
    row.className = 'card-row';

    const left = document.createElement('div');

    const cardTitle = document.createElement('div');
    cardTitle.className = 'card-title';
    cardTitle.textContent = ws.title ?? 'Untitled';
    left.appendChild(cardTitle);

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    const parts: string[] = [];
    if (ws.id) parts.push(ws.id);
    const found = (ws.searches ?? []).reduce(
      (sum, s) => sum + (s.progress?.found ?? 0),
      0,
    );
    if (found > 0) parts.push(`${found} items`);
    meta.textContent = parts.join(' \u00B7 ');
    left.appendChild(meta);
    row.appendChild(left);

    const badges = document.createElement('div');
    badges.style.display = 'flex';
    badges.style.gap = '6px';
    badges.style.alignItems = 'center';

    if (ws.entityType) {
      const etype = document.createElement('span');
      etype.className = `entity-badge ${entityBadgeClass(ws.entityType)}`;
      etype.textContent = ws.entityType;
      badges.appendChild(etype);
    }

    if (ws.status) {
      const badge = document.createElement('span');
      badge.className = `status-badge ${statusClass(ws.status)}`;
      badge.textContent = ws.status;
      badges.appendChild(badge);
    }

    row.appendChild(badges);
    card.appendChild(row);
    list.appendChild(card);
  }

  container.appendChild(list);

  if (payload.truncated) {
    const note = document.createElement('div');
    note.style.marginTop = '8px';
    note.style.fontSize = '11px';
    note.style.color = 'var(--text-muted)';
    note.textContent = `Showing ${websetsList.length} of more. Increase maxItems to see all.`;
    container.appendChild(note);
  }

  root.appendChild(container);
}
