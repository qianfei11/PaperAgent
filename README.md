# PaperAgent - 图形化LLM交互工具

这是一个用于与LLM交互的图形化工具，旨在解决上下文不一致问题并支持文档关联功能，特别适用于学术论文阅读和思考辅助。

## 项目结构

```
PaperAgent/
├── src/
│   ├── main/
│   │   ├── index.ts                 # 主进程入口
│   │   └── mainWindow.ts            # 主窗口管理
│   ├── renderer/
│   │   ├── index.html               # 主界面HTML
│   │   ├── styles/
│   │   │   └── main.css             # 样式文件
│   │   └── scripts/
│   │       ├── main.ts              # 渲染进程主脚本
│   │       ├── components/
│   │       │   ├── chat.ts          # 聊天组件
│   │       │   ├── outline.ts       # 大纲组件
│   │       │   ├── documentLibrary.ts # 文档库组件
│   │       │   └── contextManager.ts # 上下文管理组件
│   │       └── services/
│   │           ├── llmService.ts    # LLM服务
│   │           ├── documentService.ts # 文档服务
│   │           └── storageService.ts # 存储服务
│   ├── shared/
│   │   ├── types.ts                 # 类型定义
│   │   └── utils.ts                 # 工具函数
│   └── preload/
│       └── index.ts                 # 预加载脚本
├── assets/
│   └── icons/                       # 图标资源
├── package.json                     # 项目配置
├── tsconfig.json                    # TypeScript配置
└── electron-builder.json            # Electron打包配置
```

## 功能特性

1. **上下文管理系统**：自动提取对话要点并生成JSON大纲
2. **文档关联库**：支持PDF、图片等文档的上传和关联
3. **图形化界面**：直观的用户界面设计
4. **LLM集成**：支持多种主流LLM提供商

## 安装和运行

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev

# 构建应用
npm run build
```