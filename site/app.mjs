
import {briefing, clock, dayStart, forRole, href, laneTracks, onWeddingDay, pageNames, people, planTasks, route, taskTiming, timeLabel} from './model.mjs';

const byId = id => document.getElementById(id);
const formatDate = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
});
const formatTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const desktop = matchMedia('(min-width: 768px)');
const minute = 60000;
const allStages = new Set();
let data, pending, currentRoute, visibleTasks;
let loading = false;
let view = 'lanes';
let laneStage = '';
let printDetails = [];

function element(tag, className, ...content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...content.filter(value => value != null));
  return node;
}

function link(label, to, selected = false) {
  const node = element('a', '', label);
  node.href = to;
  if (selected) node.setAttribute('aria-current', 'page');
  return node;
}

function button(label, action, className = '') {
  const node = element('button', className, label);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

function badge(label) {
  const pendingLabel = /待确认|暂排|暂定|已过截止/.test(label);
  return element('span', pendingLabel ? 'badge pending' : 'badge', label);
}

function paragraph(label, value, className = '') {
  return element('p', className, element('strong', '', label + '　'), value);
}

function roleNames(ids) {
  return ids.map(id => data.roles[id].name).join('、');
}

function activeWeather() {
  return data.weather.options.find(plan => plan.id === data.weather.selected);
}

function list(tag, items) {
  return element(tag, '', ...items.map(item => element('li', '', item)));
}

function versionLabel(release) {
  return '版本 ' + release.version + ' · 更新于 ' + formatTime.format(new Date(release.updatedAt)) + '（北京时间）';
}

async function share(target) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = target;
  const status = byId('share-status');
  try {
    await navigator.clipboard.writeText(url.href);
    status.textContent = '链接已复制，可发到工作群。';
  } catch {
    const input = element('input', 'share-field');
    input.readOnly = true;
    input.value = url.href;
    input.setAttribute('aria-label', '手动复制完整链接');
    status.replaceChildren('请手动复制完整链接', input);
    input.focus();
    input.select();
  }
}

function renderHeader() {
  const plan = activeWeather();
  byId('title').textContent = data.wedding.title;
  byId('event-date').textContent = formatDate.format(dayStart(data.wedding.date)) + ' · 北京时间 · ' + data.wedding.venue;
  byId('revision').textContent = versionLabel(data.release);
  const status = byId('site-status');
  status.className = 'site-status ' + (plan ? 'resolved' : 'awaiting');
  status.replaceChildren(link(plan ? '当前方案 · ' + plan.id + ' ' + plan.name : '天气方案 · 待统筹确认', href('contingency')),
    element('span', '', data.weather.decisionNote || '以统筹现场口令为准。'));
  byId('more').hidden = false;
  byId('main').hidden = false;
  byId('footer').hidden = false;
  byId('history-content').replaceChildren(...[data.release, ...data.release.history].map(release =>
    element('section', 'revision-entry', element('h3', '', versionLabel(release)), list('ul', release.changes))));
  byId('print-weather').replaceChildren(element('h2', '', '天气方案与交接'), contingencyContent(true));
}

function taskBody(task) {
  const area = data.locations[task.location];
  const body = element('div', 'task-body',
    paragraph('要做的事', task.action),
    paragraph('负责岗位', roleNames([task.lead])),
    paragraph('配合岗位', task.withRoles.length ? roleNames(task.withRoles) : '—'));
  if (task.helperDuty) body.append(paragraph('亲友分工', task.helperDuty));
  body.append(paragraph('开始条件', task.startSignal, 'cue'), paragraph('完成后交接', task.handoff, 'cue'));
  if (task.steps.length) body.append(element('h4', '', '执行子步骤'), list('ol', task.steps));
  if (task.supplies.length) body.append(paragraph('物资', task.supplies.join('、')));
  body.append(paragraph('地点说明', area.note, 'muted'));
  if (task.note) body.append(paragraph('天气调整', task.note, 'notice'));
  body.append(paragraph('来源', task.source, 'muted'),
    button('复制任务链接', () => share(href('day', currentRoute.role, task.id)), 'screen-only'));
  return body;
}

