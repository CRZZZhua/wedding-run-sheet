
export const roleIds = ['coordinator', 'restaurant', 'welcome', 'photo', 'styling', 'audio', 'decor', 'couple', 'helpers'];
export const stageIds = ['prep', 'welcome', 'ceremony', 'photos', 'dinner', 'close'];
export const pageNames = {day: '当天流程', checklist: '婚前确认', contingency: '现场预案', team: '工作人员', activities: '活动灵感'};
export const onWeddingDay = (date, now) => now >= dayStart(date) && now < dayStart(date) + 86400000;
export const dayStart = date => Date.parse(date + 'T00:00:00+08:00');
export const clock = value => value.slice(11, 16);
export const timeLabel = task => clock(task.start) + (task.end ? '–' + clock(task.end) : task.kind === 'open' ? ' 起' : '');
export const people = task => [task.lead, ...task.withRoles];

export function planTasks(data) {
  const adjustments = data.weather.options.find(plan => plan.id === data.weather.selected)?.adjustments ?? {};
  return data.tasks.map(task => ({...task, ...adjustments[task.id]}))
    .sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
}

export function forRole(tasks, role) {
  return role ? tasks.filter(task => people(task).includes(role)) : tasks;
}

export function route(hash, data, search = '') {
  const [path, query] = hash.slice(2).split('?');
  const legacyPages = {'#checklist': 'checklist', '#weather': 'contingency', '#contacts': 'team'};
  const page = hash.startsWith('#/') && Object.hasOwn(pageNames, path) ? path :
    Object.hasOwn(legacyPages, hash) ? legacyPages[hash] : 'day';
  const params = new URLSearchParams(hash.startsWith('#/') ? query : search);
  const role = params.get('role');
  const legacy = hash.startsWith('#task-') ? hash.slice(6) : '';
  const task = page === 'day' ? params.get('task') || legacy : '';
  const aliases = {'bride-entry': 'ceremony-entrance', 'groom-handoff': 'garden-seating'};
  return {page, role: page === 'day' && Object.hasOwn(data.roles, role) ? role : '',
    task: Object.hasOwn(aliases, task) ? aliases[task] : task};
}

export function href(page = 'day', role = '', task = '') {
  const params = new URLSearchParams();
  if (role) params.set('role', role);
  if (task) params.set('task', task);
  return '#/' + page + (params.size ? '?' + params : '');
}

export function taskTiming(task, date, now) {
  const start = Date.parse(task.start);
  const end = task.end ? Date.parse(task.end) : task.kind === 'open' ? dayStart(date) + 86400000 : start + 60000;
  if (now >= end) return 'past';
  return now >= start ? 'current' : 'future';
}

export function briefing(tasks, date, now) {
  if (now < dayStart(date)) return {first: tasks[0], current: [], next: null};
  if (!onWeddingDay(date, now)) return {current: [], next: null};
  return {current: tasks.filter(task => taskTiming(task, date, now) === 'current'),
    next: tasks.find(task => Date.parse(task.start) > now)};
}

export function laneTracks(tasks, axisEnd, pixelsPerMinute = 0) {
  const tracks = [];
  return tasks.map(task => {
    const start = Date.parse(task.start);
    const end = task.end ? Date.parse(task.end) : task.kind === 'open' ? axisEnd : start + 60000;
    // Reserve space for short labels without inflating duration bars.
    const width = (end - start) / 60000 * pixelsPerMinute;
    const labelWidth = task.kind === 'point' ? 128 : width < 48 ? 85 : 0;
    const collisionEnd = pixelsPerMinute ? Math.max(end, start + labelWidth / pixelsPerMinute * 60000) : end;
    const available = tracks.findIndex(until => start >= until);
    const row = available < 0 ? tracks.length : available;
    tracks[row] = collisionEnd;
    return {task, start, end, row};
  });
}
