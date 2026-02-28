import type { App } from '@modelcontextprotocol/ext-apps';
import { buildField, buildDynamicList } from '../lib/forms.js';
import { callTask } from '../lib/api.js';

export interface AddSearchCallbacks {
  onSuccess: (data: unknown) => void;
  onCancel: () => void;
}

export function renderAddSearch(
  root: HTMLElement,
  params: { websetId: string },
  app: App,
  callbacks: AddSearchCallbacks,
): void {
  const container = document.createElement('div');

  // Nav bar
  const nav = document.createElement('div');
  nav.className = 'nav-bar';
  const backBtn = document.createElement('button');
  backBtn.className = 'btn-back';
  backBtn.textContent = '\u2190';
  backBtn.addEventListener('click', () => callbacks.onCancel());
  nav.appendChild(backBtn);
  const breadcrumb = document.createElement('span');
  breadcrumb.className = 'nav-breadcrumb';
  breadcrumb.textContent = 'Add Search';
  nav.appendChild(breadcrumb);
  container.appendChild(nav);

  const form = document.createElement('form');
  form.addEventListener('submit', (e) => e.preventDefault());

  // Query (required)
  const queryField = buildField({
    label: 'Search Query',
    name: 'query',
    type: 'text',
    placeholder: 'e.g. "Series B SaaS companies"',
    required: true,
  });
  form.appendChild(queryField.element);

  // Row: entity type + count
  const row = document.createElement('div');
  row.className = 'form-row';

  const entityField = buildField({
    label: 'Entity Type',
    name: 'entityType',
    type: 'select',
    placeholder: 'Any type',
    options: ['company', 'person', 'article', 'research_paper', 'custom'],
  });
  row.appendChild(entityField.element);

  const countField = buildField({
    label: 'Count',
    name: 'count',
    type: 'number',
    placeholder: '10',
  });
  row.appendChild(countField.element);

  form.appendChild(row);

  // Criteria
  const criteriaList = buildDynamicList({
    label: 'Criteria',
    placeholder: 'e.g. "Must have a public API"',
    buttonText: 'Add Criterion',
  });
  form.appendChild(criteriaList.element);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'form-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn';
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => callbacks.onCancel());
  actions.appendChild(cancelBtn);

  const submitBtn = document.createElement('button');
  submitBtn.className = 'btn-primary';
  submitBtn.type = 'submit';
  submitBtn.textContent = 'Add Search';
  actions.appendChild(submitBtn);

  form.appendChild(actions);

  form.addEventListener('submit', async () => {
    const query = queryField.getValue().trim();
    if (!query) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding\u2026';

    const args: Record<string, unknown> = {
      websetId: params.websetId,
      query,
    };

    const entityType = entityField.getValue();
    if (entityType) args.entityType = entityType;

    const count = countField.getNumberValue();
    if (count) args.count = count;

    const criteria = criteriaList.getValues();
    if (criteria.length > 0) args.criteria = criteria;

    const result = await callTask(app, 'add_search', args);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Add Search';

    if (result.isError) {
      const err = document.createElement('div');
      err.className = 'error-msg';
      err.textContent = result.errorText ?? 'Failed to add search';
      const prev = form.querySelector('.error-msg');
      if (prev) prev.remove();
      form.insertBefore(err, actions);
      return;
    }

    callbacks.onSuccess(result.data);
  });

  container.appendChild(form);
  root.appendChild(container);
}