function taskCard(task) {
  const area = data.locations[task.location];
  const timing = element('span', 'timing muted');
  const tags = element('span', 'task-tags');
  if (task.status !== '计划') tags.append(badge(task.status));
  if (task.optional) tags.append(badge('可选'));
  if (task.assignmentPending) tags.append(badge('责任分配待确认'));
  if (area.status === '待确认') tags.append(badge('地点待确认'));
  const heading = element('span', 'task-heading',
    element('strong', '', task.title), element('span', 'task-area', area.name + ' · ' + roleNames([task.lead]) + '负责'),
    task.id === 'ceremony-entrance' ? element('span', 'cue', task.startSignal) : null, tags, timing);
  const summary = element('summary', 'task-summary', element('span', 'task-time', timeLabel(task)), heading);
  const details = element('details', 'task-details', summary, taskBody(task));
  details.open = task.id === currentRoute.task;
  const item = element('li', details.open ? 'task linked' : 'task', details);
  item.id = 'task-' + task.id;
  return item;
}

function renderList(tasks) {
  const timeline = element('div', 'timeline');
  const stages = element('nav', 'pills stage-nav screen-only');
  stages.setAttribute('aria-label', '跳转流程阶段');
  timeline.append(stages);
  for (const stage of data.stages) {
    const group = tasks.filter(task => task.stage === stage.id);
    if (!group.length) continue;
    const start = group[0].start;
    const end = group.reduce((latest, task) => (task.end ?? task.start) > latest ? (task.end ?? task.start) : latest, start);
    const stageDetails = element('details', 'stage',
      element('summary', 'stage-heading', element('span', '', stage.name),
        element('span', 'stage-time', clock(start) + (group.some(task => task.kind === 'open') ? '–' + clock(end) + ' 起' : end !== start ? '–' + clock(end) : ''))),
      element('ol', 'task-list', ...group.map(taskCard)));
    stageDetails.id = 'stage-' + stage.id;
    stageDetails.open = allStages.has(stage.id) || tasks.some(task => task.stage === stage.id && task.id === currentRoute.task);
    stageDetails.addEventListener('toggle', () => {
      if (stageDetails.open) allStages.add(stage.id);
      else allStages.delete(stage.id);
    });
    stages.append(button(stage.name, () => {
      stageDetails.open = true;
      stageDetails.scrollIntoView({block: 'start'});
      stageDetails.querySelector('summary').focus({preventScroll: true});
    }));
    timeline.append(stageDetails);
  }
  return timeline;
}

function showTask(task, role = currentRoute.role) {
  const to = href('day', role, task.id);
  if (location.hash === to) revealTask();
  else location.hash = to;
}

