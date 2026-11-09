
# 广州庭院婚礼执行台

2027 年 1 月 2 日的手机优先执行表。所有时间使用北京时间。页面展示已发布的安排，开场、音乐、上菜、开餐调整及天气切换由统筹在工作群和对讲中发出口令。

## 本地预览和检查

在本目录运行以下命令。Node.js 24 用于数据校验，网页本身只需要静态 HTTP 服务。

```sh
node scripts/check.mjs
python -m http.server 8000 --bind 127.0.0.1 --directory site
```

在浏览器打开 [本地总览](http://127.0.0.1:8000/#/day) 或 [音响入场任务](http://127.0.0.1:8000/#/day?role=audio&task=ceremony-entrance)。站点文件位于 `site/`，所有资源采用相对地址。

## 维护排程

排程集中在 `site/data/wedding.json`。编辑后提交 Pull Request 或推送至 `main`。工作流检查字段、时间、引用、版本和公开文件，同时报告同一主责的重叠时段。

| 修改事项 | 对应字段 |
|---|---|
| 时间和任务 | 在 `tasks` 中使用 `2027-01-02T15:29:00+08:00` 格式。持续任务使用 `kind: "range"` 和完整结束时间。单节点使用 `"point"`，结束未定使用 `"open"`，两者的 `end` 均为 `null`。 |
| 地点和岗位 | `location` 引用 `locations` 中的 ID。修改 `lead` 和 `withRoles` 可同步更新岗位视图。实际职责待确认时保留 `assignmentPending: true`。 |
| 状态和物资 | 可选项目设 `optional: true`。只有维护者确认完成后才将 `status` 改为 `"已完成"`。步骤、开始条件、交接与物资分别在 `steps`、`startSignal`、`handoff` 和 `supplies` 中维护。 |
| 婚前确认 | 在 `checklist` 改状态或备注，查看 `relatedTasks` 并同步修订受影响的当天任务。 |
| 天气切换 | 统筹先下达现场指令。将 `weather.selected` 设为 `"A"`、`"B"` 或 `"C"`，在 `decisionNote` 记录公开口令摘要。等待决定时使用 `null`。在相应方案的 `adjustments` 按任务 ID 更新 `location`、`start`、`end` 或 `note`。未知位置、容量、动线继续标为待确认。 |
| 更新版本 | 将上一版的 `version`、`updatedAt` 和 `changes` 放入 `release.history` 开头，填写新版 `YYYYMMDD-NN`、带 `+08:00` 的更新时间以及具体变更。 |

改标题或时间时保留任务 ID。工作人员打开网页后按版本提示更新，也可以刷新原岗位链接。

原始 Word、私人联络信息、具体动线、实名名单和个人饮食资料由工作群管理。只将经过核对的公开内容提交至仓库。检查工具识别常见完整电话号码和邮箱，姓名与其他私密内容需要人工核对。

## 发布和恢复

1. 在仓库 **Settings → Pages → Build and deployment** 选择 **GitHub Actions**，并开启 **Enforce HTTPS**。
2. 合并至 `main` 后，`.github/workflows/pages.yml` 依次检查、打包 `site/`、发布到 `github-pages` 环境。部署步骤提供访问地址。
3. 用无登录窗口验证首页、更新时间和音响任务分享链接。工作人员在更多操作中可打印当前岗位排程。
4. 若检查失败，修正后重新提交。若发布了错误排程，使用 `git revert <提交>` 并推送。恢复历史排程原样内容仍须通过数据检查。涉及多次变更时，也可以在当前版本基础上恢复正确排程并发布新版本。
5. 重新核对总览和受影响岗位。现场急变先发工作群与对讲，等部署完成后核对网页版本。

[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) · [HTTPS 设置](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)
