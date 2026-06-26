# 开发日志 — AROCX / ARO 仓序

## 2026-06-26：1.0.9 发布记录

### 本次发布目标

这一版主要处理两类高频操作体验：

1. 企业协作下的数据刷新不要太频繁，但也要保留随时查看最新数据的能力。
2. 发货时如果现场拿到的序列号还没提前入库，应该可以直接补设备并发货，而不是先退出去再录一遍库存。

### 关键功能变更

#### 1. 企业工作区自动刷新改为每 30 分钟

- 云端同步服务的企业工作区轮询间隔由 30 秒调整为 30 分钟。
- 这样能减少多人协作时不必要的频繁拉取，也降低本地与云端持续同步带来的干扰。
- 同时保留原有的企业主工作区模型，企业成员看到的依然是企业统一数据。

#### 2. 顶部新增“手动同步”按钮

- 在主界面顶部工具栏加入了 `手动同步` 按钮。
- 企业成员如果知道同事刚刚改过订单、库存或发货记录，可以立即点击手动同步拉取最新数据。
- 手动同步走的是“只拉云端最新数据”的流程，不会先把当前机器的旧快照反推回服务器。

#### 3. 企业页面同步提示文案统一

- 订单管理、设备库存、发货信息三个页面的企业提示文案已统一。
- 现在会明确告诉用户：
  - 默认每 30 分钟自动刷新一次
  - 也可以点击顶部手动同步立即查看最新数据

#### 4. 发货弹窗支持“入库并发货”

- 在订单管理点击“发货”后，如果输入的序列号当前不在库存中，界面会直接出现 `入库并发货` 操作。
- 这样在实际发货场景里，不需要先退出订单页去库存页补设备，再返回来完成发货。
- 若输入的序列号其实已经存在，但设备当前不是空闲状态，也会明确提示不可直接发货，避免误操作。

#### 5. 本地端与企业端发货链路同时补齐

- Electron 本地数据层新增“创建设备并发货”的处理函数。
- 企业服务端新增接口：
  - `POST /api/enterprise/orders/:orderId/dispatch-with-new-device`
- 这样无论是个人工作区还是企业工作区，都能使用同样的“入库并发货”能力。
- 企业端的服务端校验也一并补齐，确保不同电脑在同一订单上的处理结果一致。

### 官网与发布信息

- 官网静态兜底版本已更新到 1.0.9。
- 官网下载链接与 GitHub Releases 下载地址已经同步切到 1.0.9。
- 首页更新公告也已改为本次版本内容，防止官网展示仍停留在 1.0.8。

### 验证结果

本次改动完成后，已做以下验证：

- `npm run build`
- `npm run typecheck`
- `npx tsc -p server/tsconfig.json --noEmit`

### 备注

- 这一版属于协作体验与发货流程收口版，没有改动付费权益和账号体系。
- Windows 自动更新会在发布后继续沿用 GitHub Release 资源。

## 2026-06-26：1.0.8 发布记录

### 本次发布目标

这一版主要把前面几轮已经定下来的协作逻辑真正收口，重点是三件事：

1. 企业协作必须以企业主的数据空间为准，不能再把成员各自的本地订单拼在一起。
2. 好友代发要留下完整记录，后续查发货、查责任、查单号都不能断线。
3. AI 截图录单要改成统一使用服务器端密钥，不能要求每台客户电脑自己配置。

### 关键功能变更

#### 1. 企业协作改为“企业主工作区”

- 服务端新增企业上下文解析逻辑，统一识别企业 ID、企业主账号、成员角色和企业主订阅状态。
- 企业成员进入订单管理、设备库存、发货信息后，看到的都是企业主账号名下的正式数据。
- 成员加入企业后会立即执行一次拉取同步，本地工作区会切换到企业主的订单和设备快照。
- 成员退出企业后也会立刻重新拉取，把界面切回自己的个人工作区。
- 同步服务新增企业工作区分流：普通账号继续走个人 `/api/sync/*`，企业成员自动切到 `/api/enterprise/sync/*`。

#### 2. 企业工作区的云端同步改成“快照替换”

- 服务端新增企业订单、企业设备的同步接口：
  - `GET /api/enterprise/sync/orders`
  - `POST /api/enterprise/sync/orders`
  - `GET /api/enterprise/sync/devices`
  - `POST /api/enterprise/sync/devices`
- 推送时不再把成员自己的数据插到企业里，而是按企业主工作区做整份快照更新。
- 若本次快照里已经不存在某条订单或设备，服务端会同步删除旧记录，避免脏数据残留。
- 这样可以保证“一个人修改，其他人 30 秒内自动刷新看到”的逻辑真正成立。

#### 3. 好友代发链路补齐

- `orders` 表新增：
  - `friend_dispatch_helper_user_id`
  - `friend_dispatch_helper_email`
- 好友帮忙发货时，服务端会把代发人的账号信息写回原订单。
- 发货信息页新增两种标记：
  - 代发人自己查看时：显示“帮好友代发”
  - 原订单所有者查看时：显示“好友帮忙发”
- 代发记录会进入发货信息，不再是“发了但看不见”的隐形状态。

#### 4. AI 截图录单改为服务器统一密钥

- 新增服务端 OCR 模块：
  - [server/src/ocr-service.ts](/Users/ssdbh/Documents/codex/RJKF/RJKF/server/src/ocr-service.ts)
  - [server/src/routes/ocr.ts](/Users/ssdbh/Documents/codex/RJKF/RJKF/server/src/routes/ocr.ts)
- 新增接口：`POST /api/ocr/extract`
- 客户端截图识别不再调用本地 `data/api-key.txt` 或本地环境变量，而是统一请求云端 OCR 接口。
- 前端删除了本地 API Key 的读写入口，避免客户自行修改识别密钥。
- 如果服务器未配置 OCR key，前端会明确提示“服务器端还没有配置 AI 识别密钥，请联系管理员处理”。

#### 5. 技术支持体验改版

- 新增 [src/renderer/components/SupportEmailModal.tsx](/Users/ssdbh/Documents/codex/RJKF/RJKF/src/renderer/components/SupportEmailModal.tsx)
- 首页与设置页的技术支持入口不再直接强制打开邮箱软件。
- 现在会先弹出邮箱说明框，支持两种动作：
  - 复制邮箱地址
  - 一键调用邮件应用发信