function renderLane(tasks, stageId) {
  const group = stageId === 'all' ? tasks : tasks.filter(task => task.stage === stageId);
  if (!group.length) return element('p', 'muted', '该阶段暂无任务。');
  const start = Math.floor(Date.parse(group[0].start) / (10 * minute)) * 10 * minute;
  const pixels = stageId === 'all' ? 4 : 11;
  const end = Math.max(...group.map(task => Date.parse(task.end ?? task.start) +
    (task.kind === 'open' || task.kind === 'point' ? Math.ceil(128 / pixels) : 0) * minute));
  const step = stageId === 'all' ? 30 : end - start < 90 * minute ? 10 : 15;
  const x = time => (time - start) / minute * pixels;
  const scale = element('div', 'lane-grid');
  scale.style.setProperty('--track-width', Math.ceil(x(end) + 52) + 'px');
  scale.style.setProperty('--grid-step', pixels * step + 'px');
  const axis = element('div', 'lane-track lane-axis');
  const axisClock = new Intl.DateTimeFormat('zh-CN', {timeZone: data.wedding.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
  for (let time = start; time <= end; time += step * minute) {
    const label = element('span', '', axisClock.format(time));
    label.style.left = x(time) + 'px';
    axis.append(label);
  }
  scale.append(element('div', 'lane-label', '岗位'), axis);
  for (const [id, role] of Object.entries(data.roles)) {
    const lane = laneTracks(group.filter(task => people(task).includes(id)), end, pixels);
    if (!lane.length) continue;
    const track = element('div', 'lane-track');
    track.style.minHeight = (Math.max(...lane.map(entry => entry.row)) + 1) * 40 + 8 + 'px';
    for (const {task, start: from, end: until, row} of lane) {
      const duration = (until - from) / minute;
      const short = task.kind === 'range' && duration * pixels < 48;
      const node = button(task.kind === 'point' ? '◆ ' + task.title : task.kind === 'open' ? '→ ' + task.title :
        short ? task.title.slice(0, 2) : task.title, () => showTask(task),
      'lane-task ' + task.kind + (task.lead === id ? ' lead' : '') + (short ? ' short' : ''));
      node.style.left = x(from) + 'px';
      node.style.top = (row * 40 + 4) + 'px';
      if (short) node.style.setProperty('--duration-width', duration * pixels + 'px');
      else if (task.kind === 'range') node.style.width = duration * pixels + 'px';
      node.dataset.task = task.id;
      const label = timeLabel(task) + ' ' + task.title + ' · ' + (task.lead === id ? '负责' : '协作');
      node.title = label;
      node.setAttribute('aria-label', label);
      track.append(node);
    }
    scale.append(element('div', 'lane-label', role.name), track);
  }
  const scroll = element('div', 'overview', scale);
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', '按岗位查看时间泳道，可横向滚动');
  return scroll;
}

function renderDay(page, tasks) {
  const role = currentRoute.role;
  const selected = tasks.find(task => task.id === currentRoute.task);
  const title = role ? data.roles[role].name + '岗位排程' : '当天总览';
  const heading = element('div', 'section-heading', element('h2', '', title));
  if (role) heading.append(button('复制岗位链接', () => share(href('day', role)), 'screen-only'));
  const roles = element('nav', 'pills screen-only', link('总览', href(), !role));
  roles.setAttribute('aria-label', '按岗位查看');
  for (const [id, info] of Object.entries(data.roles)) roles.append(link(info.name, href('day', id), id === role));
  const next = element('aside', 'next screen-only');
  next.id = 'briefing';
  page.append(heading, roles, next);
  if (!role) {
    const byTask = new Map(tasks.map(task => [task.id, task]));
    const milestones = data.milestones.map(({from, through, label}) => {
      const task = byTask.get(from);
      const tail = through && byTask.get(through);
      const time = tail ? clock(task.start) + '–' + clock(tail.end ?? tail.start) :
        from === 'coordinator-arrival' ? clock(task.start) : timeLabel(task);
      return element('li', '', link(time + ' · ' + label, href('day', '', from)),
        ['暂定', '暂排', '待确认'].includes(task.status) ? badge(task.status) : null);
    });
    page.append(element('details', 'milestones screen-only',
      element('summary', '', '关键时间'), element('ul', '', ...milestones)));
  }
  if (role) {
    const plan = activeWeather();
    page.append(element('aside', 'notice screen-only',
      paragraph('岗位通知', (plan ? '已发布 ' + plan.id + ' ' + plan.name : '雨备方案待统筹确认') +
        '。开场、天气切换和开餐调整以统筹口令为准。'),
      link('查看预案与延误处理', href('contingency'))));
  }
  if (currentRoute.task && !selected) page.append(element('p', 'notice', '该任务不存在或不在当前岗位视图中。'));
  const lanes = desktop.matches && view === 'lanes';
  const controls = element('div', 'view-controls screen-only');
  if (desktop.matches) {
    for (const [key, label] of [['lanes', '泳道'], ['list', '列表']]) {
      const control = button(label, () => {view = key; renderPage(); byId('view-' + key)?.focus();});
      control.id = 'view-' + key;
      control.setAttribute('aria-pressed', String(view === key));
      controls.append(control);
    }
  }
  if (lanes) {
    const available = data.stages.filter(stage => tasks.some(task => task.stage === stage.id));
    const active = tasks.find(task => taskTiming(task, data.wedding.date, Date.now()) === 'current');
    const defaultStage = selected?.stage || active?.stage ||
      (role ? available[0]?.id : available.find(stage => stage.id === 'welcome')?.id) || available[0]?.id;
    const stage = laneStage === 'all' || available.some(entry => entry.id === laneStage) ? laneStage : defaultStage;
    const select = element('select', '', ...[...available, {id: 'all', name: '全天'}].map(entry => {
      const option = element('option', '', entry.name);
      option.value = entry.id;
      return option;
    }));
    select.value = stage;
    select.setAttribute('aria-label', '选择泳道阶段');
    select.addEventListener('change', () => {laneStage = select.value; renderPage(); byId('lane-stage')?.focus();});
    select.id = 'lane-stage';
    controls.append(select);
    page.append(controls);
    page.append(element('p', 'muted screen-only', '色块表示时间段，◆ 表示时间节点，→ 表示结束时间待定。选择任务查看交接。'));
    page.append(renderLane(tasks, stage));
    if (selected) {
      const panel = element('section', 'lane-detail screen-only', element('h3', '', selected.title),
        element('p', 'task-time', timeLabel(selected) + ' · ' + data.locations[selected.location].name),
        element('p', 'timing muted'), taskBody(selected));
      panel.id = 'lane-detail';
      panel.tabIndex = -1;
      page.append(panel);
    }
  } else page.append(controls);
  const timeline = renderList(tasks);
  if (lanes) timeline.classList.add('print-only');
  page.append(timeline);
  page.append(element('p', 'muted light-note', data.light));
}

function renderBriefing(now) {
  const panel = byId('briefing');
  if (!panel) return;
  const {first, current, next} = briefing(visibleTasks, data.wedding.date, now);
  const rows = [];
  if (first && currentRoute.role) rows.push(['本岗位首项计划', [first]]);
  if (onWeddingDay(data.wedding.date, now)) {
    rows.push(['当前计划时段', current], ['下一项计划', next ? [next] : []]);
  }
  panel.hidden = !rows.length;
  if (!rows.length) return;
  const focusedTask = document.activeElement?.dataset?.briefTask;
  const showJump = onWeddingDay(data.wedding.date, now) && (current.length || next);
  const key = JSON.stringify([rows.map(([title, tasks]) => [title, tasks.map(task => task.id)]), Boolean(showJump)]);
  if (panel.dataset.key === key) return;
  panel.dataset.key = key;
  panel.replaceChildren(...rows.map(([title, tasks]) => element('div', 'brief-group', element('h3', '', title),
    ...tasks.map(task => {
      const anchor = link(timeLabel(task) + ' · ' + task.title, href('day', currentRoute.role, task.id));
      anchor.dataset.briefTask = task.id;
      anchor.addEventListener('click', event => {
        if (location.hash !== anchor.hash) return;
        event.preventDefault();
        revealTask();
      });
      return element('div', 'next-task', anchor, element('p', 'muted', data.locations[task.location].name),
        element('p', 'cue', task.startSignal));
    }), tasks.length ? null : element('p', 'muted', '暂无'))));
  if (showJump) panel.append(button('回到当前时间', () => showTask(current[0] || next), 'primary'));
  if (focusedTask) panel.querySelector('[data-brief-task="' + focusedTask + '"]')?.focus({preventScroll: true});
}

function paintTime() {
  if (currentRoute?.page !== 'day') return;
  const now = Date.now();
  renderBriefing(now);
  for (const task of visibleTasks) {
    const timing = taskTiming(task, data.wedding.date, now);
    const card = byId('task-' + task.id);
    card.classList.toggle('is-now', timing === 'current');
    const label = task.status === '已完成' ? '已完成' :
      timing === 'current' ? '当前计划时段' : timing === 'past' ? '计划时间已过' : '';
    card.querySelector('.timing').textContent = label;
    const panel = byId('lane-detail');
    if (panel && currentRoute.task === task.id) panel.querySelector('.timing').textContent = label;
    for (const node of document.querySelectorAll('[data-task="' + task.id + '"]')) {
      node.classList.toggle('is-now', timing === 'current');
      node.classList.toggle('is-past', timing === 'past');
    }
  }
}

function renderChecklist(page) {
  page.append(element('h2', '', '婚前确认'), element('p', 'support-intro', '确认结果由维护者发布。关联任务需要同步核对。'));
  const today = Date.now();
  const entries = [...data.checklist].sort((a, b) => a.due.localeCompare(b.due));
  const rows = entries.map(check => {
    const overdue = today >= dayStart(check.due) + 86400000 && check.status === '待确认';
    const related = element('div', 'pills related screen-only',
      ...check.relatedTasks.map(id => link(data.tasks.find(task => task.id === id).title, href('day', '', id))));
    return element('li', 'check-item', element('time', 'deadline', check.due),
      element('div', 'check-body', element('strong', '', check.ownerLabel || roleNames(check.owners)),
        badge(check.status), overdue ? badge('已过截止日期') : null, element('p', '', check.deliverable),
        element('p', 'muted', check.notes), related));
  });
  page.append(element('ol', 'checklist', ...rows));
}

function contingencyContent(print = false) {
  const weather = data.weather;
  const current = activeWeather();
  const plans = element('div', 'weather-plans');
  for (const plan of weather.options) {
    if (print && current && plan !== current) continue;
    const card = element('details', 'weather-plan' + (plan === current ? ' chosen' : ''),
      element('summary', '', plan.id + ' · ' + plan.name, plan === current ? badge('当前方案') : null),
      element('div', '', paragraph('启动条件', plan.condition), paragraph('分工与准备', plan.actions)));
    card.open = print || plan === current;
    plans.append(card);
  }
  const tasks = planTasks(data);
  const decisions = weather.nodes.map(({task, label}) => {
    const entry = tasks.find(item => item.id === task);
    return clock(entry.start) + ' ' + label + (entry.status === '暂定' ? '（暂定）' : '');
  });
  return element('div', '', element('p', 'support-intro',
    current ? '当前方案 · ' + current.id + ' ' + current.name : '当前方案 · 待统筹确认'),
    weather.decisionNote ? element('p', 'muted', weather.decisionNote) : null,
    element('h3', '', '判断节点'), list('ul', decisions), element('p', 'muted', weather.timing), plans,
    element('section', 'instructions', element('h3', '', '切换步骤'), list('ol', weather.switchSteps),
      element('h3', '', '延误处理'), element('p', '', data.handoff.delay)));
}

function renderTeam(page) {
  page.append(element('h2', '', '工作人员'), element('p', 'support-intro', data.handoff.contactOrder));
  for (const [id, role] of Object.entries(data.roles)) {
    page.append(element('article', 'role-card',
      element('h3', '', role.name), element('p', '', role.duty),
      paragraph('对接岗位', roleNames(role.partners)), paragraph('替补', role.backup),
      element('p', 'muted', role.contact), element('div', 'pills screen-only',
        link('查看岗位排程', href('day', id)), button('复制岗位链接', () => share(href('day', id))))));
  }
  page.append(element('p', 'muted', data.handoff.distribution));
}

function renderPage() {
  currentRoute = route(location.hash, data, location.search);
  const {page, role} = currentRoute;
  document.title = (role ? data.roles[role].name : pageNames[page]) + ' · ' + data.wedding.title;
  byId('navigation').replaceChildren(...Object.entries(pageNames).map(([id, label]) => link(label, href(id), page === id)));
  const content = byId('page');
  content.replaceChildren();
  visibleTasks = forRole(planTasks(data), role);
  if (page === 'day') renderDay(content, visibleTasks);
  if (page === 'checklist') renderChecklist(content);
  if (page === 'contingency') content.append(element('h2', '', '现场预案'), contingencyContent());
  if (page === 'team') renderTeam(content);
  byId('print-weather').hidden = page === 'contingency';
  paintTime();
}

function revealTask() {
  if (!currentRoute.task) return;
  const panel = byId('lane-detail');
  const card = byId('task-' + currentRoute.task);
  if (!card) return;
  const details = card.querySelector('details');
  card.closest('.stage').open = true;
  details.open = true;
  card.classList.add('linked');
  const anchor = panel || details.querySelector('summary');
  anchor.scrollIntoView({block: 'start'});
  anchor.focus({preventScroll: true});
}

function refreshNotice() {
  const notice = byId('updates');
  notice.hidden = !pending;
  if (!pending) return;
  const newer = [pending.release, ...pending.release.history].filter(release => release.version > data.release.version);
  notice.replaceChildren(element('h2', '', '有新安排 · ' + pending.release.version),
    ...[...new Set([pending.release, ...newer])].map(release =>
      element('div', '', element('strong', '', release.version), list('ul', release.changes))),
    button('更新到新版本', () => {
      data = pending;
      pending = undefined;
      refreshNotice();
      renderHeader();
      renderPage();
      if (visibleTasks.some(task => task.id === currentRoute.task)) revealTask();
    }, 'primary'));
}

async function checkVersion() {
  if (loading) return;
  loading = true;
  const checkLabel = () => ' · 上次检查 ' + formatTime.format(new Date()) + '（北京时间）';
  try {
    const response = await fetch('./data/wedding.json', {cache: 'no-store'});
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const incoming = await response.json();
    if (incoming.schemaVersion !== 1 || !incoming.release?.version || !Array.isArray(incoming.tasks)) {
      throw new Error('排程格式不受支持');
    }
    if (!data) {
      data = incoming;
      const date = data.wedding.date;
      const now = Date.now();
      for (const id of ['welcome', 'ceremony']) allStages.add(id);
      if (onWeddingDay(date, now)) {
        for (const task of planTasks(data)) if (taskTiming(task, date, now) === 'current') allStages.add(task.stage);
      }
      renderHeader();
      renderPage();
      revealTask();
    } else {
      const nextPending = incoming.release.version === data.release.version ? undefined : incoming;
      if (pending?.release.version !== nextPending?.release.version) {
        pending = nextPending;
        refreshNotice();
      }
    }
    byId('last-check').textContent = '已检查排程' + checkLabel();
  } catch (error) {
    if (currentRoute && data) byId('last-check').textContent = '暂时无法检查更新 · 当前版本 ' + data.release.version + checkLabel();
    else {
      data = undefined;
      byId('site-status').replaceChildren('排程暂时无法载入。', button('重试', checkVersion));
    }
    console.error(error);
  } finally {
    loading = false;
  }
}

document.querySelector('.skip').addEventListener('click', event => {
  event.preventDefault();
  byId('main').focus();
});
window.addEventListener('hashchange', () => {
  if (!data) return;
  if (location.hash === '#main') return;
  const previous = currentRoute;
  const next = route(location.hash, data, location.search);
  if (next.role !== previous.role || next.page !== previous.page ||
    (next.task && next.task !== previous.task && laneStage !== 'all' &&
      visibleTasks.find(task => task.id === next.task)?.stage !== laneStage)) laneStage = '';
  renderPage();
  if (next.task) revealTask();
  else if (next.page !== previous.page || next.role !== previous.role) {
    window.scrollTo(0, 0);
    byId('main').focus({preventScroll: true});
  }
});
desktop.addEventListener('change', () => {if (data) renderPage();});
byId('history-button').addEventListener('click', () => byId('history').showModal());
byId('share').addEventListener('click', () => share(href(currentRoute.page, currentRoute.role, currentRoute.task)));
byId('print').addEventListener('click', () => window.print());
window.addEventListener('beforeprint', () => {
  printDetails = [...byId('main').querySelectorAll('details:not([open])')];
  for (const detail of printDetails) detail.open = true;
});
window.addEventListener('afterprint', () => {
  for (const detail of printDetails) detail.open = false;
  printDetails = [];
});
window.addEventListener('focus', checkVersion);
document.addEventListener('visibilitychange', () => {if (!document.hidden) checkVersion();});
setInterval(() => {if (!document.hidden) {paintTime(); checkVersion();}}, 60000);
checkVersion();
