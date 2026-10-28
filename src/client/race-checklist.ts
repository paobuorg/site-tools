import {
  buildChecklist,
  type ChecklistDuration,
  type ChecklistLocale,
  type ChecklistRaceType,
  type ChecklistWeather,
} from '../lib/race-checklist';

export function initRaceChecklist(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>('[data-checklist-form]');
  const result = root.querySelector<HTMLElement>('[data-checklist-result]');
  const printButton = root.querySelector<HTMLButtonElement>('[data-checklist-print]');
  if (!form || !result) return;
  const locale = (root.dataset.locale ?? 'zh-CN') as ChecklistLocale;

  const render = () => {
    const formData = new FormData(form);
    const sections = buildChecklist({
      raceType: (formData.get('raceType') as ChecklistRaceType) ?? 'road',
      duration: (formData.get('duration') as ChecklistDuration) ?? 'under-3h',
      weather: (formData.get('weather') as ChecklistWeather) ?? 'mild',
      travel: formData.get('travel') === 'on',
    });
    result.textContent = '';
    for (const section of sections) {
      const card = document.createElement('section');
      card.className = 'checklist-section';
      const heading = document.createElement('h3');
      heading.textContent = section.title[locale];
      card.appendChild(heading);
      const list = document.createElement('ul');
      for (const item of section.items) {
        const row = document.createElement('li');
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = item.id;
        const text = document.createElement('span');
        text.textContent = item.label[locale];
        label.append(checkbox, text);
        if (item.detail) {
          const detail = document.createElement('small');
          detail.textContent = item.detail[locale];
          label.appendChild(detail);
        }
        row.appendChild(label);
        list.appendChild(row);
      }
      card.appendChild(list);
      result.appendChild(card);
    }
    result.hidden = false;
  };

  form.addEventListener('change', render);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    render();
  });
  printButton?.addEventListener('click', () => window.print());
  render();
}
