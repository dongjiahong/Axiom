<p align="center">
  <img src="assets/app-icons/svg/logo.svg" alt="Axiom" width="120" />
</p>

# Axiom

把书籍中的沟通方法论抽取成骨架，再用 AI 生成情景、扮演对方进行多轮对话练习，并对“步骤做得到不到位”进行评判与统计。

本地单用户 Web 应用：Next.js 全栈 TypeScript + 本地 SQLite + 单个 OpenAI 兼容模型，界面与内容全部中文。也可以部署到自己的服务器，见下文「部署」。

## 安装

要求 Node.js 22+ 与 pnpm 10。

```bash
pnpm install
pnpm exec playwright install chromium   # 只有要跑端到端测试时才需要
```

## 配置

复制 `.env.example` 为 `.env.local`（Next 会读取 `.env` 与 `.env.local`）：

| 变量 | 说明 |
| --- | --- |
| `AXIOM_DATA_DIR` | 数据目录，默认 `./data` |
| `AXIOM_ACCESS_PASSWORD` | 门禁口令。非空时访问页面与接口都要先输入口令；留空则不启用（本机自用即可）。见「门禁」 |
| `AXIOM_FAKE_LLM` | 设为 `1` 时所有 AI 任务返回确定性的假数据，无需配置模型 |
| `AXIOM_LLM_BASE_URL` | OpenAI 兼容端点的 Base URL |
| `AXIOM_LLM_API_KEY` | API Key |
| `AXIOM_LLM_MODEL` | 模型名 |

也可以在设置页（`/settings`）填写 Base URL / API Key / 模型名，保存在本机数据库里（明文，仅本机单用户）。环境变量存在时优先于设置页，设置页会提示“已被环境变量覆盖”。

API Key 不会写入日志、`llm_calls`、错误信息或任何接口响应；接口只返回掩码（如 `sk-****abcd`）。

### 门禁

在 `.env.local` 里设置 `AXIOM_ACCESS_PASSWORD` 后，第一次访问会先跳到口令页，输对后 7 天内无需再输。适合放到服务器上时挡住陌生人（应用本身没有账号系统）。

```bash
# 生成一个足够长的随机口令
openssl rand -base64 24
```

- **保护范围**：所有页面和 `/api/*` 接口。未通过时页面跳转到 `/gate`，接口返回 `401`。
- **凭证**：通过后下发 `HttpOnly` Cookie，内容是过期时间加 HMAC 签名，不含口令；只有 HTTPS 下才带 `Secure`。
- **改口令即失效**：签名密钥就是口令，修改后所有已通过的浏览器都要重新输入。
- **防猜**：同一来源连续输错 5 次，锁定 15 分钟（按 Nginx 传来的 `X-Real-IP` 区分来源）。
- **不启用**：口令留空或不设置时不启用，本地开发与自动化测试都不受影响。生产模式下没设置口令，启动日志会给出警告。
- **没有“退出”按钮**：想让某台设备失效，清除该站点的 Cookie，或直接修改口令。
- **忘记口令**：口令就在 `.env.local` 里，修改后重启服务。

## 启动

```bash
pnpm db:migrate    # 首次运行或升级后执行迁移（pnpm db:reset 会自动迁移）
pnpm db:seed       # 可选：写入 4 个已确认 + 1 个候选的种子方法论
pnpm dev           # 开发模式，http://localhost:3000
```

生产模式：`pnpm build && pnpm start`。部署到服务器（systemd + Nginx + HTTPS）见「部署」。

## 从零走一遍完整流程

1. **设置**：配置模型（或设 `AXIOM_FAKE_LLM=1` 免配置）。首页在未配置时会有引导横幅。
2. **资料**：在 `/sources` 上传一本沟通类书籍（epub / txt / 文字版 PDF / Markdown）。
3. **抽取**：打开资料详情页点“开始抽取”，等待进度条走完，页面下方出现“本资料的候选方法论”。
4. **审阅**：点候选方法论进入编辑页，核对原文摘录、修改内容，点“确认入库”进入方法论库。
5. **练习**：在 `/practice/new` 用标签与资料筛出候选方法论（标签全部命中、资料任选其一），再选择“指定”某个方法论或“随机”抽取，设定难度后“生成场景”。
6. **对话**：在练习页与 AI 扮演的对方进行多轮对话（准备页与对话中都可展开方法论骨架）；结束后自动进入复盘。
7. **复盘**：查看要点判定、示范改写与执行分，可对单条判定“改判”；再从底部“再练一次”或“换个场景练同一方法论”继续。
8. **历史与统计**：`/history` 查看每一场练习，`/stats` 看方法论概览与难度分层。

## 数据目录

所有数据都在 `AXIOM_DATA_DIR`（默认 `./data`，已加入 `.gitignore`）：

- `axiom.db`（含 `-wal` / `-shm`）：SQLite 数据库，启动时自动建目录、开启 WAL 与外键并执行迁移。
- `uploads/<id>.<ext>`：上传的原始资料。