- 这样在客户电脑没配置默认邮件客户端时，也不会显得像“功能失效”。

#### 6. 官网与下载页更新

- 官网首页的功能标签已经支持点击跳转到对应模块说明。
- 新增“回到顶部”按钮，长页浏览更顺手。
- 官网新增 GitHub Releases 入口，用户除了官网下载，也可以直接去 GitHub 获取安装包。
- 官网静态兜底版本信息已更新到 1.0.8，防止接口暂时异常时页面展示旧版本。

#### 7. 正式版默认接口地址切换到域名

- 客户端默认 API 基地址从裸 IP 改为 `https://arocx.fun`
- 设置页里的服务器地址占位文案也同步更新。
- 这样正式版默认会优先走域名入口，减少用户接触裸 IP 和端口号。

### 数据与运维处理

#### 1. 清理测试订单与设备数据

- 已清空服务器中的测试订单、测试设备和订单协作记录。
- 用户账号、订阅状态、激活信息均已保留。
- 清理前做了备份，备份文件位置：
  - `/root/server-backups/manual-clears/pre-clear-orders-devices-2026-06-26T04-57-31-732Z.json`

#### 2. 当前正式环境关键位置

- 正式域名：`https://arocx.fun`
- GitHub Releases：`https://github.com/3330195271-oss/arocx/releases`
- 云端服务目录：`/root/server`
- 安装包上传目录：`/root/server/uploads/app`
- 官网静态文件目录（仓库内）：`server/public/`
- 云端 API 服务：Docker Compose 中的 `api` 服务
- 数据库服务：Docker Compose 中的 `db` 服务

#### 3. 敏感信息记录策略

- 服务器密码、GitHub Token、邮件授权信息这类敏感内容**不写入共享开发日志，也不进入 Git 仓库**。
- 共享日志只记录结构、路径、流程、发布位置与排障信息。
- 这样后续即使仓库推送到 GitHub，也不会把高风险凭证一起带出去。

### 验证结果

本次改动完成后，已做以下验证：

- `npm run typecheck`
- `npm run build`
- `npx tsc -p server/tsconfig.json --noEmit`

在发布前还额外核对了两项线上状态：

- 服务器中的测试订单和设备已经清空，避免新版本演示时再混入旧数据。
- 服务器 OCR 环境变量此前为空，因此本次发布会一并补齐服务器端 OCR 配置，保证截图识别能直接可用。

### 备注

- 下面的历史日志保留了早期“租赁客户转寄助手 / 仓库管理助手”阶段的开发记录，便于回溯旧需求来源。
- 从 1.0.8 开始，建议以后统一使用 `arocx` / `ARO 仓序` 这套命名做版本、官网、安装包和说明文档。

## 项目概述

Windows 桌面应用，用于读取 WPS 共享表格中的客户租赁数据，自动筛选今日到期客户，并根据地址和日期匹配推荐转寄目标。

## 技术栈

- Electron + React + TypeScript
- Vite (electron-vite)
- xlsx 库读取 Excel
- Apple 风格 UI

## 开发时间线

### 2026-05-15：项目初始化

- 使用 electron-vite 创建 Electron + React + TypeScript 项目
- 搭建 Apple 风格 UI（毛玻璃侧边栏、圆角卡片、自定义标题栏）
- 实现地址解析器（省/市/区/街道四级提取）
- 实现转寄匹配逻辑

### 2026-05-15：API 方案尝试（失败）

**问题1：WPS 开放平台注册混淆**
- 用户先在 solution.wps.cn 注册，获取 SX 开头的 APPID
- 后来才在正确的 open.wps.cn 注册，获取 AK 开头的 APPID

**问题2：权限申请流程复杂**
- 创建应用后需申请 drive（云文档）权限
- 企业自建应用审批流程：开发者申请 → 企业管理员在 work.wps.cn 审批 → 创建版本 → 发布
- 关键权限 `interface_company_doc` 不在个人开发者权限列表中，无法开通

**问题3：API 端点不匹配**
- Token 端点：`https://openapi.wps.cn/oauth2/token`（非 `/oauth/2/token`）
- 分享链接转 file_token：`/v7/links/{shareCode}/meta`
- 返回 403 `ErrPrivileges: interface_company_doc`，始终无法通过

**最终放弃 API 方案**，转用本地文件方案。

### 2026-05-15 晚：本地文件方案（成功）

**方案**：用户手动下载共享表格为 .xlsx → 软件读取本地文件

**遇到的问题和解决**：

1. **xlsx 库打包问题**
   - 内置了 xlsx 库读取 Excel，在 Vite SSR 打包时被 Bundle 而非 Externalize
   - 包体积从 8KB 膨胀到 686KB，但不影响功能
   - 改用 `readFileSync` + `XLSX.read(buf)` 方式读取，避免 Windows 路径问题

2. **表头字段匹配失败（0 个客户）**
   - 预设关键词：`姓名、电话、租赁开始、租赁结束`
   - 实际表头：`平台、客户、地址、型号、发货日、起租日、最后一天租期、备注、租金`
   - 修复：新增关键词映射（`客户→name`、`起租日→rentalStart`、`最后一天租期→rentalEnd`、`型号→deviceId`）

3. **姓名和电话嵌入地址字段**
   - 数据格式：`周奇13220301743 重庆渝北区...`
   - 修复：正则提取 `{2-4中文姓名}{11位手机号}` 模式，自动填充 name 和 phone

4. **日期格式解析错误**
   - 原始数据：`6.13`（6月13日）、`5.27`（5月27日）
   - 被错误当作 Excel 序列号转为 `1900-01-05`
   - 修复：`M.D` 格式优先识别（< 100 的小数 = 月.日），大数才按 Excel 序列号处理

5. **地址解析不准确**
   - 原始格式：`上海-上海市-嘉定区-菊园新区秋竹路...`（用 `-` 分隔）
   - 修复：新增 `parseDashFormat` 函数处理破折号分隔的地址
   - 添加 `新区` 到行政区后缀列表

## 匹配规则

### 到期判断
- 租赁结束日 = 今天（YYYY-MM-DD）

### 转寄匹配（三级）
| 级别 | 条件 | 颜色 | 图标 |
|------|------|------|------|
| 同市 | 同一城市 | 绿色 | ★ |
| 同省 | 同省不同市 | 蓝色 | ● |
| 邻省 | 相邻省份 | 橙色 | ○ ⚠注意时效 |

