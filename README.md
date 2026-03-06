# NANA-OS

> **NANA** = **N**etwork **A**ttached **N**ative **A**gent

NANA-OS 是面向 Agent 的事件驱动编排平台，基于 [DiAgent](https://github.com/HQIT/DiAgent)，负责将外部事件路由到对应的 Agent 并驱动其自动执行任务。

## 功能

- **Agent 管理**：创建和配置多个 AI Agent，为每个 Agent 设置角色、系统提示词、使用的语言模型以及可调用的 Skills 和 MCP 工具
- **事件接入**：支持接入 GitHub / GitLab / Gitea Webhook、IMAP 邮件轮询及通用 HTTP Webhook 等多种事件来源
- **事件订阅**：为每个 Agent 配置订阅规则，包括事件来源匹配、事件类型过滤、字段条件及定时触发（Cron）
- **自动执行**：事件触发后自动为匹配的 Agent 启动隔离容器执行任务，并记录运行状态与日志
- **模型管理**：统一管理多个 LLM 接入端点，供 Agent 按需选用
- **MCP 集成**：管理 MCP Server 配置，为 Agent 提供丰富的外部工具能力

## License

MIT
