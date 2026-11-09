
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {briefing, forRole, href, laneTracks, planTasks, roleIds, route, stageIds, taskTiming, timeLabel} from '../site/model.mjs';

const base = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : null;
const data = JSON.parse(readFileSync('site/data/wedding.json', 'utf8'));
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const required = (object, keys, path) => {
  assert(isObject(object), path + ' 必须为对象');
  for (const key of keys.split(' ')) assert(Object.hasOwn(object, key), path + ' 缺少 ' + key);
};
const string = (value, label, empty = false) =>
  assert(typeof value === 'string' && (empty || value.trim()), label + ' 必须为文本');
const strings = (array, label) => {
  assert(Array.isArray(array), label + ' 必须为数组');
  array.forEach(value => string(value, label));
};
const date = (value, label) => {
  assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, label + ' 日期无效');
};
const timestamp = (value, label, day) => {
  assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\+08:00$/.test(value) &&
    Number.isFinite(Date.parse(value)), label + ' 必须为有效的 +08:00 时间');
  date(value.slice(0, 10), label);
  if (day) assert(value.startsWith(day + 'T'), label + ' 必须在婚礼当天');
  return Date.parse(value);
};
const ids = (items, label) => {
  assert(Array.isArray(items), label + ' 必须为数组');
  const values = items.map(item => item?.id);
  values.forEach(id => assert(typeof id === 'string' && /^[a-z][a-z0-9-]*$/.test(id), label + ' ID 无效'));
  assert.equal(new Set(values).size, values.length, label + ' ID 重复');
  return values;
};
const refs = (values, allowed, label) => {
  strings(values, label);
  assert.equal(new Set(values).size, values.length, label + ' 有重复引用');
  values.forEach(value => assert(allowed.includes(value), label + ' 的引用不存在 ' + value));
};

required(data, 'schemaVersion wedding release roles locations stages tasks milestones checklist weather handoff light', '排程');
assert.equal(data.schemaVersion, 1);
required(data.wedding, 'title date timezone venue', '婚礼信息');
assert.equal(data.wedding.timezone, 'Asia/Shanghai');
date(data.wedding.date, '婚礼');
for (const key of ['title', 'venue']) string(data.wedding[key], key);
string(data.light, '光线参考');

function release(entry) {
  required(entry, 'version updatedAt changes', '发布记录');
  timestamp(entry.updatedAt, '发布时间');
  assert(typeof entry.version === 'string' && /^\d{8}-\d{2}$/.test(entry.version) &&
    entry.version.startsWith(entry.updatedAt.slice(0, 10).replaceAll('-', '')), '版本须使用更新时间对应的 YYYYMMDD-NN');
  strings(entry.changes, '变更说明');
  assert(entry.changes.length > 0, '缺少变更说明');
}
release(data.release);
assert(Array.isArray(data.release.history), '缺少版本历史');
let priorVersion = data.release.version;
for (const entry of data.release.history) {
  release(entry);
  assert(entry.version < priorVersion, '历史版本须按降序排列且不得重复');
  priorVersion = entry.version;
}
assert.deepEqual(Object.keys(data.roles).sort(), [...roleIds].sort(), '岗位 ID 与固定岗位清单不一致');
for (const [id, role] of Object.entries(data.roles)) {
  required(role, 'name duty partners backup contact', id);
  for (const key of ['name', 'duty', 'backup', 'contact']) string(role[key], id + '.' + key);
  refs(role.partners, roleIds, id + ' 对接岗位');
  assert.equal(role.contact, '联系方式见工作群');
}
const places = Object.keys(data.locations);
for (const [id, area] of Object.entries(data.locations)) {
  assert(/^[a-z][a-z0-9-]*$/.test(id), '地点 ID 无效 ' + id);
  required(area, 'name note status', id);
  for (const key of ['name', 'note']) string(area[key], id + '.' + key);
  assert(['已确认', '待确认'].includes(area.status), id + ' 地点状态无效');
}
assert.deepEqual(ids(data.stages, '阶段'), stageIds);
data.stages.forEach(stage => string(stage.name, '阶段名称'));

