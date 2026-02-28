export function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export interface FieldConfig {
  label: string;
  name: string;
  type: 'text' | 'number' | 'select' | 'textarea';
  placeholder?: string;
  required?: boolean;
  options?: string[];
  defaultValue?: string;
}

export interface FieldResult {
  element: HTMLElement;
  getValue(): string;
  getNumberValue(): number | undefined;
}

export function buildField(config: FieldConfig): FieldResult {
  const field = document.createElement('div');
  field.className = 'form-field';

  const label = document.createElement('label');
  label.className = 'form-label';
  label.innerHTML = escapeHtml(config.label) +
    (config.required ? ' <span class="required">*</span>' : '');
  field.appendChild(label);

  let input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

  if (config.type === 'select') {
    const sel = document.createElement('select');
    sel.className = 'form-select';
    sel.name = config.name;
    if (config.placeholder) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = config.placeholder;
      sel.appendChild(opt);
    }
    for (const optValue of config.options ?? []) {
      const opt = document.createElement('option');
      opt.value = optValue;
      opt.textContent = optValue;
      sel.appendChild(opt);
    }
    if (config.defaultValue) sel.value = config.defaultValue;
    input = sel;
  } else if (config.type === 'textarea') {
    const ta = document.createElement('textarea');
    ta.className = 'form-textarea';
    ta.name = config.name;
    if (config.placeholder) ta.placeholder = config.placeholder;
    if (config.defaultValue) ta.value = config.defaultValue;
    input = ta;
  } else {
    const inp = document.createElement('input');
    inp.className = 'form-input';
    inp.type = config.type === 'number' ? 'number' : 'text';
    inp.name = config.name;
    if (config.placeholder) inp.placeholder = config.placeholder;
    if (config.defaultValue) inp.value = config.defaultValue;
    input = inp;
  }

  field.appendChild(input);

  return {
    element: field,
    getValue() {
      return input.value;
    },
    getNumberValue() {
      const v = input.value.trim();
      if (!v) return undefined;
      const n = Number(v);
      return Number.isNaN(n) ? undefined : n;
    },
  };
}

export interface DynamicListConfig {
  label: string;
  placeholder?: string;
  buttonText?: string;
}

export interface DynamicListResult {
  element: HTMLElement;
  getValues(): string[];
}

export function buildDynamicList(
  config: DynamicListConfig,
): DynamicListResult {
  const wrapper = document.createElement('div');
  wrapper.className = 'dynamic-list';

  const header = document.createElement('div');
  header.className = 'dynamic-list-header';

  const label = document.createElement('span');
  label.className = 'form-label';
  label.textContent = config.label;
  label.style.marginBottom = '0';
  header.appendChild(label);

  wrapper.appendChild(header);

  const rows = document.createElement('div');
  rows.className = 'dynamic-list-rows';
  wrapper.appendChild(rows);

  function addRow(value = ''): void {
    const row = document.createElement('div');
    row.className = 'dynamic-list-row';

    const input = document.createElement('input');
    input.className = 'form-input';
    input.type = 'text';
    input.placeholder = config.placeholder ?? '';
    input.value = value;
    row.appendChild(input);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'dynamic-list-remove';
    removeBtn.type = 'button';
    removeBtn.textContent = '\u00D7';
    removeBtn.addEventListener('click', () => row.remove());
    row.appendChild(removeBtn);

    rows.appendChild(row);
    input.focus();
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'dynamic-list-add';
  addBtn.type = 'button';
  addBtn.textContent = `+ ${config.buttonText ?? 'Add'}`;
  addBtn.addEventListener('click', () => addRow());
  wrapper.appendChild(addBtn);

  return {
    element: wrapper,
    getValues() {
      const inputs = rows.querySelectorAll<HTMLInputElement>(
        '.form-input',
      );
      return Array.from(inputs)
        .map((i) => i.value.trim())
        .filter((v) => v.length > 0);
    },
  };
}
