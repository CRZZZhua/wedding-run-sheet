'use strict';

const byId = (id) => document.getElementById(id);
const dateTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const eventDay = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
});

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value != null) node.textContent = value;
  return node;
}

function link(label, href) {
  const anchor = element('a', '', label);
  anchor.href = href;
  return anchor;
}

function scheduleTime(date, time) {
  return Date.parse(`${date}T${time}:00+08:00`);
}

function taskTime(task) {
  if (task.end) return `${task.start}–${task.end}`;
  return task.ongoing ? `${task.start} 起` : task.start;
}

function participants(task) {
  return [task.lead, ...task.with];
}

function tag(status) {
  const urgent = status === '待确认' || status === '暂排';
  return element('span', urgent ? 'badge pending' : 'badge', status);
}

function roleUrl(role) {
  const url = new URL(window.location.href);
  url.search = role ? `?role=${encodeURIComponent(role)}` : '';
  url.hash = '';
  return url.href;
}

function renderRoles(roles, active) {
  const options = [['', '总览'], ...Object.entries(roles).map(([id, role]) => [id, role.name])];
  for (const [id, name] of options) {
    const anchor = link(name, roleUrl(id));
    if (id === active) anchor.setAttribute('aria-current', 'page');
    byId('roles').append(anchor);
  }
}

function renderNext(date, tasks, now = Date.now()) {
  const panel = byId('next');
  const dayStart = scheduleTime(date, '00:00');
  const before = now < dayStart;
  const onDay = now >= dayStart && now < dayStart + 86_400_000;
  const current = onDay ? tasks.filter((task) => {
    const start = scheduleTime(date, task.start);
    const end = task.end ? scheduleTime(date, task.end) : start + 60_000;
    return start <= now && now < end;
  }) : [];
  const upcoming = tasks.find((task) => scheduleTime(date, task.start) > now);
  const selected = current.length ? current : upcoming ? [upcoming] : [];
  const heading = before ? '首项计划' : current.length ? '当前计划时段' : '下一项计划';
  const title = element('p', 'eyebrow', selected.length ? heading : '当天计划时段已结束');
  const note = element('p', 'muted', '按北京时间提示计划时段，实际进度以现场口令为准。');
  panel.replaceChildren(title);
  for (const task of selected) {
    const row = element('div', 'next-task');
    row.append(link(`${taskTime(task)}  ${task.title}`, `#task-${task.id}`));
    row.append(element('p', 'muted', task.area));
    row.append(element('p', '', task.cue || task.action));
    panel.append(row);
  }
  panel.append(note);
  panel.hidden = false;
}

function taskCard(task, roles) {
  const item = element('li', 'task');
  item.id = `task-${task.id}`;
  const details = element('details', 'task-details');
  const summary = element('summary', 'task-summary');
  const clock = element('span', 'task-time', taskTime(task));
  const heading = element('span', 'task-heading');
  heading.append(element('strong', '', task.title));
  heading.append(element('span', 'task-area', `${task.area} · ${roles[task.lead].name}负责`));
  if (task.cue) heading.append(element('span', 'cue', task.cue));
  summary.append(clock, heading);
  if (task.status !== '计划') summary.append(tag(task.status));
  const detail = element('div', 'task-body');
  detail.append(element('p', '', task.action));
  if (task.with.length) {
    detail.append(element('p', 'muted', `协作岗位 · ${task.with.map((id) => roles[id].name).join('、')}`));
  }
  details.append(summary, detail);
  item.append(details);
  return item;
}

function overview(tasks, roles, stage) {
  const frame = element('div', 'overview');
  frame.setAttribute('role', 'region');
  frame.setAttribute('aria-label', `${stage.name}岗位时间轴`);
  frame.tabIndex = 0;
  const times = [...new Set(tasks.map((task) => task.start))];
  const table = element('table', 'matrix');
  table.append(element('caption', '', '按开始节点从左到右排列。每项标明实际计划时段，可左右滑动查看。'));
  const header = table.createTHead().insertRow();
  for (const label of ['岗位', ...times]) {
    const cell = element('th', '', label);
    cell.scope = 'col';
    header.append(cell);
  }
  const body = table.createTBody();
  for (const [id, role] of Object.entries(roles)) {
    const lane = tasks.filter((task) => participants(task).includes(id));
    if (!lane.length) continue;
    const row = body.insertRow();
    const label = element('th', '', role.name);
    label.scope = 'row';
    row.append(label);
    for (const time of times) {
      const cell = row.insertCell();
      for (const task of lane.filter((entry) => entry.start === time)) {
        const entry = link(task.title, `#task-${task.id}`);
        entry.className = task.lead === id ? 'matrix-task lead' : 'matrix-task';
        entry.append(element('span', '', `${taskTime(task)} · ${task.lead === id ? '负责' : '协作'}`));
        cell.append(entry);
      }
    }
  }
  frame.append(table);
  return frame;
}

function renderTimeline(data, tasks, role) {
  for (const stage of data.stages) {
    const group = tasks.filter((task) => task.stage === stage.id);
    if (!group.length) continue;
    const id = `stage-${stage.id}`;
    byId('stages').append(link(stage.name, `#${id}`));
    const section = element('section', 'stage');
    section.id = id;
    const heading = element('h3', 'stage-heading', stage.name);
    heading.append(element('span', '', group[0].start));
    section.append(heading);
    if (!role) section.append(overview(group, data.roles, stage));
    const list = element('ol', 'task-list');
    for (const task of group) list.append(taskCard(task, data.roles));
    section.append(list);
    byId('timeline').append(section);
  }
}

