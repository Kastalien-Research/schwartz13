import type { App } from '@modelcontextprotocol/ext-apps';

interface ItemData {
  id?: string;
  name?: string;
  url?: string;
  entityType?: string;
  description?: string;
  evaluations?: Record<string, unknown>[];
  enrichments?: Record<string, unknown>[];
}

interface ItemsPayload {
  data: ItemData[];
  total?: number;
  included?: number;
  excluded?: number;
  truncated?: boolean;
  websetId?: string;
}

export interface ItemsTableCallbacks {
  onBack?: () => void;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

type SortDir = 'asc' | 'desc';
type SortKey = 'name' | 'url' | 'entityType';

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

export function renderItemsTable(
  root: HTMLElement,
  payload: ItemsPayload,
  app: App,
  callbacks?: ItemsTableCallbacks,
): void {
  const items = payload.data ?? [];
  let sortKey: SortKey = 'name';
  let sortDir: SortDir = 'asc';
  let filterText = '';

  const container = document.createElement('div');

  // Nav bar (when back callback provided)
  if (callbacks?.onBack) {
    const nav = document.createElement('div');
    nav.className = 'nav-bar';
    const backBtn = document.createElement('button');
    backBtn.className = 'btn-back';
    backBtn.textContent = '\u2190';
    backBtn.addEventListener('click', () => callbacks.onBack!());
    nav.appendChild(backBtn);
    const breadcrumb = document.createElement('span');
    breadcrumb.className = 'nav-breadcrumb';
    breadcrumb.textContent = 'Items';
    nav.appendChild(breadcrumb);
    container.appendChild(nav);
  }

  // Summary bar
  const summary = document.createElement('div');
  summary.className = 'items-summary';
  const total = payload.total ?? items.length;
  const included = payload.included ?? items.length;
  const excluded = payload.excluded ?? 0;
  summary.innerHTML =
    `<div>Total: <span>${total}</span></div>` +
    `<div>Included: <span>${included}</span></div>` +
    `<div>Excluded: <span>${excluded}</span></div>` +
    (payload.truncated ? '<div style="color:var(--text-muted)">(truncated)</div>' : '');
  container.appendChild(summary);

  // Toolbar: refresh + filter
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'btn';
  refreshBtn.textContent = 'Refresh';
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing\u2026';
    try {
      if (payload.websetId) {
        const result = await app.callServerTool({
          name: 'poll_items',
          arguments: { websetId: payload.websetId },
        });
        if (
          result.structuredContent &&
          (result.structuredContent as any).type === 'items-table'
        ) {
          root.innerHTML = '';
          renderItemsTable(
            root,
            (result.structuredContent as any).data,
            app,
            callbacks,
          );
          return;
        }
      }
    } catch {
      // Keep existing view on error
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Refresh';
    }
  });
  toolbar.appendChild(refreshBtn);

  const spacer = document.createElement('div');
  spacer.className = 'toolbar-spacer';
  toolbar.appendChild(spacer);

  const filter = document.createElement('input');
  filter.type = 'text';
  filter.className = 'search-bar';
  filter.placeholder = 'Filter items\u2026';
  filter.style.marginBottom = '0';
  filter.style.maxWidth = '240px';
  toolbar.appendChild(filter);

  container.appendChild(toolbar);

  // Table wrapper
  const tableWrap = document.createElement('div');
  container.appendChild(tableWrap);

  function getSorted(): ItemData[] {
    const filtered = filterText
      ? items.filter((item) => {
          const q = filterText.toLowerCase();
          return (
            (item.name ?? '').toLowerCase().includes(q) ||
            (item.url ?? '').toLowerCase().includes(q) ||
            (item.entityType ?? '').toLowerCase().includes(q)
          );
        })
      : [...items];

    filtered.sort((a, b) => {
      const aVal = (a[sortKey] ?? '').toLowerCase();
      const bVal = (b[sortKey] ?? '').toLowerCase();
      const cmp = aVal.localeCompare(bVal);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return filtered;
  }

  function sortIcon(key: SortKey): string {
    if (sortKey !== key) return '';
    return `<span class="sort-icon">${sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>`;
  }

  function renderTable(): void {
    const sorted = getSorted();
    const table = document.createElement('table');
    table.className = 'items-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const columns: { key: SortKey; label: string }[] = [
      { key: 'name', label: 'Name' },
      { key: 'url', label: 'URL' },
      { key: 'entityType', label: 'Type' },
    ];

    for (const col of columns) {
      const th = document.createElement('th');
      th.innerHTML = `${col.label}${sortIcon(col.key)}`;
      th.addEventListener('click', () => {
        if (sortKey === col.key) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortKey = col.key;
          sortDir = 'asc';
        }
        renderTable();
      });
      headerRow.appendChild(th);
    }

    const evalTh = document.createElement('th');
    evalTh.textContent = 'Evals';
    evalTh.style.textAlign = 'center';
    evalTh.style.cursor = 'default';
    headerRow.appendChild(evalTh);

    const enrichTh = document.createElement('th');
    enrichTh.textContent = 'Enrich';
    enrichTh.style.textAlign = 'center';
    enrichTh.style.cursor = 'default';
    headerRow.appendChild(enrichTh);

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    if (sorted.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'empty-state';
      td.textContent = filterText
        ? 'No items match your filter.'
        : 'No items yet.';
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    for (const item of sorted) {
      const tr = document.createElement('tr');

      // Name
      const nameTd = document.createElement('td');
      nameTd.textContent = item.name ?? '\u2014';
      tr.appendChild(nameTd);

      // URL
      const urlTd = document.createElement('td');
      urlTd.className = 'cell-url';
      if (item.url) {
        urlTd.innerHTML =
          `<a href="${escapeHtml(item.url)}" title="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(truncateUrl(item.url))}</a>`;
      } else {
        urlTd.textContent = '\u2014';
      }
      tr.appendChild(urlTd);

      // Entity type badge
      const typeTd = document.createElement('td');
      if (item.entityType) {
        const badge = document.createElement('span');
        badge.className = `entity-badge ${entityBadgeClass(item.entityType)}`;
        badge.textContent = item.entityType;
        typeTd.appendChild(badge);
      } else {
        typeTd.textContent = '\u2014';
      }
      tr.appendChild(typeTd);

      // Evaluations count chip
      const evalTd = document.createElement('td');
      evalTd.className = 'cell-counts';
      const evalCount = item.evaluations?.length ?? 0;
      const evalChip = document.createElement('span');
      evalChip.className = `count-chip${evalCount > 0 ? ' has-data' : ''}`;
      evalChip.textContent = String(evalCount);
      evalTd.appendChild(evalChip);
      tr.appendChild(evalTd);

      // Enrichments count chip
      const enrichTd = document.createElement('td');
      enrichTd.className = 'cell-counts';
      const enrichCount = item.enrichments?.length ?? 0;
      const enrichChip = document.createElement('span');
      enrichChip.className = `count-chip${enrichCount > 0 ? ' has-data' : ''}`;
      enrichChip.textContent = String(enrichCount);
      enrichTd.appendChild(enrichChip);
      tr.appendChild(enrichTd);

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    tableWrap.innerHTML = '';
    tableWrap.appendChild(table);
  }

  filter.addEventListener('input', () => {
    filterText = filter.value;
    renderTable();
  });

  renderTable();
  root.appendChild(container);
}

function truncateUrl(url: string): string {
  try {
    const u = new URL(url);
    const path =
      u.pathname.length > 30
        ? u.pathname.slice(0, 27) + '\u2026'
        : u.pathname;
    return u.hostname + path;
  } catch {
    return url.length > 50 ? url.slice(0, 47) + '\u2026' : url;
  }
}
