# PaperAgent

用于学术论文阅读辅助的 LLM 交互桌面应用。通过自动维护**对话大纲**和**实体图谱**，解决长对话中上下文漂移问题；支持 PDF / 图片文档关联，让 LLM 基于实际材料作答。

## 特性

- **流式对话**：实时显示 LLM 响应（打字机效果），支持 OpenAI 兼容接口与 Anthropic Claude
- **自动上下文管理**：每轮对话后自动提取要点与实体，增量更新知识大纲
- **文档库**：支持 PDF（pdfjs）和图片（Tesseract OCR）文本提取，提取内容自动注入上下文
- **会话持久化**：会话以 JSON 格式保存到本地，可随时加载恢复
- **灵活配置**：内置设置界面，支持自定义 Base URL、API Key、模型、温度等参数

## 支持的 LLM 提供商

| Provider | 说明 |
|---|---|
| OpenAI | `https://api.openai.com` |
| DeepSeek | 填入 `https://api.deepseek.com` |
| Ollama | 填入本地地址，如 `http://localhost:11434` |
| Anthropic Claude | 选择 Anthropic 模式，填入 API Key |
| 其他 OpenAI 兼容服务 | 填入对应 Base URL |

## 项目结构

```
src/
├── main/
│   ├── index.ts          # 主进程：IPC 处理、LLM 代理、文件 I/O
│   └── mainWindow.ts     # 窗口创建与配置
├── preload/
│   └── index.ts          # contextBridge：向渲染器暴露受控 API
├── renderer/
│   ├── index.html        # 三栏布局主界面
│   ├── styles/main.css   # 样式
│   └── scripts/
│       ├── main.ts       # 渲染进程入口，协调各服务
│       ├── components/
│       │   ├── outlineComponent.js   # 大纲树组件
│       │   └── sessionManager.js     # 会话历史组件
│       └── services/
│           ├── llmService.ts         # LLM 流式请求封装
│           ├── documentService.ts    # 文档上传与文本提取
│           └── contextService.ts     # 上下文管理（大纲 + 实体图谱）
└── shared/
    ├── types.ts           # 全进程共享类型定义
    └── utils.ts           # 工具函数（ID 生成、时间戳等）
```

## 安装与运行

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 仅编译 TypeScript
./node_modules/.bin/tsc && node copy-js.cjs

# 打包发布
npm run build
```

## 首次使用

1. 启动应用后，点击右上角 **⚙ 设置**
2. 选择 Provider，填入 Base URL（OpenAI 兼容）和 API Key，选择模型
3. 点击 **测试连接** 确认配置有效，保存
4. 点击 **新建会话** 开始对话
5. 可通过右侧 **文档库** 添加 PDF 或图片，内容会自动提取并加入上下文

## 架构说明

### IPC 通信模型

```
渲染进程 ──ipcRenderer.send('llm-send-message')──► 主进程（axios 流式请求 LLM API）
         ◄─── ipcMain.send('llm-chunk') ×N ────────
         ◄─── ipcMain.send('llm-done') ────────────
```

- LLM 请求通过主进程代理，绕过渲染器的 CORS 限制
- 使用 `ipcMain.on`（非 handle）是因为需要推送多条消息
- PDF/OCR 在主进程执行（Node.js 环境），结果通过 handle 返回

### 上下文更新流程

```
用户发送消息
   └─► buildMessages()   构建含大纲/文档摘要的 system prompt
   └─► 流式获取 LLM 响应
   └─► updateContext()
         ├─ 追加对话历史
         ├─ LLM 提取要点 & 实体（失败则降级为正则）
         ├─ 更新大纲（Jaccard 相似度 > 0.7 则合并，否则新建条目）
         └─ 更新实体图谱（记录实体 → 大纲条目的映射）
```

## 开发说明

- 项目使用 `tsc` 直接输出 ES2020 模块，**不使用打包工具**（webpack/vite）
- `copy-js.cjs` 将预编译的 JS 组件文件复制到 `dist/` 目录
- PDF 和 OCR 依赖必须在主进程通过 `require()` 动态加载
