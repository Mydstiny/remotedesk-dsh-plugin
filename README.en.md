# RemoteDesk DeepSeek Harness plugin

Version **0.3.1** uses native host tools and requires no Docker. It provides authenticated project access, sessions/history, model and reasoning selection, streaming native tool output, approvals/questions, steering/cancellation, forks, compaction and owned background-job controls.

Requires Node **22.16+**, OpenSSL 3 and DeepSeek Harness **0.1.2-rc.1 or 0.2.1-rc.3**, plus pnpm for native profile installation. Model authentication stays in the configured native host. Unknown engine versions fail closed.

Read [native permission boundaries](SECURITY.md), then follow [installation and operations](docs/operations.md). Install from the fixed reviewed source commit supplied by the application installer; verify SHA256SUMS separately when using published release assets. The listener defaults to loopback port 9444; installing the plugin alone does not start it. The [local control panel](docs/control-panel.md) is started explicitly and remains loopback-only.

Installed into a Web-enabled DSH profile, the plugin also adds a `RemoteDesk` page to **Settings**: service state, projects, paired devices and pairing-code generation, plus a button that opens the local control panel. It uses only the authenticated DSH `/api` channel and never starts a second bridge when no state directory is configured.

The core workflow follows native engine behavior. Read access, approved escalation, networking and detached processes are not container-isolated. Host extensions and delegated agents are unavailable in this release. HarmonyOS UI, device pairing and RustDesk transport remain separate client integration gates.

For Desktop-only installations, use `node bin/provision-dsh-runtime.mjs --destination <empty-directory> --profile modern-021`, then set `REMOTEDESK_DSH_RUNTIME_ROOT` to its returned runtimeRoot and add binDirectory to PATH. This installs a separate pinned CLI without replacing Desktop or a global installation. Use the fixed reviewed source commit supplied by the application installer; the old v0.3.0 archive does not contain the modern adapter. See docs/operations.md.