备份就是复制这个目录（服务运行时请用「部署」一节里的 `sqlite3 .backup`）。想推倒重来执行 `pnpm db:reset`（删除数据库文件后重新迁移），再 `pnpm db:seed` 写入种子数据。

## 部署

以下以 Ubuntu / Debian 为例，用 systemd 托管应用，Nginx 做 HTTPS 反向代理。相关配置文件在 `deploy/` 下：

- `deploy/systemd/axiom.service`：systemd 服务。
- `deploy/nginx/axiom.conf`：Nginx 站点配置（HTTPS、Basic Auth、上传与超时设置）。

### 部署前必须知道

- **应用没有账号系统**（设计前提是“本机单用户”），设置页里还保存着模型 API Key（明文）。放到服务器上必须设置门禁口令 `AXIOM_ACCESS_PASSWORD`（见「配置 → 门禁」）并使用 HTTPS，否则任何能访问该地址的人都能用你的模型额度、查看和删除数据。Nginx 层还可以按需再加 Basic Auth 或 IP 白名单（`deploy/nginx/axiom.conf` 里有注释示例）。
- **只能跑一个实例**：数据存 SQLite，抽取任务在进程内排队。不要用多副本、负载均衡或 Node cluster。
- **应用只监听 `127.0.0.1:3000`**，对外只开放 Nginx 的 80 / 443（例如 `sudo ufw allow 'Nginx Full'`）。
- 数据库迁移在应用启动时自动执行（见「数据目录」），升级时不需要手动迁移。
- 迁移文件按当前工作目录查找，所以服务必须在仓库根目录启动（`axiom.service` 已设置 `WorkingDirectory`）。

### 1. 准备环境

需要一个已解析到服务器的域名（下文用 `axiom.example.com`）。

```bash
sudo apt update
sudo apt install -y nginx certbot sqlite3 git build-essential python3
```

- Node.js 22+ 请按官方方式安装，然后执行 `sudo corepack enable` 获得 pnpm 10。
- `build-essential` 与 `python3` 用于在没有预编译包时编译原生模块 `better-sqlite3`。

### 2. 获取代码并构建

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin axiom
sudo install -d -o axiom -g axiom /opt/axiom /var/lib/axiom
sudo -u axiom -H git clone <仓库地址> /opt/axiom
```

先写配置，再构建。构建阶段会加载服务端模块，可能顺带打开并迁移数据库，所以要让它落在数据目录里。门禁口令先用 `openssl rand -base64 24` 生成一个，填到下面的 `AXIOM_ACCESS_PASSWORD`：

```bash
sudo -u axiom tee /opt/axiom/.env.local >/dev/null <<'EOF'
AXIOM_DATA_DIR=/var/lib/axiom
AXIOM_ACCESS_PASSWORD=换成你生成的口令
# 也可以不写下面三项，启动后在设置页填写
AXIOM_LLM_BASE_URL=https://你的兼容端点/v1
AXIOM_LLM_API_KEY=sk-xxxx
AXIOM_LLM_MODEL=你的模型名
EOF
sudo chmod 600 /opt/axiom/.env.local

sudo -u axiom -H bash -c 'cd /opt/axiom && pnpm install --frozen-lockfile && pnpm build'
```

`.env.local` 里有口令和 API Key，权限保持 `600`。变量含义见「配置」。

### 3. 用 systemd 托管

```bash
command -v node                       # 确认路径，不是 /usr/bin/node 就改 axiom.service 的 ExecStart
sudo cp /opt/axiom/deploy/systemd/axiom.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now axiom
curl -sI http://127.0.0.1:3000/ | head -1     # 应返回 HTTP/1.1 200
```

### 4. 配置 Nginx 与 HTTPS

**a. 申请证书。** 最终配置引用了尚不存在的证书文件，`nginx -t` 会失败，所以先放一个只处理证书校验的最小配置：

```bash
sudo mkdir -p /var/www/certbot
sudo tee /etc/nginx/conf.d/axiom.conf >/dev/null <<'EOF'
server {
    listen 80;
    server_name axiom.example.com;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
}
EOF
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/certbot -d axiom.example.com
```

**b. 换成完整配置：**

```bash
sudo cp /opt/axiom/deploy/nginx/axiom.conf /etc/nginx/conf.d/axiom.conf
sudo sed -i 's/axiom\.example\.com/你的域名/g' /etc/nginx/conf.d/axiom.conf
sudo nginx -t && sudo systemctl reload nginx
```

证书由 certbot 的定时任务自动续期，可用 `sudo certbot renew --dry-run` 检查。

**c.（可选）在 Nginx 层再加一道 Basic Auth。** 有门禁后通常不需要，两层都开会要求输入两次。要开的话：

```bash
sudo apt install -y apache2-utils
sudo htpasswd -c /etc/nginx/.axiom-htpasswd 你的用户名
# 然后取消 /etc/nginx/conf.d/axiom.conf 里 auth_basic 两行的注释，再 sudo nginx -t && sudo systemctl reload nginx
```

配置里与本应用相关的几处：

| 设置 | 原因 |
| --- | --- |
| `client_max_body_size 55m` | 资料上传上限 50MB（`UPLOAD_MAX_BYTES`），multipart 会略大 |
| `proxy_read_timeout 600s` | 对话回复与复盘在一次请求里等待模型返回，单次调用最长 180 秒（`LLM_TIMEOUT_MS`），含重试留足余量 |
| `proxy_request_buffering off` | 大文件直接流给应用，不写 Nginx 临时文件 |
| `proxy_set_header X-Real-IP $remote_addr` | 门禁按它区分来源来限制猜口令次数；用真实地址覆盖，客户端伪造不了 |
| `X-Forwarded-Proto` / `Host` | 门禁跳转口令页、判断是否加 `Secure` Cookie 都依赖它们，不要去掉 |

### 5. 验证

浏览器访问 `https://你的域名`，应先跳到口令页；输入门禁口令后看到首页。再进设置页配置并“测试连接”，上传一份小资料走一遍抽取。

