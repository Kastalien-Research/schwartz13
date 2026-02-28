import type { App } from '@modelcontextprotocol/ext-apps';
import { callTask } from '../lib/api.js';

interface SearchProgress {
  found?: number;
  completion?: number;
  timeLeft?: number;
}

interface SearchData {
  id?: string;
  status?: string;
  query?: string;
  progress?: SearchProgress | null;
}

interface EnrichmentData {
  id?: string;
  status?: string;
  description?: string;
  format?: string;
}

interface MonitorData {
  id?: string;
  status?: string;
  nextRunAt?: string | null;
}

interface ImportData {
  id?: string;
  status?: string;
  count?: number | null;
}

interface WebsetData {
  id?: string;
  status?: string;
  title?: string | null;
  entityType?: string | null;
  metadata?: Record<string, string> | null;
  searches?: SearchData[] | null;
  enrichments?: EnrichmentData[] | null;
  monitors?: MonitorData[] | null;
  imports?: ImportData[] | null;
}

export interface DashboardCallbacks {
  onViewItems: (websetId: string) => void;
  onAddSearch: (websetId: string) => void;
  onAddEnrichment: (websetId: string) => void;
  onSetMonitor: (websetId: string) => void;
  onBack: () => void;
  onDeleted: () => void;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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

function formatCompletion(pct: number | undefined): string {
  if (pct == null) return '';
  return `${Math.round(pct * 100)}%`;
}

function formatTimeLeft(seconds: number | undefined): string {
  if (seconds == null) return '';
  if (seconds < 60) return `${seconds}s left`;
  return `~${Math.round(seconds / 60)}m left`;
}

function isActive(status: string | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === 'searching' || s === 'enriching' || s === 'running';
}

export function renderWebsetDashboard(
  root: HTMLElement,
  data: WebsetData,
  app?: App,
  callbacks?: DashboardCallbacks,
): void {
  const container = document.createElement('div');

  // Nav bar (when callbacks provided)
  if (callbacks) {
    const nav = document.createElement('div');
    nav.className = 'nav-bar';
    const backBtn = document.createElement('button');
    backBtn.className = 'btn-back';
    backBtn.textContent = '\u2190';
    backBtn.addEventListener('click', () => callbacks.onBack());
    nav.appendChild(backBtn);
    const breadcrumb = document.createElement('span');
    breadcrumb.className = 'nav-breadcrumb';
    breadcrumb.textContent = data.title ?? 'Collection';
    nav.appendChild(breadcrumb);
    container.appendChild(nav);
  }

  // Header
  const header = document.createElement('div');
  header.className = 'dashboard-header';

  const title = document.createElement('div');
  title.className = 'dashboard-title';
  title.textContent = data.title ?? 'Webset';
  header.appendChild(title);

  if (data.status) {
    const badge = document.createElement('span');
    badge.className = `status-badge ${statusClass(data.status)}`;
    badge.textContent = data.status;
    header.appendChild(badge);
  }

  if (data.entityType) {
    const etype = document.createElement('span');
    const cls = entityBadgeClass(data.entityType);
    etype.className = `entity-badge ${cls}`;
    etype.textContent = data.entityType;
    header.appendChild(etype);
  }

  if (data.id) {
    const idSpan = document.createElement('span');
    idSpan.className = 'dashboard-id';
    idSpan.textContent = data.id;
    header.appendChild(idSpan);
  }

  container.appendChild(header);

  // Action bar (when interactive)
  if (callbacks && app && data.id) {
    const actionBar = document.createElement('div');
    actionBar.className = 'action-bar';
    const websetId = data.id;

    const viewItemsBtn = document.createElement('button');
    viewItemsBtn.className = 'btn';
    viewItemsBtn.textContent = 'View Items';
    viewItemsBtn.addEventListener('click', () =>
      callbacks.onViewItems(websetId),
    );
    actionBar.appendChild(viewItemsBtn);

    const addSearchBtn = document.createElement('button');
    addSearchBtn.className = 'btn';
    addSearchBtn.textContent = 'Add Search';
    addSearchBtn.addEventListener('click', () =>
      callbacks.onAddSearch(websetId),
    );
    actionBar.appendChild(addSearchBtn);

    const addEnrichBtn = document.createElement('button');
    addEnrichBtn.className = 'btn';
    addEnrichBtn.textContent = 'Add Enrichment';
    addEnrichBtn.addEventListener('click', () =>
      callbacks.onAddEnrichment(websetId),
    );
    actionBar.appendChild(addEnrichBtn);

    const setMonitorBtn = document.createElement('button');
    setMonitorBtn.className = 'btn';
    setMonitorBtn.textContent = 'Set Monitor';
    setMonitorBtn.addEventListener('click', () =>
      callbacks.onSetMonitor(websetId),
    );
    actionBar.appendChild(setMonitorBtn);

    // Refresh
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'btn';
    refreshBtn.textContent = 'Refresh';
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Refreshing\u2026';
      try {
        const result = await app.callServerTool({
          name: 'poll_collection',
          arguments: { websetId },
        });
        if (
          result.structuredContent &&
          (result.structuredContent as any).type === 'webset-dashboard'
        ) {
          root.innerHTML = '';
          renderWebsetDashboard(
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
    actionBar.appendChild(refreshBtn);

    // Cancel (only when active)
    if (isActive(data.status)) {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn-danger';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', async () => {
        cancelBtn.disabled = true;
        cancelBtn.textContent = 'Canceling\u2026';
        const result = await callTask(app, 'manage_collection', {
          websetId,
          action: 'cancel',
        });
        cancelBtn.disabled = false;
        cancelBtn.textContent = 'Cancel';
        if (!result.isError) {
          root.innerHTML = '';
          renderWebsetDashboard(
            root,
            result.data as WebsetData,
            app,
            callbacks,
          );
        }
      });
      actionBar.appendChild(cancelBtn);
    }

    // Delete (with confirmation)
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      // Replace delete button with confirm dialog
      const confirm = document.createElement('div');
      confirm.className = 'confirm-dialog';
      confirm.textContent = 'Delete this collection? ';

      const yesBtn = document.createElement('button');
      yesBtn.className = 'btn-danger';
      yesBtn.textContent = 'Yes, delete';
      yesBtn.style.fontSize = '11px';
      yesBtn.style.padding = '3px 8px';
      yesBtn.addEventListener('click', async () => {
        yesBtn.disabled = true;
        yesBtn.textContent = 'Deleting\u2026';
        const result = await callTask(app, 'manage_collection', {
          websetId,
          action: 'delete',
        });
        if (!result.isError) {
          callbacks.onDeleted();
        } else {
          confirm.replaceWith(deleteBtn);
        }
      });
      confirm.appendChild(yesBtn);

      const noBtn = document.createElement('button');
      noBtn.className = 'btn';
      noBtn.textContent = 'No';
      noBtn.style.fontSize = '11px';
      noBtn.style.padding = '3px 8px';
      noBtn.addEventListener('click', () => {
        confirm.replaceWith(deleteBtn);
      });
      confirm.appendChild(noBtn);

      deleteBtn.replaceWith(confirm);
    });
    actionBar.appendChild(deleteBtn);

    container.appendChild(actionBar);
  }

  // Stats
  const searchesList = data.searches ?? [];
  const enrichmentsList = data.enrichments ?? [];
  const monitorsList = data.monitors ?? [];
  const importsList = data.imports ?? [];

  const totalFound = searchesList.reduce(
    (sum, s) => sum + (s.progress?.found ?? 0),
    0,
  );

  const statsSection = document.createElement('div');
  statsSection.className = 'stat-row';
  statsSection.innerHTML =
    makeStat(String(totalFound), 'Items Found') +
    makeStat(String(searchesList.length), 'Searches') +
    makeStat(String(enrichmentsList.length), 'Enrichments') +
    makeStat(String(monitorsList.length), 'Monitors');
  container.appendChild(statsSection);

  // Searches
  if (searchesList.length > 0) {
    const section = createSection('Searches');
    const list = section.querySelector('.card-list')!;

    for (const s of searchesList) {
      const card = document.createElement('div');
      card.className = 'card';

      const row = document.createElement('div');
      row.className = 'card-row';

      const left = document.createElement('div');
      const cardTitle = document.createElement('div');
      cardTitle.className = 'card-title';
      cardTitle.textContent = s.query ?? '(no query)';
      left.appendChild(cardTitle);

      const meta = document.createElement('div');
      meta.className = 'card-meta';
      const parts: string[] = [];
      if (s.progress?.found != null) parts.push(`${s.progress.found} found`);
      const completion = formatCompletion(s.progress?.completion);
      if (completion) parts.push(completion);
      const timeLeft = formatTimeLeft(s.progress?.timeLeft);
      if (timeLeft) parts.push(timeLeft);
      meta.textContent = parts.join(' \u00B7 ');
      left.appendChild(meta);
      row.appendChild(left);

      if (s.status) {
        const badge = document.createElement('span');
        badge.className = `status-badge ${statusClass(s.status)}`;
        badge.textContent = s.status;
        row.appendChild(badge);
      }

      card.appendChild(row);

      if (s.progress?.completion != null && s.progress.completion < 1) {
        const bar = document.createElement('div');
        bar.className = 'progress-bar';
        const fill = document.createElement('div');
        fill.className = 'progress-fill';
        fill.style.width =
          `${Math.min(Math.round(s.progress.completion * 100), 100)}%`;
        bar.appendChild(fill);
        card.appendChild(bar);
      }

      list.appendChild(card);
    }

    container.appendChild(section);
  }

  // Enrichments
  if (enrichmentsList.length > 0) {
    const section = createSection('Enrichments');
    const list = section.querySelector('.card-list')!;

    for (const e of enrichmentsList) {
      const card = document.createElement('div');
      card.className = 'card';

      const row = document.createElement('div');
      row.className = 'card-row';

      const left = document.createElement('div');
      const desc = document.createElement('div');
      desc.className = 'card-title';
      desc.textContent = e.description ?? '(no description)';
      left.appendChild(desc);

      if (e.format) {
        const fmt = document.createElement('div');
        fmt.className = 'card-meta';
        fmt.textContent = e.format;
        left.appendChild(fmt);
      }
      row.appendChild(left);

      if (e.status) {
        const badge = document.createElement('span');
        badge.className = `status-badge ${statusClass(e.status)}`;
        badge.textContent = e.status;
        row.appendChild(badge);
      }

      card.appendChild(row);
      list.appendChild(card);
    }

    container.appendChild(section);
  }

  // Monitors
  if (monitorsList.length > 0) {
    const section = createSection('Monitors');
    const list = section.querySelector('.card-list')!;

    for (const m of monitorsList) {
      const card = document.createElement('div');
      card.className = 'card';

      const row = document.createElement('div');
      row.className = 'card-row';

      const left = document.createElement('div');
      if (m.nextRunAt) {
        const next = document.createElement('div');
        next.className = 'card-meta';
        next.textContent = `Next run: ${m.nextRunAt}`;
        left.appendChild(next);
      }
      if (m.id) {
        const idEl = document.createElement('div');
        idEl.className = 'card-meta-mono';
        idEl.textContent = m.id;
        left.appendChild(idEl);
      }
      row.appendChild(left);

      if (m.status) {
        const badge = document.createElement('span');
        badge.className = `status-badge ${statusClass(m.status)}`;
        badge.textContent = m.status;
        row.appendChild(badge);
      }

      card.appendChild(row);
      list.appendChild(card);
    }

    container.appendChild(section);
  }

  // Imports
  if (importsList.length > 0) {
    const section = createSection('Imports');
    const list = section.querySelector('.card-list')!;

    for (const imp of importsList) {
      const card = document.createElement('div');
      card.className = 'card';

      const row = document.createElement('div');
      row.className = 'card-row';

      const left = document.createElement('div');
      const info = document.createElement('div');
      info.className = 'card-meta';
      const parts: string[] = [];
      if (imp.id) parts.push(imp.id);
      if (imp.count != null) parts.push(`${imp.count} items`);
      info.textContent = parts.join(' \u00B7 ');
      left.appendChild(info);
      row.appendChild(left);

      if (imp.status) {
        const badge = document.createElement('span');
        badge.className = `status-badge ${statusClass(imp.status)}`;
        badge.textContent = imp.status;
        row.appendChild(badge);
      }

      card.appendChild(row);
      list.appendChild(card);
    }

    container.appendChild(section);
  }

  // Metadata
  if (data.metadata && Object.keys(data.metadata).length > 0) {
    const section = createSection('Metadata');
    const list = section.querySelector('.card-list')!;
    const card = document.createElement('div');
    card.className = 'card';
    card.style.fontFamily = 'var(--font-mono)';
    card.style.fontSize = '11px';

    for (const [key, value] of Object.entries(data.metadata)) {
      const line = document.createElement('div');
      line.style.lineHeight = '1.6';
      line.innerHTML =
        `<span style="color:var(--text-muted)">${escapeHtml(key)}:</span> ${escapeHtml(String(value))}`;
      card.appendChild(line);
    }

    list.appendChild(card);
    container.appendChild(section);
  }

  root.appendChild(container);
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

function createSection(title: string): HTMLElement {
  const section = document.createElement('div');
  section.className = 'dashboard-section';

  const heading = document.createElement('h3');
  heading.textContent = title;
  section.appendChild(heading);

  const body = document.createElement('div');
  body.className = 'card-list';
  section.appendChild(body);

  return section;
}

function makeStat(value: string, label: string): string {
  return (
    `<div class="stat">` +
    `<div class="stat-value">${escapeHtml(value)}</div>` +
    `<div class="stat-label">${escapeHtml(label)}</div>` +
    `</div>`
  );
}
