# RemoteDesk DSH 插件

RemoteDesk 鸿蒙 Pro 远程 AI 工作台的 DSH 电脑端组件。当前为 **0.1.0-alpha.1 / AI0 开发探针**，不是可以从手机连接的正式插件。

源码与版本直接在本 GitHub 仓库管理。鸿蒙 App 在 [RemoteDeskHarmonyOS](https://github.com/Mydstiny/RemoteDeskHarmonyOS) 独立开发。当前不需要公网服务器，不启动任何网络监听。

## 现在可以做什么

- 检测 DSH CLI 及实际解析组件版本，识别 CLI 与依赖版本混用。
- 以原生 Cordis 插件观察明确选中的真实 Agent/Session 事件，只保留计数。
- 验证现有问答 provider 不被替换，以及插件卸载后旧引用失效。

尚未提供：远程聊天、模型回合控制、可信执行沙盒、安装器、设备配对、后台服务、鸿蒙工作台或 RustDesk 隧道。

## 运行源码诊断

使用维护者提供的固定提交检出本仓库，安装 Node.js 22 或更高版本后，在仓库根目录运行：

```sh
npm test
node bin/remotedesk-dsh.mjs doctor --json
```

当前没有 npm 包依赖；无需执行远程安装脚本。`doctor` 成功只表示当前检查通过，`remoteAccess` 始终为 `false`。真实引擎验证仅覆盖文档中的指定组合。

[详细操作](docs/operations.md) · [让用户 Agent 操作](docs/agent-deploy.md) · [兼容表](docs/compatibility.md) · [路线图](docs/roadmap.md) · [English](README.en.md)

鸿蒙端最终使用同一项 `pro.lifetime` 买断权益；本 alpha 不解锁或售卖未完成能力。
