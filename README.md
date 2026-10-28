# 跑地图工具站 · site-tools

[English](README.en.md) · 中文

`tools.paobu.org` 的网站工程：配速、分段、跑走结合、比赛预测、补给计划、轨迹查看与转换/简化、高程分析、鞋里程、比赛清单和路线参数比较。工具说明和契约来自 `running-tools`，共享布局与地理计算来自 `@paobu/core`，计算与文件处理代码在本仓库。

## 当前状态

- 工具站已部署到 GitHub Pages，线上地址为 `https://tools.paobu.org/`；Pages 与 HTTPS 已启用。
- 十二项工具已于 2026-10-28 完成 **AI 辅助编辑审阅**并发布；每项有双语 `approve` 记录和匹配 contentDigest。审阅身份明确标注为 AI 辅助，不是独立专业审阅；限制见 site-www 的 [ai-review-report.md](../site-www/evidence/2026-10-28/review/ai-review-report.md)。
- 路线比较只读取已发布路线；当前 16 条路线已发布，因此比较页有真实可选记录。
- 本地发布准备已建立：生产构建会生成 `CNAME`、`.nojekyll`、`robots.txt`、`sitemap.xml`、`release-manifest.json`、PWA manifest、`sw.js` 与离线页；`.github/workflows/pages.yml` 已成功部署，`https://tools.paobu.org/` 已启用 HTTPS。当前 64 实体生产构建中，工具站有 31 个静态页面、发布清单 28 页、Pagefind 24 条记录、sitemap 28 个 URL；生产工具可见 12 项，`pnpm check:production` 通过。
- T12 的轨迹慢提示、30 秒超时与取消状态已在 `site-www` 的 `pnpm qa:track` 中通过；它用挂起 Worker 和缩短计时器模拟，不代表真实低端设备的处理速度。T1 新工具的浏览器检查与 38 项单元测试通过；T1 批次与法律/文风更新已于 2026-10-28 完成；工具站新增中英文 `/legal/` 页面，工具页显示估算与本地文件法律提示。

## 技术基线

- Node.js `>=22.23.4 <25`，pnpm 10.18.3，Astro 7.4.2，TypeScript 5.9.3。
- `output: 'static'`、尾斜杠目录输出，规范域名为 `https://tools.paobu.org`。
- 计算不依赖后端：纯算术在客户端函数中执行；GPX/GeoJSON 解析、测地距离与简化在 Web Worker 中执行。
- `fast-xml-parser` 5.11.2，Pagefind 1.5.2。
- `@paobu/core` 0.2.15，来自 `vendor/paobu-core.tgz`；`core.lock.json` 记录制品 SHA-256 `8e2645102a7a8ebcabf56db44ceb49c4d16df54478be489919979fb4a72eaeae`。

## 工具与代码位置

| 工具 | 主要实现 |
|---|---|
| 配速 `pace` | `src/lib/calculators.ts`，三模式与单位换算 |
| 分段 `splits` | `src/lib/calculators.ts`，等配速/负分段与最大余数分配 |
| 跑走结合 `run-walk` | `src/lib/calculators.ts`，循环与总时长排程 |
| 比赛预测 `race-predict` | `src/lib/calculators.ts`，Riegel 1.06，距离 5000–42195 米 |
| 补给计划 `fueling-planner` | `src/lib/fueling.ts`，按小时 30–60g 范围与产品份数换算 |
| 高程分析 `route-elevation` | `src/lib/elevation.ts`、`src/workers/elevation.worker.ts`，累计升降与坡度 |
| 鞋里程 `shoe-mileage` | `src/lib/shoe-mileage.ts`，初始里程、累计里程与用户自设提醒 |
| 比赛清单 `race-checklist` | `src/lib/race-checklist.ts`，按天气、地形、时长和旅行条件生成条目 |
| 轨迹查看 `track-view` | `src/lib/parse-track.ts`、`src/lib/track.ts`、`src/workers/track.worker.ts` |
| 格式转换 `track-convert` | `src/lib/parse-track.ts`、`src/lib/serialize-track.ts`、`src/workers/transform.worker.ts` |
| 轨迹简化 `track-simplify` | `src/lib/simplify-track.ts`、`src/workers/transform.worker.ts` |
| 路线比较 `route-compare` | `src/lib/route-compare.ts`，只读取已发布路线字段 |