### 必须条件
- 同一型号（deviceId）
- 候选客户**发货日 = 今天**
- 排序：同市 → 同省 → 邻省，同级按日期衔接度

### 邻省表
内置全国 34 个省级行政区的邻接关系表。

## 数据文件

- 格式：.xlsx（Excel）
- 路径：开发模式 `data/`，生产模式 `文档\仓库管理助手\`
- 自动读取目录下最新修改的 `.xlsx` 文件，不限制文件名
- 操作流程：点「📂 打开文件夹」→ 放入 Excel → 点「读取数据」

## 已知问题

1. 邻省匹配未考虑实际物流距离（仅行政邻接）
2. 打包后约 78MB（含 Electron 运行时 + express/multer/xlsx）
3. 多人同时操作时无并发锁（JSON 文件读写可能冲突）

---

## 2026-06-05：设备管理系统升级 + Web 多人协作

### 第一阶段：显示发货日和起租日

**问题**：转寄推荐卡片不显示候选客户的发货日和起租日期。

**修复**：
- Customer 类型新增 `shipmentDate`（发货日）字段，与 `rentalStart`（起租日）分离
- wps-service.ts 中「发货日」单独映射到 `shipmentDate`，不再与「起租日」合并
- ForwardingList.tsx 和 Sidebar.tsx 卡片增加日期行显示

### 第二阶段：转型为设备管理系统

将软件从单纯租赁转寄推荐升级为完整的设备生命周期管理系统。

**新增四个核心视图**：
| Tab | 功能 |
|-----|------|
| 📊 仪表盘 | 库存概览 + 今日发货/归还/剩余统计 |
| 📦 设备库存 | 手动入库、Excel 批量导入、状态筛选、删除 |
| 📋 订单管理 | 今日订单、发货（选序列号+填快递单）、归还、搜索 |
| 🔄 转寄推荐 | 保留原有功能 |

**新增核心文件**：
- `src/main/device-store.ts` — JSON 持久化层（devices.json + orders.json）
- `src/renderer/components/Dashboard.tsx` — 仪表盘
- `src/renderer/components/DeviceInventory.tsx` — 设备库存
- `src/renderer/components/OrderPanel.tsx` — 订单管理（含发货弹窗）
- `src/renderer/components/NavTabs.tsx` — 导航标签栏

**数据模型**：
- Device：序列号、型号、状态（idle/renting）、入库日期
- Order：客户信息、型号、序列号、快递单号、发货日、起租日、到期日、状态（pending/dispatched/returned）

**工作流**：WPS 下载 Excel → 点「读取数据」→ 自动导入今日订单（去重）+ 转寄匹配 → 发货（选设备+填快递单）→ 归还

### 第三阶段：多人协作 Web 版

在 Electron 主进程中嵌入 Express 服务器，实现局域网多人同时访问。

**架构**：
```
Electron 窗口 ←──IPC──→ deviceStore (JSON)
局域网浏览器 ←──HTTP──→ Express Server → deviceStore
```

**新增文件**：
- `src/main/server.ts` — Express 服务器（REST API + 静态文件服务）
- `src/main/api-polyfill.ts` — 浏览器端 `window.electronAPI` polyfill

**关键设计**：React 组件零改动。服务器在 HTML 中注入 polyfill 脚本，用 `fetch()` 模拟 IPC 接口。

**新增依赖**：express, cors, multer

### 第四阶段：细节完善

1. **发货不限型号**：发货弹窗显示所有空闲设备，不按订单型号过滤
2. **日期解析修复**：`6.5`（6月5日）之前被解析为 `day=50`→无效→返回空，修复为 `day>31` 时除以10
3. **名字提取增强**：新增三种格式匹配，兜底用地址前缀/手机号代替，不再丢弃无名字行（从 660 行丢到 0 行丢弃）
4. **工具栏重构**：操作按钮移到右上角全局工具栏，NavTabs 左侧 + 按钮右侧
5. **去重修复**：发货后点「读取数据」不再重复导入（去重条件改为仅判断姓名+手机号）
6. **归还设备修复**：双路匹配（currentOrderId + serialNumber）确保设备正确回到空闲
7. **订单筛选**：全部/待发货/今天发货/已发订单/已归还，带数量统计
8. **订单搜索**：支持按客户姓名或手机号搜索
9. **设备删除**：空闲设备可删除（租用中不可删）
10. **仪表盘租用中可点击**：弹出窗口显示租用订单列表，可直接点归还
11. **网页版 URL 显示**：工具栏显示 🌐 网页版地址，一键打开浏览器

### 第五阶段：名称变更 + 打包 + 细节优化

1. **应用更名**：从「租赁客户转寄助手」改为「仓库管理助手」
2. **删除共享表格按钮**：不再需要单独打开 WPS 链接
3. **自动读取最新表格**：不再限制文件名，扫描 data 目录下最新的 .xlsx/.xls 文件
4. **📂 打开文件夹按钮**：一键打开数据文件目录，方便用户放入表格
5. **Polyfill 补全**：网页版补上 deleteDevice、getRentingOrders、openWebUrl 等方法
6. **设备删除**：空闲设备可删除（租用中不可删），含确认弹窗
7. **打包输出**：`仓库管理助手 Setup 1.0.0.exe`（78MB）

### 2026-06-05 下午：多项优化与修复

1. **网页版局域网 IP** — 工具栏动态显示 `http://192.168.x.x:3000/`，一键打开浏览器
2. **订单日期选择器** — 📅 按任意日期筛选发货订单 + 📦「今天发货」快捷按钮
3. **全量导入 + 去重优化** — 导入全部客户，去重 key 为 `姓名|电话|发货日|到期日`，Set 去重
4. **分页** — 订单/设备每页 10 条，切换筛选自动回第 1 页
5. **日期解析修复** — `raw: false` 读取格式化文本，修复 `6.2`→6月20日的 Bug
6. **开发模式启动** — 清除 `ELECTRON_RUN_AS_NODE` 环境变量才能正常启动
7. **平台 + 客服 + 备注** — 读取 Excel 的「平台」「客服」「备注」列并在卡片显示
8. **iOS 分段控件** — 筛选栏改为圆角滑块风格
9. **发货信息 Tab** — 已发货/已归还订单记录；搜索支持姓名/手机号/客服/序列号/快递单号
10. **转寄流程** — 发货信息可转寄，转寄推荐可确认转寄；设备保持 renting，归还才回空闲
11. **转寄序列号自动查找** — 从发货记录自动填入序列号，找不到时手动输入
12. **代码简化** — `normalizeDate` 删数字分支，`extractNamePhone` 从 5 种正则简化为 4 步
13. **设备库存型号搜索** — 搜索框按型号筛选设备

