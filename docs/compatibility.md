# 兼容性与验证

源码版本 **0.3.1 / protocol major 1** 支持两套精确合同：

| 合同 | DSH | Cordis | pnpm | 宿主 |
| --- | --- | --- | --- | --- |
| legacy-012 | 0.1.2-rc.1 | 4.0.2 | 11.21.0 | 独立 CLI |
| modern-021 | 0.2.1-rc.3 | 4.0.5 | 12.6.0 | 独立 CLI；Desktop 进程内实际加载的模块 |

Node 最低 22.16，OpenSSL 3。`compatibility.json` 的 runtimeProfiles 是逐组件清单；未知 patch、缺包、混装和身份不符均拒绝启动。旧版组件表保留；现代版使用 `dsh-agent-preset`、`dsh-agent-preset-registry` 和公开 scope API，不能用改版本字符串或伪造旧 presets 包替代。

## Desktop 与 CLI

Desktop 把运行时放在 app.asar 内，它不是 `REMOTEDESK_DSH_RUNTIME_ROOT` 所要求的普通 CLI 包根。只装 Desktop 的用户先按 operations.md 在独立空目录准备精确 CLI；不需要卸载、降级或覆盖 Desktop。`bin/provision-dsh-runtime.mjs` 固定 CLI、pnpm 和受检组件版本，输出实际 runtimeRoot 与 binDirectory。

独立命令只查可执行安装，不扫描账号、profile 或会话目录来定位版本。显式 runtime root 错误时不回退到 PATH。启动器沿用同一个 descriptor，并将其传给实际 bridge；插件入口还核对现场 agents/sessions/tools/approval/presets 的精确模块类身份。Desktop 插件在 Electron 安装内解析自身模块，不能让 PATH 上另一套 CLI 为它背书。

管理页面仍可在没有 stateDirectory 的宿主中加载，不会因此启动第二个 bridge。有显式 state 的桥接入口必须先完成实际运行时验证、原生权限与 profile 检查。

## 预设、工具与生命周期

现代版追加固定的声明式 RemoteDesk 预设，保留已有 registry 默认值和其他预设；同名冲突拒绝启动。真实声明、保留的组合模块、解析基准、服务隔离及父 scope 都要核对，不能只检查 preset id。执行守卫继续核对实际 Agent、工具定义/execute 引用、租约、设备代次和一次性批准；同名全局或 agent-local 工具替换不能取得授权。

现代 job API 使用会话 ID 和 owner 字段；旧版仍用精确 Agent 与 ownerSession。两者均排除未署名和其他所有者的任务。现代持久化在原生 writer 关闭后打开显式只读 handle，校验完整事件尾部并关闭 reader。任务失败或持久化无法证明完整时保留活动标记及项目锁。

Web 设置页继续使用已认证的精确 Fetch 路由和原生 client bundle。bridge 协议保持 v1，含紧凑二维码、幂等 operation/epoch 及同设备重新取租约后的审批修复。

## 验证范围

- CI 对 Windows/macOS/Linux、Node 22/24/26 运行源码测试；原生矩阵分别安装 legacy-012/modern-021，并在 Node 22.16.0/24.18.0 上跑固定引擎、安装和 profile 回归。具体通过状态以对应 commit 的 Actions 为准。
- 本机已用两套实际 CLI 运行原生工具、审批、问答、模型/强度切换、分叉/压缩、取消、历史和停服回归。模型回复是本地确定性 fixture，不使用账号或模型权重。
- 本机 Desktop 0.2.1-rc.3 的实际模块也在其 Electron Node 环境、独立测试 home/state 中运行；这不等于 Desktop GUI、用户既有 profile 或原 Windows 反馈电脑已验收。
- 原生 shutdown 负控包括取消失败、丢失持久化尾部；应保留未决活动和锁。安装/profile 测试使用含空格及 & 的路径，并核对本地标准预设仍可用。

真实配置的模型、原反馈 Desktop UI、HarmonyOS 双机 LAN、设备证书、Pro 权益和 RustDesk 传输分别验收。服务 ready、doctor、固定模型 fixture、真实模型和设备通过是不同证据。Windows 原生写隔离仍保留上游 partial 限制，不承诺容器隔离。macOS x64、Windows arm64、无人登录启动和任意扩展不属于默认验收范围。

插件显式调用新版 CLI 的 runCli 导出（包括安装子命令），避免 Node 22.16/22.17 缺少 import.meta.main 时无输出退出；不改写上游安装。该 Node API 的版本边界见官方 [ESM 文档](https://nodejs.org/download/release/v22.23.0/docs/api/esm.html#importmetamain)。