`src/client/calculators.ts`、`src/client/fueling.ts`、`src/client/route-elevation.ts`、`src/client/shoe-mileage.ts` 与 `src/client/race-checklist.ts` 负责表单、错误提示、进度、取消、下载和结果渲染；`src/pages/[...locale]/tools/[slug].astro` 负责工具页结构与双语文案。公式描述、假设、舍入和算例在内容仓库，不在本仓库重复维护。

## 本地运行

六个工程应位于同一父目录。共享核心由 `site-www` 打包，本仓库只同步和安装制品：

```bash
# 先确保 site-www 已生成 core-dist/paobu-core-<version>.tgz
cd site-tools
pnpm core:sync
pnpm install
pnpm test
pnpm test:content
pnpm check
pnpm build
pnpm dev
```

- 开发：`http://localhost:4323`，语言入口 `/` 与 `/en/`。
- 预览构建：`pnpm preview`，`http://localhost:4423`。构建时跨站链接按实际加载的 `.env` 生成（当前指向开发端口），验证跳转需同时运行对应站点；生产构建必须显式覆盖三个来源，否则 `.env` 的 localhost 会进入 HTML。
- 单元测试：`pnpm test`（`tsx --test tests/*.ts`），当前 38 项，覆盖配速/分段/跑走/预测、轨迹解析/转换/简化、路线比较、补给、高程、鞋里程和比赛清单。
- 生产模式：`PREVIEW_UNREVIEWED=0 pnpm build` 生成发布文件；`pnpm check:production` 当前通过（12 个工具已发布）。
- 内容校验：`pnpm test:content`。
- 类型与 Astro 检查：`pnpm check`。
- 构建：`pnpm build` 执行 Astro 静态构建和 Pagefind 后处理。

核心升级流程：在 `site-www` 运行 `pnpm core:pack`，在此运行 `pnpm core:sync && pnpm install --force`，确认 `core.lock.json` 与安装版本一致。不要改用 `workspace:*`，也不要复制 `packages/core` 源码。

内容目录可用 `PAOBU_REPOS_DIR` 指向父目录，或用 `TOOLS_CONTENT_DIR` 覆盖。生产构建必须确保实际生效的环境文件中 `PREVIEW_UNREVIEWED=0` 或未设置；本地 `.env` 当前为 `1`，发布前应修改或移除。

## 浏览器边界

- 轨迹文件只在本地读取，不上传、不写分析日志、不进入仓库。
- 单文件最多 20,000,000 字节、200,000 个坐标点；超限直接拒绝，不截断后继续。
- 解析与几何计算在 Worker 中执行；超过 10 秒显示可取消提示，超过 30 秒终止，不提供不完整下载。
- 拒绝 DTD、外部实体、非线几何、无效坐标与非有限数值。
- 转换会重新序列化几何并移除时间、设备与人员元数据；缺少高程保持缺失。
- 简化逐段执行，不连接分段；容差在局部投影平面内计算，与输出的 WGS84 距离变化分开报告。
- 路线比较只读取已发布路线，缺失字段显示未知，不生成安全、难度或适配性排名。

## 内容锁

在交接包根目录运行：

```bash
node scripts/content-lock.mjs          # 重新生成三个站点的 content.lock.json
node scripts/content-lock.mjs --verify # 校验内容树未变化
```

`sha256-tree-v1` 覆盖三个内容仓库的 `content/`、`data/` 和 `assets/`。锁中的 `commit` 已固定为完整 SHA：`running-routes` `0cd00cda…`、`running-knowledge` `a879da16…`、`running-tools` `4a8a3885…`。锁用于本地可复现构建，不代替 Git。

## 外部配置与发布边界

- 工具在浏览器本地工作，不需要服务端运行时、数据库或第三方计算 API。
- 跨子域链接使用 `PUBLIC_ROUTES_ORIGIN`、`PUBLIC_KNOWLEDGE_ORIGIN` 与 `PUBLIC_TOOLS_ORIGIN`；生产默认值在核心中，本地 `.env` 指向三个本地端口。
- GitHub 仓库、DNS 与 Pages 已配置：六个仓库位于 `paobuorg`，三站 Pages 已上线并启用 HTTPS。本仓库工作流使用 `PAOBU_CORE_ARTIFACT_URL`、`PAOBU_CORE_SHA256` 仓库变量；T1 批次线上工具已验证，证据见 site-www 的 [remote-status.json](../site-www/evidence/2026-10-28/release/remote-status.json)。

## 许可

- 网站代码：MIT。
- 工具说明与算例：`running-tools` 仓库许可；新写说明为 CC BY 4.0。
- 公式来源、标准与论文保留各自权利，按来源页面引用。

最后核对日期：2026-10-28。