用 curl 确认没有绕过口令的入口（都应返回 `401`，页面则是 `307` 跳转到 `/gate`）：

```bash
curl -si https://你的域名/api/settings | head -1
curl -si https://你的域名/api/sources | head -1
```

### 日常运维

```bash
# 查看日志
sudo journalctl -u axiom -f
sudo tail -f /var/log/nginx/error.log

# 升级（先备份，见下）
sudo -u axiom -H bash -c 'cd /opt/axiom && git pull && pnpm install --frozen-lockfile && pnpm build'
sudo systemctl restart axiom

# 备份（可放进 cron）：数据库用 .backup 保证一致，上传的原文直接复制
BACKUP=/var/backups/axiom
sudo install -d -o axiom -g axiom $BACKUP $BACKUP/uploads
sudo -u axiom sqlite3 /var/lib/axiom/axiom.db ".backup '$BACKUP/axiom-$(date +%F).db'"
sudo -u axiom cp -a /var/lib/axiom/uploads/. $BACKUP/uploads/
```

恢复：`sudo systemctl stop axiom`，把备份的数据库文件复制为 `/var/lib/axiom/axiom.db`（同时删掉旧的 `axiom.db-wal` / `axiom.db-shm`），上传目录复制回 `uploads/`，再 `sudo systemctl start axiom`。

### 常见问题

| 现象 | 排查 |
| --- | --- |
| 502 Bad Gateway | 应用没起来或端口不对：`systemctl status axiom`、`journalctl -u axiom` |
| 上传大文件返回 413 | 检查 `client_max_body_size` 是否生效（`sudo nginx -T \| grep client_max_body_size`） |
| 对话或复盘时 504 | 模型响应慢，调大 `proxy_read_timeout`；同时检查模型端点是否可达 |
| `pnpm install` 编译 `better-sqlite3` 失败 | 确认已装 `build-essential` 与 `python3`，且 Node 版本 ≥ 22 |
| 输对口令后又回到口令页 | 多半是用 `http://` 访问：HTTPS 下发的 Cookie 带 `Secure`，走 HTTP 会被浏览器丢弃。请用 HTTPS，并确认 Nginx 传了 `X-Forwarded-Proto` |
| 口令页提示“尝试次数过多” | 同一来源输错 5 次会锁 15 分钟；重启服务可立即解除（计数只在内存里） |
| 启用了 Basic Auth 后反复弹出登录框 | 检查密码文件路径与权限：`sudo nginx -T \| grep auth_basic_user_file` |

## Fake 模式（无 API Key 开发与测试）

`AXIOM_FAKE_LLM=1` 时不访问任何网络：抽取、场景生成、对方回复、复盘都返回确定性的假数据，界面与接口完全一致，便于开发与自动化测试。

```bash
AXIOM_FAKE_LLM=1 pnpm dev
```

`pnpm e2e` 的 Playwright 配置会自动用 Fake 模式与独立数据目录 `./data/e2e` 启动服务，并在每次运行前 `db:reset && db:seed`，因此端到端测试从零开始、结果可重复。

## 命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` / `pnpm start` | 生产构建与启动 |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest（单元与集成测试，内存 SQLite + Fake LLM） |
| `pnpm e2e` | Playwright 端到端冒烟（自动使用 Fake 模式与独立数据目录） |
| `pnpm db:generate` / `pnpm db:migrate` | 生成 / 执行 Drizzle 迁移 |
| `pnpm db:seed` | 写入种子方法论 |
| `pnpm db:reset` | 删除数据库文件后重新迁移 |

## 文档

- `CONTEXT.md`：领域术语（代码命名与界面文案都必须使用这里的术语）。
- `AGENTS.md`：执行者须知（分层规则、硬性约束）。
