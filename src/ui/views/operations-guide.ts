interface SchemaField {
  name: string;
  type: string;
  required: boolean;
}

interface GroupedOperation {
  name: string;
  summary: string;
  fields: SchemaField[];
}

type OperationsData = Record<string, GroupedOperation[]>;

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function renderOperationsGuide(
  root: HTMLElement,
  data: OperationsData,
): void {
  const container = document.createElement('div');

  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'search-bar';
  search.placeholder = 'Search operations\u2026';
  container.appendChild(search);

  const groupsContainer = document.createElement('div');
  container.appendChild(groupsContainer);

  function renderGroups(filter: string): void {
    groupsContainer.innerHTML = '';
    const q = filter.toLowerCase();

    for (const [domain, ops] of Object.entries(data)) {
      const filtered = q
        ? ops.filter(
            (op) =>
              op.name.toLowerCase().includes(q) ||
              op.summary.toLowerCase().includes(q),
          )
        : ops;

      if (filtered.length === 0) continue;

      const group = document.createElement('div');
      group.className = 'domain-group';

      const header = document.createElement('div');
      header.className = 'domain-header';
      header.innerHTML =
        `<span class="chevron">\u25B6</span>` +
        `<span>${escapeHtml(domain)}</span>` +
        `<span class="domain-count">${filtered.length}</span>`;

      const body = document.createElement('div');
      body.className = 'domain-body';

      header.addEventListener('click', () => {
        header.classList.toggle('expanded');
        body.classList.toggle('visible');
      });

      if (q) {
        header.classList.add('expanded');
        body.classList.add('visible');
      }

      for (const op of filtered) {
        const row = document.createElement('div');
        row.className = 'op-row';

        const nameSpan = `<span class="op-name">${escapeHtml(op.name)}</span>`;
        const summarySpan = `<span class="op-summary">\u2014 ${escapeHtml(op.summary)}</span>`;
        row.innerHTML = nameSpan + summarySpan;

        if (op.fields.length > 0) {
          const detail = document.createElement('div');
          detail.className = 'op-detail';
          const paramLines = op.fields.map((f) => {
            const cls = f.required ? 'param-required' : 'param-optional';
            const suffix = f.required ? '' : '?';
            return `<div class="param ${cls}">${escapeHtml(f.name)}${suffix}: ${escapeHtml(f.type)}</div>`;
          });
          detail.innerHTML = paramLines.join('');

          row.addEventListener('click', (e) => {
            e.stopPropagation();
            detail.classList.toggle('visible');
          });

          row.appendChild(detail);
        }

        body.appendChild(row);
      }

      group.appendChild(header);
      group.appendChild(body);
      groupsContainer.appendChild(group);
    }

    if (groupsContainer.children.length === 0) {
      groupsContainer.innerHTML =
        '<div class="empty-state">No operations match your search.</div>';
    }
  }

  search.addEventListener('input', () => {
    renderGroups(search.value);
  });

  renderGroups('');
  root.appendChild(container);
}
