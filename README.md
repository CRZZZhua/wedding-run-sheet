# 广州庭院婚礼执行台

站点面向工作人员，按北京时间展示公开脱敏排程。统筹负责发布版本。临时改时和雨备切换先发微信群口令，再更新网页。

## 本地预览

在本目录运行 `python -m http.server 8000 --bind 127.0.0.1`，打开 `http://127.0.0.1:8000/`。音响岗位示例为 `http://127.0.0.1:8000/?role=audio`。站点通过 HTTP 读取排程文件。

## 更新执行表

- 编辑 `schedule.json`。任务按开始时间填写，使用 24 小时制。时间段填 `start` 与 `end`，单个节点只填 `start`，从某时开始但结束时间未定的任务额外填 `ongoing: true`。
- 每条任务在 `lead` 填负责岗位，在 `with` 填协作岗位。总览和岗位页共用任务，已分发链接依赖岗位键名。
- 定场后将 `weather.selected` 改为 `"A"`、`"B"` 或 `"C"`，将可公开的口令摘要写入 `weather.decisionNote`。待定时使用 `null`。
- 更新 `version.updatedAt`，使用带 `+08:00` 的 ISO 时间。用 `version.summary` 说明本次变更。确认项完成后更新对应的 `status`。
- 运行 `node check-schedule.mjs` 检查任务编号、时间、岗位引用和雨备方案。
- 提交前核对所有公开文件和版本历史。原始 Word、具体场地、姓名电话、宾客名单及具体动线留在微信群等私下资料中。

## 发布与分发

1. 将本目录作为独立 GitHub 仓库的根目录，仓库名使用 `wedding-run-sheet`。只提交本目录下经审阅的站点文件。
2. 推送 `main` 后，在 **Settings → Pages → Build and deployment** 选择 **Deploy from a branch**，保存 **main / (root)**。等待 Pages 部署成功。
3. 在未登录的浏览器验证 `https://<账号>.github.io/wedding-run-sheet/`，再用微信分别测试移动网络和场地 Wi-Fi。
4. 婚礼前一天逐组打开岗位，点击「复制链接」发到对应群。点击「打印排程」生成带版本日期的岗位打印件。
5. 当天出现变更时，统筹先发受影响岗位、生效时间和新口令。提交修订后检查 Pages 部署结果，再刷新总览和受影响岗位链接核对同一版本。

[GitHub Pages 发布源配置](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
