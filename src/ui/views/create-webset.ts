import type { App } from '@modelcontextprotocol/ext-apps';
import { buildField, buildDynamicList } from '../lib/forms.js';
import { callTask } from '../lib/api.js';

export interface CreateWebsetCallbacks {
  onCreated: (websetId: string, data: unknown) => void;
  onCancel: () => void;
}

export function renderCreateWebset(
  root: HTMLElement,
  app: App,
  callbacks: CreateWebsetCallbacks,
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
  breadcrumb.textContent = 'New Collection';
  nav.appendChild(breadcrumb);
  container.appendChild(nav);

  const form = document.createElement('form');
  form.addEventListener('submit', (e) => e.preventDefault());

  // Query field (required)
  const queryField = buildField({
    label: 'Search Query',
    name: 'query',
    type: 'text',
    placeholder: 'e.g. "AI startups in healthcare"',
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
    defaultValue: '10',
  });
  row.appendChild(countField.element);

  form.appendChild(row);

  // Name field (optional)
  const nameField = buildField({
    label: 'Name',
    name: 'name',
    type: 'text',
    placeholder: 'Optional collection name',
  });
  form.appendChild(nameField.element);

  // Criteria list
  const criteriaList = buildDynamicList({
    label: 'Criteria',
    placeholder: 'e.g. "Must have raised funding"',
    buttonText: 'Add Criterion',
  });
  form.appendChild(criteriaList.element);

  // Enrichments list (more complex: description + format)
  const enrichmentsSection = document.createElement('div');
  enrichmentsSection.className = 'dynamic-list';

  const enrichHeader = document.createElement('div');
  enrichHeader.className = 'dynamic-list-header';
  const enrichLabel = document.createElement('span');
  enrichLabel.className = 'form-label';
  enrichLabel.textContent = 'Enrichments';
  enrichLabel.style.marginBottom = '0';
  enrichHeader.appendChild(enrichLabel);
  enrichmentsSection.appendChild(enrichHeader);

  const enrichRows = document.createElement('div');
  enrichRows.className = 'dynamic-list-rows';
  enrichmentsSection.appendChild(enrichRows);

  function addEnrichmentRow(): void {
    const row = document.createElement('div');
    row.className = 'dynamic-list-row';
    row.style.flexWrap = 'wrap';
    row.style.gap = '4px';

    const descInput = document.createElement('input');
    descInput.className = 'form-input';
    descInput.type = 'text';
    descInput.placeholder = 'What to enrich (e.g. "Annual revenue")';
    descInput.style.flex = '2';
    descInput.style.minWidth = '180px';
    row.appendChild(descInput);

    const formatSelect = document.createElement('select');
    formatSelect.className = 'form-select';
    formatSelect.style.flex = '1';
    formatSelect.style.minWidth = '100px';
    for (const opt of ['text', 'date', 'number', 'options', 'email', 'phone', 'url']) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      formatSelect.appendChild(o);
    }
    row.appendChild(formatSelect);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'dynamic-list-remove';
    removeBtn.type = 'button';
    removeBtn.textContent = '\u00D7';
    removeBtn.addEventListener('click', () => row.remove());
    row.appendChild(removeBtn);

    enrichRows.appendChild(row);
    descInput.focus();
  }

  const addEnrichBtn = document.createElement('button');
  addEnrichBtn.className = 'dynamic-list-add';
  addEnrichBtn.type = 'button';
  addEnrichBtn.textContent = '+ Add Enrichment';
  addEnrichBtn.addEventListener('click', () => addEnrichmentRow());
  enrichmentsSection.appendChild(addEnrichBtn);

  form.appendChild(enrichmentsSection);

  // Action buttons
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
  submitBtn.textContent = 'Create Collection';
  actions.appendChild(submitBtn);

  form.appendChild(actions);

  // Submit handler
  form.addEventListener('submit', async () => {
    const query = queryField.getValue().trim();
    if (!query) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating\u2026';

    const args: Record<string, unknown> = { query };

    const entityType = entityField.getValue();
    if (entityType) args.entityType = entityType;

    const count = countField.getNumberValue();
    if (count) args.count = count;

    const name = nameField.getValue().trim();
    if (name) args.name = name;

    const criteria = criteriaList.getValues();
    if (criteria.length > 0) args.criteria = criteria;

    // Collect enrichments
    const enrichmentEls = enrichRows.querySelectorAll('.dynamic-list-row');
    const enrichmentArgs: Array<Record<string, unknown>> = [];
    for (const el of enrichmentEls) {
      const desc = (el.querySelector('.form-input') as HTMLInputElement)?.value.trim();
      const fmt = (el.querySelector('.form-select') as HTMLSelectElement)?.value;
      if (desc) {
        const e: Record<string, unknown> = { description: desc };
        if (fmt) e.format = fmt;
        enrichmentArgs.push(e);
      }
    }
    if (enrichmentArgs.length > 0) args.enrichments = enrichmentArgs;

    const result = await callTask(app, 'create_collection', args);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Collection';

    if (result.isError) {
      const err = document.createElement('div');
      err.className = 'error-msg';
      err.textContent = result.errorText ?? 'Failed to create collection';
      // Remove previous errors
      const prev = form.querySelector('.error-msg');
      if (prev) prev.remove();
      form.insertBefore(err, actions);
      return;
    }

    const data = result.data as Record<string, unknown>;
    const websetId = data?.id as string | undefined;
    if (websetId) {
      callbacks.onCreated(websetId, data);
    }
  });

  container.appendChild(form);
  root.appendChild(container);
}