function taskTimes(task) {
  const start = timestamp(task.start, task.id + ' 开始', data.wedding.date);
  assert(['range', 'open', 'point'].includes(task.kind), task.id + ' 类型无效');
  if (task.kind === 'range') assert(timestamp(task.end, task.id + ' 结束', data.wedding.date) > start, task.id + ' 结束时间须晚于开始时间');
  else assert.equal(task.end, null, task.id + ' 节点或开放结束时间须为空');
}
const taskIds = ids(data.tasks, '任务');
assert(taskIds.length, '缺少任务');
for (const task of data.tasks) {
  required(task, 'id stage title start end kind location lead withRoles status optional assignmentPending action steps startSignal handoff supplies helperDuty source', '任务');
  for (const key of ['title', 'action', 'startSignal', 'handoff', 'source']) string(task[key], task.id + '.' + key);
  string(task.helperDuty, task.id + ' 亲友分工', true);
  assert(stageIds.includes(task.stage), task.id + ' 阶段无效');
  refs([task.location], places, task.id + ' 地点');
  assert(Array.isArray(task.withRoles), task.id + ' 配合岗位须为数组');
  refs([task.lead, ...task.withRoles], roleIds, task.id + ' 岗位');
  assert(['计划', '暂排', '暂定', '待确认', '机动', '已完成'].includes(task.status), task.id + ' 任务状态无效');
  for (const key of ['optional', 'assignmentPending']) assert.equal(typeof task[key], 'boolean', task.id + '.' + key);
  for (const key of ['steps', 'supplies']) strings(task[key], task.id + '.' + key);
  taskTimes(task);
}
assert(Array.isArray(data.milestones) && data.milestones.length, '缺少关键时间');
for (const entry of data.milestones) {
  required(entry, 'from label', '关键时间');
  string(entry.label, '关键时间标题');
  refs(entry.through ? [entry.from, entry.through] : [entry.from], taskIds, '关键时间任务');
}

ids(data.checklist, '婚前确认');
for (const check of data.checklist) {
  required(check, 'id due owners deliverable status notes relatedTasks source', '婚前确认');
  date(check.due, check.id + ' 截止');
  assert(check.due < data.wedding.date, check.id + ' 须在婚礼前截止');
  refs(check.owners, roleIds, check.id + ' 责任岗位');
  assert(check.owners.length, check.id + ' 缺少责任岗位');
  refs(check.relatedTasks, taskIds, check.id + ' 关联任务');
  for (const key of ['deliverable', 'source']) string(check[key], check.id + '.' + key);
  string(check.notes, check.id + ' 备注', true);
  if (check.ownerLabel !== undefined) string(check.ownerLabel, check.id + ' 岗位标题');
  assert(['待确认', '已确认', '不适用'].includes(check.status), check.id + ' 状态无效');
}
required(data.weather, 'selected decisionNote timing nodes options switchSteps', '预案');
assert([null, 'A', 'B', 'C'].includes(data.weather.selected), '当前方案无效');
string(data.weather.decisionNote, '定场说明', true);
string(data.weather.timing, '倒推说明');
strings(data.weather.switchSteps, '切换步骤');
assert(data.weather.switchSteps.length, '缺少切换步骤');
assert(Array.isArray(data.weather.nodes) && data.weather.nodes.length, '缺少天气节点');
refs(data.weather.nodes.map(node => node.task), taskIds, '天气节点');
data.weather.nodes.forEach(node => string(node.label, '天气节点标题'));
assert.deepEqual(data.weather.options.map(plan => plan.id), ['A', 'B', 'C']);
for (const plan of data.weather.options) {
  required(plan, 'id name condition actions adjustments', '天气方案');
  for (const key of ['name', 'condition', 'actions']) string(plan[key], plan.id + '.' + key);
  assert(isObject(plan.adjustments), plan.id + ' 任务调整须为对象');
  for (const [id, adjustment] of Object.entries(plan.adjustments)) {
    assert(taskIds.includes(id), plan.id + ' 调整引用未知任务 ' + id);
    assert(isObject(adjustment) && Object.keys(adjustment).length, '调整必须为非空对象');
    assert(Object.keys(adjustment).every(key => ['location', 'start', 'end', 'note'].includes(key)), '不支持的预案覆盖字段 ' + id);
    if (Object.hasOwn(adjustment, 'location')) refs([adjustment.location], places, plan.id + ' 调整地点');
    if (Object.hasOwn(adjustment, 'note')) string(adjustment.note, plan.id + ' 调整说明');
    taskTimes({...data.tasks.find(task => task.id === id), ...adjustment});
  }
}
required(data.handoff, 'contactOrder delay distribution', '交接');
for (const key of ['contactOrder', 'delay', 'distribution']) string(data.handoff[key], '交接 ' + key);