## 运行命令

```bash
npm install        # 安装依赖
npm run build      # 构建
npm run package    # 打包 Windows .exe
```

### 开发模式启动

**重要**：启动前必须清除 `ELECTRON_RUN_AS_NODE` 环境变量，否则 Electron 会以纯 Node.js 模式运行，导致 `require('electron')` 解析为 npm 包的路径字符串而非 Electron API，应用将崩溃。

**Windows PowerShell**：
```powershell
$env:ELECTRON_RUN_AS_NODE=""
npm run dev
```

**Windows CMD**：
```cmd
set ELECTRON_RUN_AS_NODE=
npm run dev
```

**Git Bash / MSYS2**：
```bash
export ELECTRON_RUN_AS_NODE=
npm run dev
```

> **故障排查**：如果启动时出现 `TypeError: Cannot read properties of undefined (reading 'whenReady')`，说明 `ELECTRON_RUN_AS_NODE` 未清除。执行 `echo $ELECTRON_RUN_AS_NODE`（或 `echo %ELECTRON_RUN_AS_NODE%`）检查其值，若为 `1` 则需按上述步骤清除。

### 2026-06-06 上午：发货信息、转寄流程、代码优化

1. **「客服」字段** — 读取 Excel「客服」列，订单卡片和发货信息中显示，搜索支持
2. **「备注」字段** — 读取 Excel「备注」列，卡片地址下方 📝 橙色显示
3. **设备型号搜索** — 设备库存新增型号搜索框，汇总行显示各型号数量
4. **发货信息完善** — 显示已发货+已归还订单（完整记录），已归还无操作按钮，显示归还日期
5. **转寄数据修正** — 来源订单转寄后 status='returned' + returnDate，设备保持 renting
6. **转寄推荐搜索** — 新增搜索栏按姓名/手机号筛选，已转寄客户显示绿色「已转寄」标签
7. **今日到期搜索** — 侧边栏新增搜索框（姓名/电话/地址/型号），已转寄显示绿色 ✓ 标记
8. **代码简化** — normalizeDate 删数字分支，extractNamePhone 5→4 步，RentalEnd 日志精简

### 构建产物

- 开发模式下 Dev Server 运行在 `http://localhost:5173/`
- Web 服务器运行在 `http://<局域网IP>:3000/`（其他设备可通过局域网访问）
- 打包输出在 `release/` 目录

## 项目文件结构

```
RJKF/
├── src/
│   ├── main/                  # Electron 主进程
│   │   ├── index.ts           # 窗口创建、IPC注册、启动Web服务器
│   │   ├── wps-service.ts     # Excel读取、日期解析、客户解析
│   │   ├── matcher.ts         # 到期筛选、转寄匹配
│   │   ├── address-parser.ts  # 地址解析（省市区街道）
│   │   ├── ipc-handlers.ts    # IPC通信桥接
│   │   ├── device-store.ts    # 设备/订单 JSON 持久化层
│   │   ├── server.ts          # Express Web 服务器 + REST API
│   │   └── api-polyfill.ts    # 浏览器端 window.electronAPI polyfill
│   ├── preload/
│   │   └── index.ts           # 预加载脚本（Electron ↔ 渲染进程桥接）
│   ├── renderer/              # React 前端
│   │   ├── App.tsx            # 根组件（状态管理、导航、工具栏）
│   │   ├── components/
│   │   │   ├── NavTabs.tsx        # 导航标签栏
│   │   │   ├── Dashboard.tsx      # 仪表盘（库存概览+今日动态+租用中弹窗）
│   │   │   ├── DeviceInventory.tsx # 设备库存（手动/批量入库、筛选、删除）
│   │   │   ├── OrderPanel.tsx     # 订单管理（发货弹窗、搜索、筛选、归还）
│   │   │   ├── ForwardingList.tsx  # 转寄推荐列表
│   │   │   ├── Sidebar.tsx        # 到期客户侧边栏
│   │   │   ├── MainContent.tsx    # 转寄主内容区
│   │   │   ├── StatsRow.tsx       # 统计行组件
│   │   │   ├── TitleBar.tsx       # 自定义标题栏
│   │   │   └── StatusBar.tsx      # 底部状态栏
│   │   ├── types/             # 渲染进程类型
│   │   └── assets/            # CSS 样式
│   └── types/                 # 共享类型定义
├── data/                      # 数据文件目录（Excel + JSON）
├── release/                   # 打包输出
├── electron-vite.config.ts    # 构建配置
└── package.json               # 项目配置+打包配置
```

---

## 2026-06-10：产品重新定位 — 从桌面工具到 SaaS 平台

### 背景

当前软件解决了租赁商户"筛选到期客户 → 推荐转寄 → 设备/订单管理"的流程，但整个工作流依然有三大断点：

1. **进单靠手抄**：各平台订单需要人工录入表格，再导入软件
2. **发货通知靠手工**：发货后需手动把单号+序列号复制到微信群
3. **数据孤岛**：本地 JSON 文件存储，无法多人协作

### 确定方案：截图 AI 录单 + 订阅制 SaaS

#### 核心产品定位

**仓库管理助手 v2**：面向租赁商户的一站式订单管理平台。最大卖点——截图即可录单，不挑平台，不用 API。

#### 整体架构

