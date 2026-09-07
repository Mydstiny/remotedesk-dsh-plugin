# DSH 源码诊断与操作

0.1.0-alpha.1 提供原生 Cordis 诊断插件与独立 doctor。没有监听端口、远程命令、安装器或鸿蒙配对功能。

## 手工源码诊断

使用维护者提供的可信固定提交，Node.js 22+，以及现有 DSH 安装。在仓库根目录运行：

```sh
npm test
node bin/remotedesk-dsh.mjs doctor --json
node test/native-runtime.mjs
npm pack --dry-run --ignore-scripts
```

doctor 沿 PATH 中 DSH 可执行文件的真实安装位置查找 package.json，逐一读取该 CLI 实际解析的组件版本，不启动 DSH、不读取用户 profile/会话/密钥。若自动定位失败，可传 `--runtime-root` 后跟 DSH 安装根目录的绝对路径（应含 name 为 @deepseek-ai/dsh 的 package.json）。原生测试接受相同安装根目录作为唯一位置参数。

原生测试只在新建的内存 Cordis Context 中加载已安装组件，创建合成 Agent/Session；验证会话事件、默认拒绝/显式拒绝/取消审批/晚到答复、既有问答 provider、插件卸载及旧引用失效。不会运行模型循环或加载用户 profile。它不是真实 DSH UI 或模型回合验收。

## 原生包结构与安装边界

`package.json` 的 dsh.bundle.patch 指向 `cordis.patch.yml`，补丁将 `@remotedesk/dsh-plugin` 加入运行时；`src/index.mjs` 使用官方 Cordis 插件导出和 agents/sessions 服务。对接正式安装器前，还必须在隔离 DSH profile 验证 CLI 安装/移除与补丁重载。

已核对的 DSH CLI 语法为 `dsh plugin --profile <profile> add <本地包或固定包名>`。这会更改该 profile 的包依赖，且需要其包管理器。本 alpha 不自动执行此命令，不将未验证的 profile 安装宣称为完成；源码中的原生测试是目前可重复执行的验证入口。

## 故障与退出

0 表示当前诊断通过，2 表示阻塞，64 表示参数错误。UNVERIFIED_COMPONENT_VERSION 表示某个实际依赖版本漂移；仅 CLI 版本相同不够。RUNTIME_METADATA_UNAVAILABLE 表示安装元数据无法解析，不应通过删除 profile 或重置账号解决。

所有当前命令结束即退出，无后台服务、开机启动、防火墙或配对数据。清理本次临时副本不会卸载官方 DSH，也不应触碰用户会话。用户问答服务完全保留原 provider；当前不注册第二个 provider。