const allowedFiles = ['.nojekyll', 'app.mjs', 'data/wedding.json', 'index.html', 'model.mjs', 'style.css'];
function publicFiles(dir = 'site') {
  return readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    assert(!entry.isSymbolicLink(), '发布目录不可含符号链接 ' + entry.name);
    const path = dir + '/' + entry.name;
    return entry.isDirectory() ? publicFiles(path) : [path.slice(5)];
  });
}
assert.deepEqual(publicFiles().sort(), allowedFiles);
for (const path of allowedFiles) {
  const content = readFileSync('site/' + path, 'utf8');
  assert(!/(?<![\d-])1[3-9]\d(?:[ -]?\d){8}(?![\d-])|(?:\+86[ -]?)?(?:\(0\d{2,3}\)|0\d{2,3}-)\d{7,8}|[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(content),
    '公开资源疑似包含完整电话号码或邮箱 ' + path);
}

if (base?.schemaVersion === 1 && JSON.stringify(data) !== JSON.stringify(base)) {
  assert(data.release.version > base.release.version, '排程变更须递增版本');
  assert(Date.parse(data.release.updatedAt) > Date.parse(base.release.updatedAt), '排程变更须更新发布时间');
  assert.notDeepEqual(data.release.changes, base.release.changes, '请填写本次变更说明');
  const prior = data.release.history.find(entry => entry.version === base.release.version);
  assert(prior && prior.updatedAt === base.release.updatedAt && JSON.stringify(prior.changes) === JSON.stringify(base.release.changes),
    '请将上版发布信息移入版本历史');
  for (const item of data.checklist) {
    const previous = base.checklist.find(check => check.id === item.id);
    if (previous?.status === item.status) continue;
    console.log('提示：复核确认事项 ' + item.id + ' 的关联任务 ' + item.relatedTasks.join('、'));
    const changed = item.relatedTasks.some(id =>
      JSON.stringify(data.tasks.find(task => task.id === id)) !== JSON.stringify(base.tasks.find(task => task.id === id)));
    if (!changed && item.relatedTasks.length) console.warn('提示：确认状态已改动，关联任务内容未改动，请复核。');
  }
}

for (const plan of [null, ...data.weather.options.map(option => option.id)]) {
  const tasks = planTasks({...data, weather: {...data.weather, selected: plan}}).filter(task => task.kind === 'range');
  for (const [index, task] of tasks.entries()) {
    for (const other of tasks.slice(index + 1)) {
      if (other.start >= task.end) break;
      if (task.lead === other.lead) console.warn('提示：' + (plan || '待定方案') + ' 同一主责时段重叠 ' + task.id + ' / ' + other.id);
    }
  }
}

const tasks = planTasks(data);
const testData = structuredClone(data);
testData.weather.selected = 'B';
const entrance = forRole(tasks, 'audio').find(task => task.id === 'ceremony-entrance');
assert(entrance, '音响须接收入场信号');
assert(entrance.startSignal.includes('统筹'));
const rainy = planTasks(testData).find(task => task.id === entrance.id);
assert.equal(rainy.location, testData.weather.options[1].adjustments[entrance.id].location);
assert.equal(rainy.title, entrance.title);
assert(Object.hasOwn(data.locations, rainy.location));
testData.weather.selected = 'C';
assert.notEqual(planTasks(testData).find(task => task.id === entrance.id).location, rainy.location);
assert(forRole(tasks, 'restaurant').some(task => task.id === 'starter'));
assert(forRole(tasks, 'helpers').some(task => task.id === 'rings'));
assert.deepEqual(route(href('day', 'audio', entrance.id), data), {page:'day', role:'audio', task:entrance.id});
assert.equal(route('#/day?role=bad&task=invalid', data).role, '');
assert.equal(route('#/day?role=bad&task=invalid', data).task, 'invalid');
assert.equal(route('#task-bride-entry', data, '?role=audio').task, entrance.id);
const eventDay = data.wedding.date;
const time = str => Date.parse(eventDay + 'T' + str + ':00+08:00');
assert.equal(timeLabel(entrance), entrance.start.slice(11, 16) + '–' + entrance.end.slice(11, 16));
assert.equal(taskTiming(entrance, eventDay, Date.parse(entrance.start) - 1), 'future');
assert.equal(taskTiming(entrance, eventDay, Date.parse(entrance.start)), 'current');
assert.equal(taskTiming(entrance, eventDay, Date.parse(entrance.end)), 'past');
const audio = forRole(tasks, 'audio');
assert.equal(briefing(audio, eventDay, time('00:00') - 1).first.id, audio[0].id);
const ready = tasks.find(task => task.id === 'dinner-ready');
const simultaneous = briefing(tasks, eventDay, Date.parse(ready.start));
if (data.release.version === '20261109-01') {
  for (const id of ['change', 'dinner-seating', 'dinner-ready']) assert(simultaneous.current.some(task => task.id === id));
  assert.equal(new Set(laneTracks(simultaneous.current, time('18:00')).map(item => item.row)).size, 3);
}
assert.equal(briefing(tasks, eventDay, time('00:00') + 86400000).current.length, 0);
console.log('通过数据、公开文件、分享路由、时间、岗位与天气方案检查。共 ' + tasks.length + ' 项任务。');