function renderChecklist(data) {
  for (const check of data.checklist) {
    const item = element('li', 'check-item');
    const date = new Date(scheduleTime(data.date, '00:00') - check.daysBefore * 86_400_000);
    const deadline = element('div', 'deadline', `前 ${check.daysBefore} 天`);
    deadline.append(element('span', '', eventDay.format(date)));
    const detail = element('div', 'check-body');
    detail.append(element('strong', '', check.owner), tag(check.status), element('p', '', check.deliverable));
    item.append(deadline, detail);
    byId('checklist-items').append(item);
  }
}

function renderWeather(weather) {
  const chosen = weather.options.find((option) => option.id === weather.selected);
  const status = byId('site-status');
  const label = chosen ? `场地已定 · ${chosen.id} ${chosen.name}` : '场地待定';
  status.classList.add(chosen ? 'resolved' : 'awaiting');
  status.replaceChildren(
    link(label, '#weather'),
    element('span', '', chosen ? weather.decisionNote || '以统筹在微信群发出的现场口令为准。' :
      `${weather.initialCheck} 计划初判 · 暂按 ${weather.targetDecision} 定场`),
  );
  const detail = byId('weather-detail');
  detail.append(element('p', 'support-intro', weather.timing));
  const plans = element('div', 'weather-plans');
  for (const option of weather.options) {
    const card = element('article', 'weather-plan');
    if (option === chosen) card.classList.add('chosen');
    const heading = element('h3', '', `${option.id} / ${option.name}`);
    if (option === chosen) heading.append(tag('当前方案'));
    card.append(heading, element('p', 'muted', option.condition), element('p', '', option.actions));
    plans.append(card);
  }
  const instructions = element('div', 'instructions');
  instructions.append(
    element('h3', '', '切换指令'), element('p', '', weather.switch),
    element('h3', '', '重开指令'), element('p', '', weather.restart),
  );
  detail.append(plans, instructions);
}

function renderContacts(roles, handoff) {
  const section = byId('contact-detail');
  section.append(element('p', 'support-intro', handoff.contactOrder));
  const list = element('dl', 'role-directory');
  for (const [id, role] of Object.entries(roles)) {
    const label = element('dt');
    label.append(link(role.name, roleUrl(id)));
    list.append(label, element('dd', '', role.duty));
  }
  const delay = element('div', 'instructions');
  delay.append(element('h3', '', '延误处理'), element('p', '', handoff.delay));
  section.append(list, delay, element('p', 'muted', handoff.distribution));
}

function revealLinkedTask() {
  const id = window.location.hash.slice(1);
  if (!id.startsWith('task-')) return;
  const task = byId(id);
  if (!task) return;
  task.querySelector('details').open = true;
  task.scrollIntoView({block: 'start'});
}

function setupActions() {
  byId('share').addEventListener('click', async () => {
    const url = roleUrl(byId('app').dataset.role);
    const feedback = byId('share-status');
    try {
      await navigator.clipboard.writeText(url);
      feedback.textContent = '链接已复制，可粘贴到微信群。';
    } catch {
      const field = element('input', 'share-field');
      field.type = 'text';
      field.readOnly = true;
      field.value = url;
      field.setAttribute('aria-label', '当前岗位链接');
      feedback.replaceChildren('请复制此链接 ', field);
      field.select();
    }
  });
  byId('print').addEventListener('click', () => window.print());
  let printOpened = [];
  window.addEventListener('beforeprint', () => {
    const closed = [...document.querySelectorAll('.task-details:not([open])')];
    for (const detail of closed) detail.open = true;
    printOpened.push(...closed);
  });
  window.addEventListener('afterprint', () => {
    for (const detail of printOpened) detail.open = false;
    printOpened = [];
  });
  window.addEventListener('hashchange', revealLinkedTask);
}

async function loadSchedule() {
  const response = await fetch('./schedule.json', {cache: 'no-store'});
  if (!response.ok) throw new Error(`排程请求失败 (${response.status})`);
  const data = await response.json();
  const requested = new URLSearchParams(window.location.search).get('role');
  const role = Object.prototype.hasOwnProperty.call(data.roles, requested) ? requested : '';
  const tasks = data.tasks.filter((task) => !role || participants(task).includes(role));
  tasks.sort((a, b) => a.start.localeCompare(b.start));

  byId('event-date').textContent = `${eventDay.format(scheduleTime(data.date, '00:00'))} · 北京时间`;
  byId('app').dataset.role = role;
  if (role) {
    document.title = `${data.roles[role].name} · 广州庭院婚礼执行台`;
    byId('schedule-heading').textContent = `${data.roles[role].name}岗位排程`;
  }
  renderRoles(data.roles, role);
  renderTimeline(data, tasks, role);
  renderChecklist(data);
  renderWeather(data.weather);
  renderContacts(data.roles, data.handoff);
  const revision = `排程版本 · ${dateTime.format(new Date(data.version.updatedAt))}（北京时间）`;
  byId('version-link').textContent = revision;
  byId('version-link').hidden = false;
  byId('version').append(
    element('strong', '', revision),
    element('p', '', data.version.summary),
    element('p', 'muted', '临时改时或雨备切换以统筹在微信群发出的口令为准。'),
  );
  setupActions();
  if (role) {
    renderNext(data.date, tasks);
    window.setInterval(() => renderNext(data.date, tasks), 30_000);
  }
  byId('app').hidden = false;
  byId('version').hidden = false;
  revealLinkedTask();
}

loadSchedule().catch((error) => {
  const status = byId('site-status');
  status.classList.add('awaiting');
  const retry = element('button', '', '重新加载');
  retry.addEventListener('click', () => window.location.reload());
  status.replaceChildren('排程暂时无法载入。可重试，或查阅微信群里的岗位打印件。', retry);
  console.error(error);
});