```
┌─────────────────────────────────────────────────┐
│              阿里云硅谷 ECS (2核4G)                │
│                                                  │
│  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  用户系统          │  │  数据服务              │  │
│  │  - 注册/登录(JWT)  │  │  - PostgreSQL        │  │
│  │  - 订阅验证        │  │  - 订单/设备/用户数据  │  │
│  │  - 免费/Pro/团队   │  │  - 操作日志           │  │
│  └──────────────────┘  └──────────────────────┘  │
│                                                  │
│  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  Webhook 引擎     │  │  AI 代理(备选)        │  │
│  │  - 企业微信通知    │  │  - 截图OCR中转        │  │
│  │  - 发货自动推送    │  │  - 限流/计费          │  │
│  └──────────────────┘  └──────────────────────┘  │
└──────────────┬──────────────────────────────────┘
               │ HTTPS
    ┌──────────┼──────────────┐
    ▼          ▼              ▼
 桌面端 App   手机浏览器      未来：微信小程序
 (Electron)  (移动端Web)     
 Win + Mac                   
    │
    ├─ 截图 OCR 直连 AI 服务商（不经过服务器）
    │  GPT-4o-mini / 通义千问 VL
    │
    ├─ 本地离线模式（断网也能用基础功能）
    │
    └─ 数据自动同步到云端
```

#### AI 成本核算

| 项目 | 数值 |
|------|------|
| 每张截图 token 量 | ~1500 tokens（含图片+提示词） |
| GPT-4o-mini 单价 | $0.15 / 1M input tokens ≈ ¥0.0015/张 |
| 月均 1500 单 | 约 ¥2.25/月 |
| 备选：通义千问 VL | 约 ¥4.5/月 |

结论：AI 成本可忽略不计，不存在定价障碍。

#### 订阅定价

| 版本 | 价格 | 功能 |
|------|------|------|
| 免费版 | ¥0 | 每日 5 次截图 OCR，基础设备/订单管理 |
| 专业版 | ¥19/月 或 ¥199/年 | 无限截图 OCR，云端备份，多客服账号，全部功能 |
| 团队版 | ¥39/月 | 专业版全部 + 企业微信通知 + 权限管理 |

盈亏平衡：3 个专业版用户即可覆盖服务器 + AI 成本。

#### 技术选型

| 层 | 技术 |
|----|------|
| 桌面端 | Electron + React + TypeScript（保持不变） |
| 服务器 | Node.js + Express + PostgreSQL |
| AI 视觉 | GPT-4o-mini（默认）/ 通义千问 VL（国内备选） |
| 认证 | JWT + bcrypt |
| 消息推送 | 企业微信 Webhook |
| 部署 | 阿里云硅谷 ECS + Nginx 反向代理 + Docker |

---

### 开发路线图

#### 第一阶段：截图 AI 录单（优先级 🥇）
**目标**：彻底消灭手工录表

- [x] 需求讨论与方案敲定（2026-06-10）
- [ ] 新增「截图录单」页面组件
- [ ] 实现拖拽/粘贴截图功能
- [ ] 集成 AI Vision API（GPT-4o-mini）
- [ ] 结构提取 → 自动填单 → 人工确认 → 保存
- [ ] 多图批量识别（一次拖入多张截图）

#### 第二阶段：订阅 + 云端后端（优先级 🥈）
**目标**：实现商业化闭环

- [ ] 阿里云服务器环境搭建（Node.js + PostgreSQL + Nginx）
- [ ] 用户系统：注册/登录/JWT 鉴权
- [ ] 订阅系统：免费/Pro/团队三级
- [ ] 订单数据云同步 API
- [ ] 桌面端：登录页面 + 订阅状态检查

#### 第三阶段：发货自动化（优先级 🥉）
**目标**：发货通知 + 一键回传

- [ ] 企业微信 Webhook 集成（发货自动发群消息）
- [ ] 发货后「一键复制」格式化文本（快递单号+序列号）
- [ ] 移动端 Web 适配（手机浏览器录单、查看订单）
- [ ] 截图 OCR 移动端支持（手机截图 → 上传 → 识别）

#### 第四阶段：协作与扩展（远期）
**目标**：多商户 SaaS 平台

- [ ] 多客服账号 + 角色权限
- [ ] 数据看板（日/周/月报表）
- [ ] 微信小程序
- [ ] 多商户隔离（每个商户独立数据空间）

---

### 本次迭代已完成改动（2026-06-10）

#### macOS 适配
- `package.json`：新增 `package:mac` 脚本 + dmg/zip 构建目标
- `src/main/index.ts`：`titleBarStyle: 'hiddenInset'` 启用原生交通灯
- `src/renderer/components/TitleBar.tsx`：macOS 下隐藏自定义按钮，标题左移 70px
- `src/main/ipc-handlers.ts`：`path.dirname()` 替代硬编码 `\\` 路径分割
- `src/renderer/assets/global.css`：新增 `@keyframes pulse` 呼吸灯动画

#### 自动同步
- `src/renderer/App.tsx`：新增 `silentFetch()` + 60 秒轮询 + 开关按钮
- `src/renderer/components/StatusBar.tsx`：新增同步状态指示灯

#### WPS 宏一键同步
- `resources/wps-sync-macro.js`：WPS JS 宏，优先 HTTP POST 到本机，降级保存 xlsx
- `src/main/server.ts`：新增 `POST /api/customers/sync` 端点
- `src/main/wps-service.ts`：导出 `parseCustomerData` 供端点复用

---

### 待解决问题

1. AI 截图 OCR 的 API Key 管理：用户自带 Key 还是内置在订阅费里？
   → 初步决定：内置在订阅费里，避免用户额外配置
2. 服务器部署地区：硅谷 → 国内延迟约 180ms，截图 OCR 走客户端直连 AI 服务商，不受影响
3. 离线模式：桌面端断网时能否使用基础功能（设备管理、本地订单）
   → 保留本地 JSON 存储作为离线缓存，联网后自动同步

---

### 运行命令（更新）

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（Windows需先清除ELECTRON_RUN_AS_NODE）
npm run build        # 构建
npm run package:win  # 打包 Windows exe
npm run package:mac  # 打包 macOS dmg
npm run package      # 同时打包 Win + Mac
```

---

## 2026-06-10 下午：第一阶段 — 截图 AI 录单功能实现

### 新增文件

| 文件 | 用途 |
|------|------|
| `src/main/ocr-service.ts` | AI Vision API 集成，调用 GPT-4o-mini 从截图中提取订单信息 |
| `src/renderer/components/ScreenshotOrder.tsx` | 截图上传 + AI 识别 + 可编辑表单 + 一键保存 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/main/ipc-handlers.ts` | 新增 `extract-order-from-image` 和 `create-full-order` IPC 通道 |
| `src/main/device-store.ts` | 新增 `createFullOrder()`，支持完整订单字段（平台/客服/备注/租期） |
| `src/preload/index.ts` | 暴露 `extractOrderFromImage` 和 `createFullOrder` 到渲染进程 |
| `src/renderer/global.d.ts` | 新增对应 TypeScript 类型声明 |
| `src/renderer/components/NavTabs.tsx` | 新增 📸 截图录单 Tab |
| `src/renderer/App.tsx` | 引入 ScreenshotOrder 组件并路由到新 Tab |
| `src/renderer/assets/global.css` | 新增拖拽上传区和表单输入框样式 |

