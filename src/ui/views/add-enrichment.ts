import type { App } from '@modelcontextprotocol/ext-apps';
import { buildField, buildDynamicList } from '../lib/forms.js';
import { callTask } from '../lib/api.js';

export interface AddEnrichmentCallbacks {
  onSuccess: (data: unknown) => void;
  onCancel: () => void;
}

export function renderAddEnrichment(
  root: HTMLElement,
  params: { websetId: string },
  app: App,
  callbacks: AddEnrichmentCallbacks,
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
  breadcrumb.textContent = 'Add Enrichment';
  nav.appendChild(breadcrumb);
  container.appendChild(nav);

  const form = document.createElement('form');
  form.addEventListener('submit', (e) => e.preventDefault());

  // Description (required)
  const descField = buildField({
    label: 'Description',
    name: 'description',
    type: 'textarea',
    placeholder: 'What to enrich (e.g. "Annual revenue estimate")',
    required: true,
  });
  form.appendChild(descField.element);

  // Format
  const formatField = buildField({
    label: 'Format',
    name: 'format',
    type: 'select',
    placeholder: 'Select format',
    options: ['text', 'date', 'number', 'options', 'email', 'phone', 'url'],
    defaultValue: 'text',
  });
  form.appendChild(formatField.element);

  // Options list (shown conditionally when format=options)
  const optionsList = buildDynamicList({
    label: 'Options',
    placeholder: 'Option label',
    buttonText: 'Add Option',
  });
  optionsList.element.style.display = 'none';
  form.appendChild(optionsList.element);

  // Toggle options visibility based on format
  const formatSelect = formatField.element.querySelector('select')!;
  formatSelect.addEventListener('change', () => {
    optionsList.element.style.display =
      formatSelect.value === 'options' ? '' : 'none';
  });

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
  submitBtn.textContent = 'Add Enrichment';
  actions.appendChild(submitBtn);

  form.appendChild(actions);

  form.addEventListener('submit', async () => {
    const description = descField.getValue().trim();
    if (!description) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding\u2026';

    const args: Record<string, unknown> = {
      websetId: params.websetId,
      description,
    };

    const format = formatField.getValue();
    if (format) args.format = format;

    if (format === 'options') {
      const options = optionsList.getValues();
      if (options.length > 0) args.options = options;
    }

    const result = await callTask(app, 'add_enrichment', args);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Add Enrichment';

    if (result.isError) {
      const err = document.createElement('div');
      err.className = 'error-msg';
      err.textContent = result.errorText ?? 'Failed to add enrichment';
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
