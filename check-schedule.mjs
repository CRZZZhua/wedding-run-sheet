import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const data = JSON.parse(readFileSync(new URL('./schedule.json', import.meta.url), 'utf8'));
const stages = new Set(data.stages.map((stage) => stage.id));
const roles = new Set(Object.keys(data.roles));
const taskIds = new Set();
const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

assert(Number.isFinite(Date.parse(`${data.date}T00:00:00+08:00`)), '婚礼日期无效');
assert(data.version.updatedAt.endsWith('+08:00') && Number.isFinite(Date.parse(data.version.updatedAt)), '版本时间无效');
assert(data.weather.selected === null || data.weather.options.some((plan) => plan.id === data.weather.selected),
  '请选择有效的雨备方案或 null');
for (const task of data.tasks) {
  assert(/^[a-z0-9-]+$/.test(task.id) && !taskIds.has(task.id), `任务编号无效或重复 · ${task.id}`);
  assert(stages.has(task.stage), `未知流程阶段 · ${task.id}`);
  assert(time.test(task.start) && (!task.end || (time.test(task.end) && task.end > task.start)),
    `任务时间无效 · ${task.id}`);
  assert([task.lead, ...task.with].every((role) => roles.has(role)), `任务引用了未知岗位 · ${task.id}`);
  assert(task.title && task.area && task.action && task.status, `任务缺少展示字段 · ${task.id}`);
  taskIds.add(task.id);
}

console.log(`排程校验通过 · ${taskIds.size} 个任务 · ${roles.size} 个岗位`);