### 截图录单工作流

```
任意平台订单 → 截图（或 Ctrl+V 粘贴）
    │
    ▼
软件识别区域展示截图预览
    │
    ▼
点击「开始识别」→ GPT-4o-mini Vision API
    │
    ▼
AI 返回结构化数据 → 自动填入表单（标注 🤖 AI 识别）
    │
    ├─ 客户姓名*、手机号*、地址
    ├─ 设备型号、发货日、起租日、到期日
    └─ 平台、客服、备注
    │
    ▼
人工校对 → 点击「确认保存订单」
    │
    ▼
订单写入系统 → 2 秒后自动清空，准备下一单
```

### AI 服务配置

- 模型：GPT-4o-mini（`detail: low` 模式，节省 token）
- API Key：通过环境变量 `OPENAI_API_KEY` 配置
- 每张截图约 1500 tokens，成本约 ¥0.0015
- 系统提示词已优化为中文订单场景，要求严格 JSON 返回
- 支持 Markdown 代码块容错解析

### 截图方式

- 拖拽图片到上传区
- 点击上传区选择文件
- Ctrl+V 粘贴剪贴板中的截图（全局监听，无需聚焦上传区）

---

## 2026-06-10 下午：第二阶段 — 订阅制 + 阿里云后端

### 新增项目：server/

独立的云端服务，部署在阿里云硅谷 ECS。

```
server/
├── package.json
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml
├── src/
│   ├── index.ts              # Express 入口，端口 3001
│   ├── db.ts                 # PostgreSQL 连接 + 表初始化
│   ├── db-init.ts            # 首次部署：创建数据库 + 建表
│   ├── middleware/
│   │   └── auth.ts           # JWT 鉴权 + 订阅等级中间件
│   └── routes/
│       ├── auth.ts           # 注册 / 登录 / 验证 Token
│       └── sync.ts           # 订单 + 设备云端同步（upsert）
```

### 数据库设计（PostgreSQL）

| 表 | 用途 | 关键字段 |
|----|------|----------|
| `users` | 用户账号 | email, password_hash, subscription_tier, subscription_expires |
| `orders` | 订单数据 | 完整订单字段，user_id 关联用户 |
| `devices` | 设备库存 | serial_number, status, user_id 关联用户 |

同步策略：`ON CONFLICT ... DO UPDATE`（upsert），以客户端生成的 ID 为主键。

### 新增桌面端文件

| 文件 | 用途 |
|------|------|
| `src/renderer/components/LoginPage.tsx` | 登录/注册页面，支持离线模式 |
| `src/renderer/services/api-client.ts` | HTTP 客户端，封装 auth + sync API |
| `src/renderer/services/sync-service.ts` | 后台云同步（30 秒间隔推送） |

### 修改桌面端文件

| 文件 | 改动 |
|------|------|
| `src/renderer/App.tsx` | 新增 auth gate：未登录显示 LoginPage，已登录显示主应用 |

### 用户流程

```
启动 App
    │
    ▼
检查本地 Token → 服务器验证
    │
    ├─ 有效 → 进入主界面（订阅等级：free/pro/team）
    │
    ├─ 无效 → 显示登录页
    │         ├─ 注册 / 登录 → 进入主界面
    │         └─ 离线使用 → 进入主界面（数据仅本地）
    │
    ▼
主界面：每 30 秒自动推送订单/设备到云端

### 定价对应功能限制

| 版本 | OCR 次数 | 多客服 | 云同步 | 企业微信通知 |
|------|----------|--------|--------|-------------|
| Free | 5次/天 | ❌ | ❌ | ❌ |
| Pro  | 无限 | ✅ | ✅ | ❌ |
| Team | 无限 | ✅ | ✅ | ✅ |

### 部署到阿里云

```bash
# 在服务器上
cd server
npm install
npm run build

# 设置环境变量
export DB_HOST=localhost
export DB_PASSWORD=your-password
export JWT_SECRET=your-random-secret

# 初始化数据库
npm run db:init

# 启动
npm start

# 或使用 Docker
docker-compose up -d
```

### 桌面端连接服务器

在 `src/renderer/services/api-client.ts` 中修改 `API_BASE` 为服务器地址：

```typescript
const API_BASE = 'https://your-server.com:3001/api'
```

---

## 2026-06-10 下午：第三阶段 — 企业微信通知 + 移动端 + 一键复制

### 新增文件

| 文件 | 用途 |
|------|------|
| `src/main/wecom-service.ts` | 企业微信 Webhook 通知服务（发货/转寄自动推送群消息） |
| `src/renderer/components/WecomSettings.tsx` | 设置页面：Webhook URL 配置 + 开关 |
| `src/renderer/mobile.html` | 移动端 Web 页面（订单管理 + 发货 + 截图上传） |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/main/ipc-handlers.ts` | 新增 4 个 IPC 通道（wecom 配置读写 + 通知触发）；发货/转寄自动调 Webhook |
| `src/renderer/components/NavTabs.tsx` | 新增 ⚙️ 设置 Tab |
| `src/renderer/App.tsx` | 引入 WecomSettings 组件 |
| `src/renderer/components/OrderPanel.tsx` | 发货成功后显示绿色通知条 + 📋 一键复制按钮 |
| `src/preload/index.ts` | 暴露 getWecomConfig / saveWecomConfig |
| `src/renderer/global.d.ts` | 新增类型声明 |
| `src/main/server.ts` | 新增 `/mobile` 路由，服务移动端页面 |

### 企业微信通知

**配置方式**：
1. 企业微信群 → 群设置 → 群机器人 → 添加
2. 复制 Webhook 地址（`https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...`）
3. 打开软件 → ⚙️ 设置 → 粘贴地址 → 启用 → 保存

**通知时机**：
- 发货确认后 → 群内自动推送 📦 发货通知（客户名、序列号、快递单号、客服）
- 转寄确认后 → 群内自动推送 🔄 转寄通知

