import type { App } from '@modelcontextprotocol/ext-apps';
import { buildField } from '../lib/forms.js';
import { callTask } from '../lib/api.js';

export interface SetMonitorCallbacks {
  onSuccess: (data: unknown) => void;
  onCancel: () => void;
}

export function renderSetMonitor(
  root: HTMLElement,
  params: { websetId: string },
  app: App,
  callbacks: SetMonitorCallbacks,
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
  breadcrumb.textContent = 'Set Monitor';
  nav.appendChild(breadcrumb);
  container.appendChild(nav);

  const form = document.createElement('form');
  form.addEventListener('submit', (e) => e.preventDefault());

  // Cron (required)
  const cronField = buildField({
    label: 'Cron Schedule',
    name: 'cron',
    type: 'text',
    placeholder: '0 9 * * 1 (every Monday at 9am)',
    required: true,
  });
  form.appendChild(cronField.element);

  // Timezone
  const tzField = buildField({
    label: 'Timezone',
    name: 'timezone',
    type: 'text',
    placeholder: 'e.g. America/New_York (optional)',
  });
  form.appendChild(tzField.element);

  // Row: query + count
  const row = document.createElement('div');
  row.className = 'form-row';

  const queryField = buildField({
    label: 'Override Query',
    name: 'query',
    type: 'text',
    placeholder: 'Optional override search query',
  });
  row.appendChild(queryField.element);

  const countField = buildField({
    label: 'Override Count',
    name: 'count',
    type: 'number',
    placeholder: 'Optional',
  });
  row.appendChild(countField.element);

  form.appendChild(row);

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
  submitBtn.textContent = 'Set Monitor';
  actions.appendChild(submitBtn);

  form.appendChild(actions);

  form.addEventListener('submit', async () => {
    const cron = cronField.getValue().trim();
    if (!cron) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Setting\u2026';

    const args: Record<string, unknown> = {
      websetId: params.websetId,
      cron,
    };

    const timezone = tzField.getValue().trim();
    if (timezone) args.timezone = timezone;

    const query = queryField.getValue().trim();
    if (query) args.query = query;

    const count = countField.getNumberValue();
    if (count) args.count = count;

    const result = await callTask(app, 'set_monitor', args);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Set Monitor';

    if (result.isError) {
      const err = document.createElement('div');
      err.className = 'error-msg';
      err.textContent = result.errorText ?? 'Failed to set monitor';
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
