# Cấp quyền điều tra read-only cho Claude Code

Mục tiêu: cho Claude Code **đọc** mọi thứ cần để tìm root cause / kiểm chứng giải pháp (file local + repo anh em, log cloud, query DB, cache) **mà không đụng được vào app**.

## Hai tầng — đừng nhầm với skill

| | Cơ chế | File |
|---|---|---|
| **Tiếp cận** (với tới được gì) | `additionalDirectories`, `mcpServers` | settings.json / settings.local.json |
| **Rào chắn** (được làm gì) | `permissions.allow/deny/ask` + credential | settings.json + DB user / IAM role |
| Chỉ dẫn mềm (khuyên Claude làm gì) | skill `debug-rca` | SKILL.md |

Skill **không** thuộc tầng phân quyền. Nó chỉ nhắc ý định; rào chắn thật là settings + credential.

## Cài đặt

1. Copy `settings.json` vào `<repo>/.claude/settings.json` (commit được — không chứa bí mật).
2. Sửa `additionalDirectories` trỏ đúng các repo anh em (đường dẫn tương đối từ repo gốc).
3. Copy `settings.local.json.example` → `<repo>/.claude/settings.local.json`, điền connection string thật. File này Claude Code **tự gitignore**; tuyệt đối không commit.
4. Mở Claude Code, chạy `/permissions` để xem luật đã nạp, `/mcp` để xem MCP server.

## Quy tắc match (đã kiểm chứng tài liệu)

- Thứ tự: **deny → ask → allow**, match đầu tiên thắng. Deny rộng chặn cả allow hẹp hơn — không có ngoại lệ.
- Cú pháp: `Tool` hoặc `Tool(specifier)`. Wildcard dùng `:*`, ví dụ `Bash(git log:*)`, `Bash(aws logs tail:*)`. Đường dẫn dùng cú pháp giống gitignore: `Read(./**/.env)`.
- Deny ở bất kỳ tầng nào cũng không bị ghi đè, kể cả chế độ bypass.

## Từng loại tài nguyên

### 1. File local + repo anh em
`additionalDirectories` mở quyền đọc ngoài thư mục gốc. Đã chặn sẵn `.env`, `secrets/**`, khoá `*.pem`/`id_rsa` bằng deny để Claude không vô tình đọc bí mật.

### 2. Query DB chỉ-đọc — RÀO CHẮN THẬT NẰM Ở ĐÂY
Đừng dựa vào luật `ask` để giữ an toàn DB; `psql` chạy được mọi SQL. **Hãy tạo một DB user chỉ có quyền SELECT** và cho Claude dùng đúng user đó:

```sql
-- Postgres
CREATE ROLE claude_ro LOGIN PASSWORD '...';
GRANT CONNECT ON DATABASE mydb TO claude_ro;
GRANT USAGE ON SCHEMA public TO claude_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO claude_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO claude_ro;
```

Như vậy dù Claude có gọi `UPDATE/DELETE`, chính DB từ chối. MCP server `@modelcontextprotocol/server-postgres` chỉ expose tool `query` (đọc) — nhưng vẫn cứ dùng user `claude_ro` để chắc chắn. Trỏ vào **replica/staging** thay vì primary production nếu có thể.

### 3. Log cloud (CloudWatch)
Cách đơn giản: AWS CLI với một **profile IAM chỉ-đọc** (`AWS_PROFILE=readonly`, gắn policy như `CloudWatchLogsReadOnlyAccess` / `ReadOnlyAccess`). settings.json đã allow sẵn các lệnh `aws logs ...` đọc và chặn các lệnh ghi (`ecs update-service`, `s3 rm/cp`, `lambda update-function-code`...). IAM read-only là rào chắn thật; luật deny là lớp hai.

### 4. Cache (Redis)
`redis-cli` để ở `ask` (hỏi trước mỗi lần). Rào chắn thật: tạo **Redis ACL user chỉ-đọc**:
```
ACL SETUSER claude_ro on >PASSWORD ~* +@read -@write -@dangerous
```
Cho Claude kết nối bằng user đó; lệnh ghi sẽ bị Redis chặn.

## Tự kiểm chứng đã an toàn
Sau khi cấu hình, thử bảo Claude chạy một lệnh ghi (ví dụ `UPDATE` một bản ghi test, hoặc `aws ecs update-service`). Kỳ vọng: bị từ chối ở tầng deny **hoặc** ở tầng credential. Nếu lệnh chạy được → cấu hình chưa kín, xem lại.

<!-- TEAM-CONFIG: thay HOST/DBNAME/profile/đường dẫn repo cho khớp.
     Cân nhắc thêm sandbox.network.allowedDomains nếu muốn khoá luôn mạng. -->