**格式示例**：
```
📦 发货通知

客户：张三
电话：13812345678
设备：DJI Osmo Pocket 3
序列号：4B6RLxxxxxxxx
快递单号：SF1234567890
平台：淘宝
客服：小王
```

### 移动端 Web

访问地址：`http://<电脑IP>:3000/mobile`

功能：
- 📋 订单列表（筛选待发/已发，搜索，发货，归还）
- 📮 已发货记录
- 📸 截图上传（拍照或选图，上传后桌面端确认）
- 📊 库存概览（订单数、设备数、空闲/租用统计）
- 每 30 秒自动刷新数据

### 一键复制

发货成功后，订单管理页顶部显示绿色通知条：
`✅ 张三 发货成功 · Pocket 3 · 4B6RLxxx · SF1234567890  [📋 复制]`

点击「复制」按钮，自动复制格式化为：
```
发货信息：
客户：张三
设备：DJI Osmo Pocket 3
序列号：4B6RLxxxxxxxx
快递单号：SF1234567890
```

直接粘贴到平台或微信群即可。10 秒后通知条自动消失。

---

## 第二阶段：云端化与账户系统（2026-06-15 ~ 2026-06-16）

### 云端服务器部署

- **服务器**：阿里云 ECS（美国硅谷，IP `47.254.36.2`）
- **系统**：Alibaba Cloud Linux 3（OpenAnolis Edition）
- **部署方式**：Docker + Docker Compose
- **组件**：
  - PostgreSQL 16（Alpine）
  - Node.js 20 + Express API 服务（端口 3001）
- **安装过程**：
  - 阿里云 Linux 不在 Docker 官方安装脚本支持列表中，手动通过 dnf 添加 Docker CE 仓库安装
  - Docker 26.1.3 + Docker Compose v2.27.0
  - 安全组开放 3001 端口

### 账户系统

- **数据库表**：`users`（id, email, password_hash, subscription_tier, subscription_expires, extra_credits, created_at）
- **API 路由**：
  - `POST /api/auth/register` — 注册
  - `POST /api/auth/login` — 登录（返回 JWT Token）
  - `GET /api/auth/me` — 验证 Token，返回用户信息
- **密码加密**：bcryptjs（10 轮哈希）
- **鉴权方式**：JWT（30 天有效期），Bearer Token

### 数据同步

- **同步表**：`orders`、`devices`
- **API 路由**：
  - `GET/POST /api/sync/orders` — 订单拉取/推送
  - `GET/POST /api/sync/devices` — 设备拉取/推送
- **客户端同步**：每 30 秒自动推送本地数据到云端

### 客户端修复

- 修复 API 路径缺少 `/api` 前缀导致 `Failed to fetch`
- 修改默认服务器地址为 `http://47.254.36.2:3001`
- 注册 `get-wecom-config` / `save-wecom-config` IPC 处理器

### 个人信息与版本系统（2026-06-15）

- **主页用户栏**：左上角显示头像圆圈（邮箱首字母）+ 邮箱 + 版本标签
- **退出登录**：主页右侧退出按钮，清除 Token 回到登录页
- **版本重命名**：
  - 免费版 → 免费版
  - 团队版 → **Pro+版**（¥29/月）
  - 专业版 → **Plus版**（¥59/月）
- **设置页面**：版本特权三栏对比 + 升级入口

### 激活码系统

- **数据库表**：`activation_codes`（code, tier, duration_days, used_by, used_at）
- **API 路由**：
  - `POST /api/activation/admin/generate` — 管理员生成激活码
  - `POST /api/activation/admin/list` — 查看激活码列表
  - `POST /api/activation/redeem` — 用户兑换激活码
- **管理员密钥**：`rjkf-admin-2024`（通过 `.env` 的 `ADMIN_SECRET` 配置）
- **管理员面板**：输入密钥验证 → 选择版本/天数/数量 → 生成激活码 → 查看记录
- **隐藏入口**：快速点击首页「仓库管理助手」标题 3 次进入
- **客户端**：设置页「🎫 激活码兑换」输入框

### AI 识别次数系统

- **数据库表**：`ai_usage`（user_id, period_key, count, extra_used）
- **配额规则**：
  - 免费版：每日 5 次
  - Pro+版：每月 1500 次
  - Plus版：不限
- **客户端显示**：
  - AI 截图录单页面：识别按钮上方显示「本月/今日剩余 X / N 次」
  - 主页用户栏：显示「🤖 今日/本月剩余 X 次」
  - 次数用完变红色，按钮禁用

### 次数充值系统

- **数据库表**：`recharge_codes`（code, credits, used_by, used_at）
- **API 路由**：
  - `POST /api/ai-usage/recharge/generate` — 管理员生成充值码
  - `POST /api/ai-usage/recharge/redeem` — 用户兑换充值码
  - `GET /api/ai-usage/remaining` — 查询剩余次数
  - `POST /api/ai-usage/increment` — 使用后+1
- **管理员面板**：充值码标签页，可选 50/100/200/500/1000 次
- **客户端**：设置页「⚡ 次数充值」输入框

### 注册流程简化

- 初期添加了邮箱验证码功能（`verification_codes` 表 + nodemailer SMTP）
- 后续移除验证码要求，注册仅需邮箱 + 密码
- 移除登录页「离线使用」入口，必须联网使用

### 自动登录

- 修改 `verifyToken()` 逻辑：服务器不可达时使用缓存 Token 自动登录
- 重启应用自动进入主页，无需重复输入账号密码

---

## 第三阶段：团队协作功能（2026-06-16）

### 好友系统

- **数据库表**：`friends`（user_id, friend_id, status: pending/accepted/rejected）
- **API 路由**：
  - `POST /api/friends/request` — 发送好友请求（按邮箱查找）
  - `GET /api/friends/requests` — 查看待处理请求
  - `POST /api/friends/accept` — 接受请求
  - `POST /api/friends/reject` — 拒绝请求
  - `GET /api/friends/list` — 好友列表
  - `DELETE /api/friends/:friendId` — 删除好友
- **权限控制**：仅 Pro+ 及以上版本可用（`requireTier('team', 'pro')` 中间件）
- **客户端**：好友协作页面（添加好友 / 请求列表 / 好友管理）

### 订单协作

