# NANA-OS

> **NANA** = **N**etwork **A**ttached **N**ative **A**gent

NANA-OS 是面向 Agent 的操作层，为多个 Agent 提供运行环境、资源与协作能力。当前核心模块是 **Agent Teams 管理工具**——基于 [DiAgent](https://github.com/HQIT/DiAgent) 的多团队 Agent 编排与任务管理平台。

## 功能

- 创建多个 Agent Team，每个 Team 包含一个主 Agent + 多个子 Agent
- 通过 Web UI 管理团队、Agent 配置（模型、提示词、Skills、MCP 等）
- 一键下发任务，后端自动生成 DiAgent 配置并通过 Docker SDK 启动容器执行
- 查看运行状态、日志与结果，支持中止运行中的任务

## 架构

```
NANA-OS
├── backend/     FastAPI 管理服务（Docker SDK 驱动 DiAgent 容器）
├── frontend/    React Web UI
└── workspace/   各团队工作区（挂载给 DiAgent 容器）
```

后端通过 Docker Socket 创建 DiAgent GHCR 镜像的兄弟容器，每次任务独立隔离。

## 快速启动

### Docker Compose（推荐）

```bash
docker compose up --build
```

- 前端：http://localhost:3000
- 后端 API：http://localhost:8000

### 本地开发

```bash
# 后端
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload

# 前端
cd frontend
npm install
npm run dev
```

## 配置

通过环境变量配置（前缀 `NANAOS_`）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NANAOS_DIAGENT_IMAGE` | `ghcr.io/hqit/diagent/agent-task:latest` | DiAgent Docker 镜像 |
| `NANAOS_WORKSPACE_ROOT` | `./workspace` | 工作区根目录 |
| `NANAOS_HOST_WORKSPACE_ROOT` | 空 | Docker-in-Docker 时宿主机 workspace 路径 |
| `NANAOS_DATABASE_URL` | `sqlite+aiosqlite:///./nanaos.db` | 数据库连接 |
| `NANAOS_MAX_CONCURRENT_RUNS` | `5` | 最大并发运行数 |

## License

MIT
