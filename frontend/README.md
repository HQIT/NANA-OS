# NANA-OS Frontend

NANA-OS Agent Teams 管理工具的 Web UI，基于 React + TypeScript + Vite。

## 开发

```bash
npm install
npm run dev
```

开发模式下 `/api` 请求会自动代理到 `http://localhost:8000`（后端）。

## 构建

```bash
npm run build
```

产物位于 `dist/`，可通过 nginx 或 Docker 部署。