- **数据库表**：`order_collaborators`（order_id, user_id, added_by）
- **API 路由**：
  - `POST /api/collab/orders/:id/share` — 分享订单给好友
  - `GET /api/collab/orders/:id/collaborators` — 查看协作者
  - `GET /api/collab/shared-with-me` — 查看分享给我的订单
  - `DELETE /api/collab/orders/:id/share/:userId` — 移除协作者
- **客户端**：发货信息页每个订单新增「分享」按钮，弹出好友列表选择

### 企业绑定

- **数据库表**：
  - `enterprises`（name, owner_id, invite_code）
  - `enterprise_members`（enterprise_id, user_id, role: admin/member）
- **API 路由**：
  - `POST /api/enterprise/create` — 创建企业（Pro+ 以上）
  - `POST /api/enterprise/join` — 通过邀请码加入
  - `GET /api/enterprise/my` — 我的企业信息
  - `GET /api/enterprise/members` — 成员列表
  - `POST /api/enterprise/kick` — 管理员移除成员
  - `POST /api/enterprise/leave` — 退出/解散企业
  - `POST /api/enterprise/regenerate-code` — 刷新邀请码
  - `GET /api/enterprise/orders` — 企业内所有订单
- **客户端**：
  - 企业绑定页面：创建企业/输入邀请码加入
  - 企业详情：成员列表、邀请码显示/刷新、移除成员、退出
  - 同企业成员自动可见彼此订单

### 逾期订单追踪（2026-06-16）

- **判断逻辑**：到期日后超过 2 天未点「归还」 → 标记为「⚠️ 已逾期」
- **仪表盘**：新增「已逾期」统计卡片，点击弹出逾期订单详情列表
- **逾期详情**：显示客户名、电话、设备、到期日、已逾期天数、可直接点归还
- **主页**：统计栏新增「已逾期」数字（红色），点击跳转仪表盘
- **发货信息**：逾期订单红色边框 + 「⚠️ 已逾期」标签

---

## 第四阶段：API Key 管理与打包（2026-06-22）

### OCR API Key 演进

- 初期使用 API2D 中转 Key（`fk244173-...`），硬编码在代码中
- API2D Key 过期后，改为阿里云 DashScope Key（`sk-ws-...`）
- 最终方案：硬编码为系统管理，客户不可更改
- OCR 接口检测逻辑：
  - `sk-` 开头 → DashScope（`dashscope.aliyuncs.com`）
  - `fk` 开头 → API2D（`oa.api2d.net`）
  - 其他 → OpenAI 官方

### Windows 打包

- 使用 `electron-builder` 生成 NSIS 安装包
- 输出文件：`release/仓库管理助手 Setup 1.0.0.exe`（~78MB）
- 安装选项：可自定义安装目录，创建桌面快捷方式
- 跨平台构建：macOS 上通过 Wine 交叉编译 Windows 包
- 下载依赖：Electron v31.7.7 win32-x64 + winCodeSign + NSIS 3.0.4.1

### 服务器重置恢复（2026-06-22）

- 服务器被重置后完整重新部署：
  - SSH 密钥清理 + 重新授权
  - 安装 Docker Compose v5.1.4
  - 上传代码 → 构建镜像 → 启动服务
  - 数据库初始化（全新空库）
  - 安全组端口 3001 重新开放

---

## 当前系统架构

```
┌──────────────────────────────────────────────┐
│                 客户端（Electron）              │
│  React + TypeScript + Vite                    │
│  ┌──────────┬──────────┬──────────────┐       │
│  │ 主页      │ AI截图   │ 订单/设备管理 │       │
│  │ 仪表盘    │ 好友协作 │ 企业绑定      │       │
│  │ 发货信息  │ 设置     │ 管理员面板    │       │
│  └──────────┴──────────┴──────────────┘       │
│          │ API Client (fetch + JWT)            │
└──────────┼────────────────────────────────────┘
           │ HTTPS
┌──────────┼────────────────────────────────────┐
│     阿里云 ECS（47.254.36.2）                   │
│     ┌─────────────────────────────┐            │
│     │   Express API（端口 3001）   │            │
│     │   ├─ auth (注册/登录/JWT)    │            │
│     │   ├─ sync (订单/设备同步)    │            │
│     │   ├─ subscription (版本)    │            │
│     │   ├─ activation (激活码)    │            │
│     │   ├─ ai-usage (次数管理)    │            │
│     │   ├─ friends (好友)        │            │
│     │   ├─ collab (订单协作)      │            │
│     │   ├─ enterprise (企业)     │            │
│     │   └─ verify (邮箱验证)      │            │
│     └──────────┬──────────────────┘            │
│     ┌──────────┴──────────────────┐            │
│     │  PostgreSQL 16（端口 5432）  │            │
│     └─────────────────────────────┘            │
└───────────────────────────────────────────────┘
```

## 数据库表总览

| 表名 | 用途 |
|------|------|
| `users` | 用户账户（含 tier、到期、充值次数） |
| `orders` | 租赁订单（含设备、快递、租期、状态） |
| `devices` | 设备库存（序列号、状态） |
| `activation_codes` | 版本激活码（一次性使用） |
| `recharge_codes` | AI 次数充值码（一次性使用） |
| `ai_usage` | AI 识别用量（按用户+周期统计） |
| `verification_codes` | 邮箱验证码（5 分钟有效） |
| `friends` | 好友关系（pending/accepted/rejected） |
| `order_collaborators` | 订单协作者 |
| `enterprises` | 企业信息 |
| `enterprise_members` | 企业成员 |

## 功能权限矩阵

| 功能 | 免费版 | Pro+版 | Plus版 |
|------|--------|--------|--------|
| 基础订单管理 | ✅ | ✅ | ✅ |
| 设备库存管理 | ✅ | ✅ | ✅ |
| Excel 表格导入 | ✅ | ✅ | ✅ |
| AI 截图录单 | 5次/日 | 1500次/月 | 不限 |
| 云数据同步 | ✅ | ✅ | ✅ |
| 企业微信通知 | ❌ | ✅ | ✅ |
| 好友协作 | ❌ | ✅ | ✅ |
| 企业绑定 | ❌ | ✅ | ✅ |
| 多客服协作 | ❌ | ❌ | ✅ |
| API 开放接口 | ❌ | ❌ | ✅ |
