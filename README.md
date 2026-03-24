# AI法律助手（FastAPI + LangChain + SQLite）

一个开箱即用的法律问答助手项目，支持用户登录、多会话记忆、管理员在线改模型配置、流式输出和 Markdown/数学公式渲染。

## 功能特性

- `FastAPI` 后端 + `langchain_openai.ChatOpenAI`
- `SQLite` 持久化（用户、对话、消息、系统配置）
- 角色权限：普通用户 / 管理员
- 管理员可在前端后台修改：
  - `API Key`
  - `Base URL`
  - `Model`
- 每个用户最多创建 `3` 个对话
- 用户只可访问自己的会话和记忆
- 前端 ChatGPT 风格交互（中文 UI）
- 亮色 / 暗色模式切换（本地持久化）
- 流式输出（SSE，边生成边显示）
- Markdown 渲染 + 数学公式渲染（MathJax）

---

## 目录结构

```text
app/
  main.py                 # FastAPI 入口
  database.py             # SQLAlchemy 连接与会话
  models.py               # 数据模型
  schemas.py              # Pydantic 请求/响应模型
  auth.py                 # JWT 鉴权、密码哈希、权限依赖
  routers/
    auth.py               # 登录/注册/用户信息
    chat.py               # 会话、消息、流式消息接口
    admin.py              # 管理员配置接口
  services/
    ai.py                 # LangChain OpenAI 调用（普通+流式）
  static/
    index.html            # 前端页面
    style.css             # 页面样式（亮/暗主题）
    app.js                # 前端交互逻辑（SSE + Markdown + 公式）
requirements.txt
.env.example
README.md
```

---

## 环境要求

- Windows / Linux / macOS 均可
- Python `3.11` 或 `3.12`（推荐）
- 可访问你的 OpenAI 兼容模型服务

> 说明：Python 3.14 下某些三方库会有兼容性告警，不影响本项目基础运行，但建议优先使用 3.11/3.12。

---

## 快速开始（协作者拿到即可用）

### 1. 克隆项目

```bash
git clone https://github.com/Pdx247/websever.git
cd websever
```

### 2. 创建虚拟环境并安装依赖

Windows:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Linux/macOS:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. 配置环境变量

```bash
copy .env.example .env
```

可选：编辑 `.env`（如管理员账号、默认模型等）。

### 4. 启动服务

```bash
uvicorn app.main:app --reload --port 8000
```

浏览器打开：`http://127.0.0.1:8000`

---

## 默认账号

首次启动会自动创建管理员账号：

- 用户名：`admin`
- 密码：`admin123`

建议首次登录后立刻改密码（当前演示版可通过改数据库或重置账号方式处理）。

---

## 管理员配置模型（必须做）

1. 用管理员账号登录。
2. 点击左侧底部 `管理员设置`。
3. 填写：
   - `API 密钥`
   - `接口地址（Base URL）`
   - `模型名称`
4. 保存后，普通用户即可正常对话。

如果不配置 API Key，调用会返回错误提示。

---

## 使用说明

- 普通用户可注册后登录。
- 每个用户最多创建 `3` 个对话。
- 每个对话都保留自己的消息历史（作为模型上下文）。
- 发送消息后默认走流式返回，前端会实时显示生成内容。

---

## 数学公式渲染

前端支持：

- 行内公式：`$a^2+b^2=c^2$`
- 块级公式：
  ```text
  $$
  \int_0^1 x^2 dx = \frac{1}{3}
  $$
  ```

说明：公式渲染依赖 MathJax CDN；如果运行环境无法访问 CDN，公式会以纯文本显示。

---

## API 一览

### 鉴权

- `POST /api/auth/register` 注册
- `POST /api/auth/login` 登录
- `GET /api/auth/me` 当前用户

### 聊天

- `GET /api/chat/conversations` 会话列表
- `POST /api/chat/conversations` 新建会话（<=3）
- `DELETE /api/chat/conversations/{id}` 删除会话
- `GET /api/chat/conversations/{id}/messages` 会话消息
- `POST /api/chat/conversations/{id}/messages` 非流式发送
- `POST /api/chat/conversations/{id}/messages/stream` 流式发送（SSE）

### 管理员

- `GET /api/admin/config` 获取模型配置
- `PUT /api/admin/config` 更新模型配置

---

## 关键环境变量（.env）

```env
DATABASE_URL=sqlite:///./app.db
SECRET_KEY=replace-this-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=10080

DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=admin123

DEFAULT_OPENAI_API_KEY=
DEFAULT_OPENAI_BASE_URL=https://api.openai.com/v1
DEFAULT_OPENAI_MODEL=gpt-4o-mini
```

---

## 常见问题

### 1. 启动时报密码哈希相关错误

项目已使用 `pbkdf2_sha256` 避开了 `passlib+bcrypt` 的兼容问题。若你本地仍有旧环境缓存，请：

```bash
pip uninstall bcrypt -y
pip install -r requirements.txt --upgrade
```

### 2. 没有流式效果

请确认前端走的是 `.../messages/stream` 接口，且中间代理没有缓冲 SSE（例如 Nginx 要关闭缓冲）。

### 3. 公式不渲染

通常是 CDN 不可达。可改为内网可访问的 MathJax 资源地址，或本地托管静态文件。

---

## 协作开发建议

### 拉代码

```bash
git pull origin main
```

### 新建分支

```bash
git checkout -b feat/your-feature
```

### 提交

```bash
git add .
git commit -m "feat: your change"
git push origin feat/your-feature
```

### 合并

通过 GitHub PR 进行评审与合并。

---

## 免责声明

本项目输出仅用于信息参考，不构成正式法律意见。涉及诉讼、合同、劳动争议、刑事风险等重大事项，请咨询持证律师。
