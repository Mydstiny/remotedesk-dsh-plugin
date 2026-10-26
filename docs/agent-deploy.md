# 交给本机助手的安装指令

> 请完整部署 Mydstiny/remotedesk-dsh-plugin 的应用安装指引指定完整提交的 0.3.1 源码。先阅读对应固定 commit 的 README、SECURITY、compatibility.json 和 docs/operations.md，检出并核对完整源码提交，若使用另行发布的资产再核验 SHA256SUMS，不执行浮动远程 shell。使用当前用户的现有 DeepSeek Harness 模型配置，不读取/显示/复制密钥。无需 Docker。选择我已授权的项目和监听地址，安装到持久版本目录，state 放在项目以外的私有目录。使用独立 DSH profile，保留当前部署会话、全局默认模型和 preset roots。先前台启动，通过参考客户端完成配对、真实模型消息、原生文件/命令接受和拒绝、问答、取消、后台任务及停启历史验证，再安装当前用户后台服务。用原生权限说明真实的读取、网络、提权和后台进程范围，不承诺容器隔离。完成后提供版本/包哈希、持久路径、主机端点、项目、服务状态与逐项结果；如遇 unknown 保留原操作身份并核对，不盲目重试。不更改代理、防火墙、公开网络暴露或主机账号，不开发鸿蒙客户端或宣称手机已验收。

固定源码提交由应用安装指引给出，不使用浮动分支或旧 v0.3.0 发行包替代现代修复。仅有 Desktop 时，先按 operations.md 用 provision-dsh-runtime 在独立空目录准备 modern-021，并把输出的 runtimeRoot/binDirectory 保留到服务环境；不降级、覆盖 Desktop 或复制账号。先检查现有服务归属，复用原私有 state 的信任与历史，不重新初始化证书。
