# DSH 兼容性与验证边界

2026-09-07 本机证据：macOS arm64 / Node 26.4.0 / DSH CLI 0.1.0-rc.6。CLI 内实际解析的 dsh-base、dsh-agent、dsh-session、dsh-user-approval、dsh-user-questions 均为 0.1.0-rc.8；Cordis 4.0.1。见 [完整允许列表](../compatibility.json)。本表记录实际组件组合，不声称只安装 CLI rc.6 就能永久获得相同依赖。

| 项目 | 已验证 | 仍待验证 |
| --- | --- | --- |
| 原生 Cordis 插件 | 实际运行时加载/卸载、准确实例筛选、真实 SessionStore 事件、卸载后的旧引用失效 | CLI profile 安装/升级/移除、本机 UI 热重载 |
| 权限审批 | 真实 ApprovalService 对合成 Agent 的 unavailable/rejected/cancelled 和晚到答复审计 | 真实工具调用、远程审批、多 UI 作用域分流 |
| 用户问答 | 已有 provider 在插件加载后仍可处理请求 | 远程回答与本机 UI 共存 |
| Agent 回合 | 类型有 send/followup/steer/cancel | 真实消息领取/回合对应、取消终态、恢复 |
| 执行隔离 | 未验证 | shell/MCP/子 Agent/文件/联网的真实受限 profile |

**当前 rc.8 的 userQuestions 是单 provider 接口。** 在线主分支文档出现的作用域化问答分流不能套用于此安装版。插件不覆盖或争抢本机 provider；DSH 远程问答保持未开放，后续需选择并验证兼容方案。

`whenIdle()` 表示整个 Agent 的空闲，不能等同于某条入队消息完成。事件必须以后续实际 session seq、输入领取及 turn 边界关联，不能从终端文字推断状态。

当前 doctor 只验证元数据，原生测试使用确定性 Agent fixture；没有真实模型、真实用户 profile、真实手机连接或 RustDesk 验收。线上 DSH 版本仍属预览，升级必须重新验证组件组合。
