# Đội tài chuyên nghiệp (`/driver-team`) — Design

**Ngày:** 2026-08-10 · **Repos:** `vigo-backend` (rollout TRƯỚC) + `vigo-admin` · **Nguồn yêu cầu:** CEO Vigo

> "Trong admin anh cần 1 tab danh sách các tài đã nhận chuyến chạy thành công theo các tuyến
> để anh liên hệ với họ build họ lên thành team chuyên nghiệp của mình, đội này anh trực tiếp
> chăm sóc để biến nó thành tài chuyên nghiệp của Vigo."

---

## 1. Mục tiêu & phạm vi

Một màn admin **lấy tuyến làm gốc**, trả lời được ba câu theo đúng thứ tự người dùng nghĩ:

1. Tuyến nào đang có tài chạy hoàn thành, tuyến nào trống?
2. Trong tuyến đó ai nổi trội?
3. Tôi đã chăm người này tới đâu, bước tiếp theo là gì?

Màn này **không** phải bản sao của `/drivers` có thêm bộ lọc. `/drivers` trả lời "tài này là ai,
hồ sơ đủ chưa". Màn này coi đơn vị công việc là **một cuộc gọi cần thực hiện**, không phải một
bản ghi cần xem.

### Trong phạm vi (đợt 1)

- Xếp hạng tài xế theo **số chuyến `COMPLETED` thực chạy trên từng tuyến**, trong khoảng ngày (giờ VN).
- Pipeline tuyển team: trạng thái, người phụ trách, tuyến phân công, hẹn gọi lại, ghi chú.
- Nhật ký liên hệ **riêng tư**, tách khỏi log CSKH của vận hành.
- Export ra Excel (`.xlsx`).

### Ngoài phạm vi (đợt 2+)

- Gửi thông báo/push hàng loạt mời tham gia.
- Bảng KPI theo dõi tài **sau khi** đã vào team (chuyến/tuần, tụt phong độ, mục tiêu theo tuyến).
- Chính sách thưởng/hỗ trợ cho team.

Hai thứ này chỉ nên làm khi pipeline đã có dữ liệu thật để đo.

---

## 2. Bối cảnh — cái gì đã có, dùng lại gì

| Đã có | Dùng lại thế nào |
|---|---|
| `getBookings` lọc `routeId` / `status` / `from` / `to` / `driverId` (api.ts:718) | Không đủ: **không có endpoint tổng hợp** đếm theo tài × tuyến → phải thêm ở BE |
| `/driver-reputation` — sao Bayes, tỉ lệ nhận/đúng giờ/hoàn thành | Gọi `getDriverReputation(driverId)` **lazy trong drawer chi tiết** |
| `/driver-cancel-review` — tỉ lệ huỷ | Link sang, không nhúng |
| Log CSKH `customer-call-history` + `csNote` | **Chỉ đọc** trong drawer, để biết ops đã gọi chưa |
| `csv.ts` — thực chất là helper **xlsx** (`downloadXlsx`) | Export |
| `FinanceFilter` + `PRESETS` (`finance/components/finance-filter.tsx`) | Bộ chọn khoảng ngày chuẩn VN |
| `getRoutes()` | Danh mục tuyến — prod hiện ~27 tuyến (api.ts:1025) |

**Tại sao KHÔNG dùng chung log `customer-call` của driver:** log đó đang render ở
`driver-detail-dialog.tsx:218` và `csNote` là một cột trong `drivers-table.tsx:1064-1068`,
cả hai chỉ gate bằng function `drivers`. Ai xem được danh sách tài xế là đọc được hết ghi chú.
Ghi chú đàm phán tuyển team (mức hỗ trợ, cam kết…) **không được** nằm ở đó.

---

## 3. Quyết định đã chốt

| # | Quyết định | Lý do |
|---|---|---|
| D1 | Tính tổng hợp **on-the-fly** bằng SQL `GROUP BY` + thêm index, KHÔNG bảng materialized/cron | Số liệu luôn tươi, không có tầng đồng bộ để lệch. Query gói trong service riêng → sau này đổi ruột sang bảng tổng hợp không đụng API contract |
| D2 | "Chạy thành công" = booking **`status = 'COMPLETED'`**, nhóm theo **`booking.routeId`** (tuyến THỰC CHẠY) | `Driver.routes` là tuyến tài **khai**, lệch thực tế. Chỗ lệch giữa hai cái là thông tin có giá trị → hiện đối chiếu trong drawer |
| D3 | Trạng thái pipeline gắn theo **TÀI XẾ** (không theo cặp tài × tuyến), kèm danh sách tuyến phân công | Một tài không thể vừa "trong team" vừa "bị loại". Đúng với ý "team chuyên nghiệp của Vigo" là **một** đội |
| D4 | Kho dữ liệu **riêng** + function RBAC **riêng** `driver-team` | Ops/CSKH không thấy pipeline tuyển team. Theo đúng tiền lệ `driver-reputation` tách khỏi `drivers` |
| D5 | UI **accordion tuyến → tài**, không phải bảng phẳng | ~27 tuyến nằm gọn một màn. Bảng phẳng bắt người dùng *biết trước* muốn lọc tuyến nào; accordion trả lời câu hỏi đầu tiên ngay khi mở màn |
| D6 | Tách `DECLINED` (họ từ chối) khỏi `DROPPED` (mình loại) | Hai thứ dẫn tới hành động khác hẳn: một cái để dành gọi lại, một cái đóng hẳn |

---

## 4. Mô hình dữ liệu (backend)

### 4.1 `driver_team_member` — 1 dòng / tài xế

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `driverId` | uuid **UNIQUE**, FK `driver` | |
| `stage` | enum | `CONTACTED` \| `INVITED` \| `JOINED` \| `DECLINED` \| `DROPPED` |
| `assignedRouteIds` | `integer[]` NOT NULL DEFAULT `'{}'` | Tuyến được phân công |
| `ownerAdminUserId` | uuid NULL, FK user | Người phụ trách chăm |
| `nextFollowUpAt` | `timestamp` NULL | Hẹn gọi lại |
| `note` | text NULL | Ghi chú hiện ở bảng (bản mới nhất) |
| `stageChangedAt` | `timestamp` NULL | |
| `createdByAdminUserId` | uuid NULL | |
| `createdAt` / `updatedAt` | `timestamp` | |

**Dùng `timestamp` (without time zone), KHÔNG `timestamptz`** — bám bất biến sẵn có của repo:
mọi cột thời gian lưu **byte UTC** trong `timestamp`, container và session Postgres đều pin
`TZ=UTC` (`src/common/vn-time.util.ts:7-11`, `typeorm-cli.config.ts`). Trộn `timestamptz` vào
sẽ phá bất biến đó ở đúng một bảng và làm mọi so sánh chéo thành bẫy.

**"Tiềm năng" KHÔNG lưu row.** Tài chưa có row = tiềm năng. Nhờ vậy không phải backfill vài
nghìn dòng rỗng, và bảng chỉ chứa người đã thực sự được chạm tới. FE hiển thị `stage = null`
thành badge "Tiềm năng".

`assignedRouteIds` để dạng mảng thay vì bảng nối → **không có FK**. Đánh đổi có ý thức: tuyến bị
xoá sẽ hiện `Tuyến đã xoá (#id)` thay vì biến mất im lặng. Với một màn đọc-ghi đơn giản, đổi lấy
việc bớt một bảng và bớt một tầng join là đáng.

### 4.2 `driver_team_event` — nhật ký append-only, riêng tư

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `driverId` | uuid, FK driver, INDEX | Trỏ thẳng driver (không qua member) để log sống sót nếu member bị xoá |
| `type` | enum | `STAGE_CHANGE` \| `CALL` \| `NOTE` \| `ASSIGN` \| `FOLLOW_UP` |
| `fromStage` / `toStage` | enum NULL | Chỉ có với `STAGE_CHANGE` |
| `note` | text NULL | |
| `byAdminUserId` | uuid NULL | |
| `createdAt` | `timestamp`, INDEX `(driverId, createdAt DESC)` | |

Log này **không dùng chung** với `customer-call` của CSKH và nằm sau `@RequireFunction('driver-team')`.
Chiều ngược lại vẫn thông: drawer đọc được log CSKH (chỉ đọc) để hai bên không gọi chồng nhau.

### 4.3 Migration index trên `booking`

`booking.entity.ts` hiện có `driverId` (:67), `status` (:83), `routeId` (:122), `completedAt` (:438)
nhưng **không khai `@Index` nào cho tổ hợp này** → query tổng hợp sẽ quét bảng.

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_booking_completed_route_driver"
  ON "booking" ("status", "completedAt", "routeId", "driverId");
```

**`CONCURRENTLY`** để không khoá ghi trên bảng booking prod. TypeORM bọc `up()` trong transaction
mặc định, mà `CREATE INDEX CONCURRENTLY` **không chạy được trong transaction** → migration phải
khai `transaction = false as const`.

Repo đã có 8 tiền lệ, mẫu đầy đủ nhất kèm giải thích:
`vigo-backend/src/database/migrations/1791600000000-AddCskhActivityIndexes.ts`. **Copy đúng mẫu đó.**

Hai bảng `driver_team_member` / `driver_team_event` là bảng mới chưa có traffic → **không** cần
`CONCURRENTLY`, migration thường là đủ.

> ⚠️ **Rủi ro CAO theo CLAUDE.md §0.5.b** (migration + đụng bảng booking prod) → bước plan phải có
> sub-agent fresh-context review, giữ model mạnh.

---

## 5. API contract

Tất cả gate `@RequireFunction('driver-team')`. Tất cả đều là **endpoint MỚI** — không sửa endpoint nào đang chạy.

### 5.0 `GET /admin/driver-team/summary` — 4 thẻ số

Query: `from`, `to`.

```jsonc
{
  "driversWithCompletedTrips": 87,  // DISTINCT tài có ≥1 chuyến COMPLETED trong kỳ
  "contactedDrivers": 24,           // DISTINCT tài có stage ≠ null (mọi stage)
  "joinedDrivers": 9,               // DISTINCT tài stage = JOINED
  "followUpDueToday": 5             // nextFollowUpAt ≤ hết ngày hôm nay (giờ VN)
}
```

**Phải là endpoint riêng, không cộng dồn từ §5.1.** Cộng `driverCount` của các tuyến sẽ **đếm trùng**
tài chạy nhiều tuyến. Mọi số ở đây đếm `DISTINCT driverId`.

`followUpDueToday` **không** giới hạn theo `from`/`to` — việc phải gọi hôm nay không liên quan tới
khoảng ngày đang xem số liệu.

### 5.1 `GET /admin/driver-team/routes` — cấp 1 (danh sách tuyến)

Query: `from`, `to` (VN-local `YYYY-MM-DD`), `q?` (lọc tên tuyến), `sort?` (`drivers` \| `trips` \| `name`, mặc định `drivers`), `order?`.

```jsonc
{
  "data": [
    {
      "routeId": 12,
      "routeName": "Hà Nội – Hải Phòng",
      "driverCount": 8,            // số tài xế duy nhất có ≥1 chuyến COMPLETED
      "completedTrips": 143,       // lọc theo completedAt trong kỳ
      "totalBookings": 190,        // MỌI status, lọc theo createdAt trong kỳ — KHÁC mốc thời gian
      "lastCompletedAt": "2026-08-09T15:12:00Z",
      "contactedCount": 3,         // DISTINCT tài CÓ chuyến COMPLETED trên tuyến này trong kỳ VÀ có stage ≠ null
      "joinedCount": 1             // như trên, lọc stage = JOINED
    }
  ],
  "unassigned": { /* cùng shape, routeId: null — booking không gắn tuyến */ }
}
```

**BẮT BUỘC join TỪ bảng `defined_routes` (`LEFT JOIN` số liệu booking), KHÔNG `GROUP BY` từ booking.**
Nếu group từ booking thì tuyến không có chuyến nào **biến mất khỏi kết quả** — đúng cái CEO cần thấy
lại thành thứ không bao giờ hiện. Đây là lỗi dễ mắc nhất của cả tính năng này.

**`completedTrips` và `totalBookings` đếm theo HAI mốc thời gian khác nhau** — `completedAt` và
`createdAt` — nên là hai tập hợp khác nhau, không phải tử số / mẫu số của cùng một tập. Chuyến
đặt ngày 30/7 chạy xong ngày 1/8 sẽ nằm trong `totalBookings` của tháng 7 nhưng `completedTrips`
của tháng 8. Cố ý làm vậy: mỗi con số dùng đúng mốc có nghĩa của nó, và mỗi truy vấn bám được
một index riêng (`(routeId, createdAt)` đã có sẵn cho vế cầu; index mới ở §4.3 cho vế cung).

**Hệ quả bắt buộc cho UI:** hiện thành **hai cột riêng** có nhãn rõ (*"Hoàn thành trong kỳ"* /
*"Khách đặt trong kỳ"*), **KHÔNG** hiện dạng phân số `143/190` — phân số ngụ ý chung mẫu số và sẽ
bị đọc sai thành tỉ lệ hoàn thành.

Kỹ thuật: hai CTE riêng (`done` lọc `completedAt`, `demand` lọc `createdAt`), rồi `LEFT JOIN` cả
hai lên `defined_routes`. Không gộp bằng `OR` trong một `WHERE` — `OR` giữa hai cột thời gian sẽ
làm Postgres bỏ index.

### 5.2 `GET /admin/driver-team/routes/:routeId/drivers` — cấp 2 (tải lazy khi mở)

`:routeId` nhận số hoặc chuỗi `none` (booking không gắn tuyến).
Query: `from`, `to`, `stage?`, `ownerAdminUserId?`, `minTrips?`, `q?`, `sort?` (mặc định `trips`), `page?`, `limit?` (mặc định 10, **tối đa 200** — BE kẹp, không tin client).

```jsonc
{
  "data": [
    {
      "driverId": "uuid",
      "fullName": "Nguyễn Văn A",
      "phone": "09xxxxxxxx",
      "transportCompanyName": "HTX ABC",
      "tripsOnRoute": 41,
      "shareOfRoute": 0.287,       // tripsOnRoute / completedTrips của tuyến
      "tripsAllRoutes": 63,
      "lastCompletedAt": "2026-08-09T15:12:00Z",
      "firstCompletedAt": "2026-05-02T08:00:00Z",
      "isApproved": true, "isBanned": false, "suspendedUntil": null,
      "team": {                    // null = chưa chạm (Tiềm năng)
        "stage": "CONTACTED",
        "assignedRouteIds": [12],
        "ownerAdminUserId": "uuid", "ownerAdminName": "…",
        "nextFollowUpAt": "2026-08-12T02:00:00Z",
        "note": "…",
        "stageChangedAt": "2026-08-08T09:00:00Z"
      }
    }
  ],
  "meta": { "total": 8, "page": 1, "limit": 10 }
}
```

**Cố ý KHÔNG kèm sao & tỉ lệ huỷ.** Comment trong controller `driver-reputation` đã cảnh báo: mỗi
tài cần 3 truy vấn riêng → 20 dòng = 60 truy vấn. Drawer gọi `getDriverReputation(driverId)` sẵn có,
1 lần 1 tài. Không viết gì mới, không N+1.

### 5.3 `GET /admin/driver-team/:driverId`

Query: `from`, `to`. Trả:

- `team` (như §5.2, có thể `null`) + `events: DriverTeamEvent[]` (mới nhất trước).
- `routesRun: [{ routeId, name, trips }]` — tuyến **thực chạy** trong kỳ.
- `registeredRouteIds: number[]` — tuyến **đăng ký** (bảng M2M `driver_routes`, cột
  `driver_id` / `route_id` — **snake_case**, khác quy ước camelCase của các bảng khác).

**Cố ý để ở đây chứ không ở §5.2.** Bản trước tôi nhét `otherRoutes` + `registeredRouteIds` vào
từng dòng của danh sách → thêm 2 join cho dữ liệu mà bảng không hiển thị. Việc đối chiếu
"khai vs thực chạy" chỉ xảy ra trong drawer (§6.2), nên dữ liệu cũng chỉ nên tải ở đó.

### 5.4 `PATCH /admin/driver-team/:driverId`

Body (mọi field optional, **chỉ gửi field muốn đổi** — theo đúng thói quen của `updateDriverCsStatus`):

```jsonc
{ "stage": "INVITED", "assignedRouteIds": [12, 7], "ownerAdminUserId": "uuid|null",
  "nextFollowUpAt": "ISO|null", "note": "chuỗi rỗng = xoá" }
```

Upsert row (tạo nếu chưa có) và **tự sinh event** tương ứng: đổi `stage` → `STAGE_CHANGE`,
đổi owner/tuyến → `ASSIGN`, đổi `nextFollowUpAt` → `FOLLOW_UP`, đổi `note` → `NOTE`.
Trả về `team` sau khi cập nhật.

### 5.5 `POST /admin/driver-team/:driverId/events`

Body `{ "type": "CALL" | "NOTE", "note": "…" }` → ghi nhận cuộc gọi / ghi chú thủ công.
`CALL` **không** tự đổi `stage` — đổi trạng thái là hành động có chủ đích, không suy diễn.

### 5.6 `GET /admin/driver-team/owners`

Trả `[{ id, fullName, phone }]` — danh sách tài khoản admin, để nuôi dropdown "người phụ trách".

**Bắt buộc phải có endpoint riêng.** `GET /admin/users` (`rbac-admin.controller.ts:101`) gắn
`SuperOnlyGuard` — **chỉ super admin**. Tài khoản được cấp đúng function `driver-team` mà không
phải super sẽ nhận 403, tức dropdown gán người phụ trách hỏng đúng với người được giao chăm team.
Tái dùng `adminListAssignableUsers()` ở FE là bẫy: nó chạy được khi CEO test bằng tài khoản super,
rồi hỏng lặng lẽ khi giao cho nhân sự khác.

### 5.7 Export

FE tự dựng bằng `downloadXlsx` của `src/lib/csv.ts`, xuất **phẳng** có cột tuyến (file mang đi gọi
điện thì phẳng dễ dùng hơn). Cap **1000 dòng** tổng; vượt cap thì **hiện cảnh báo rõ số dòng bị
cắt**, không cắt im lặng.

**File xuất ra PHẢI đúng tập người dùng đang nhìn.** Hai chế độ:

1. Có dòng được tick → xuất **đúng các dòng đã tick**, không gọi thêm API.
2. Không tick gì → lặp trang §5.2 (`limit = 200`) và **truyền nguyên bộ lọc đang áp**
   (`stage`, `ownerAdminUserId`, `q`, `minTrips`).

Xuất "toàn bộ mọi tuyến" khi người dùng đang lọc *"Trong team, phụ trách = A"* là sai nguy hiểm:
họ nhận về 1000 dòng của tất cả mọi người, bị cắt ngẫu nhiên ở tuyến thứ n, kèm một cảnh báo cắt
dòng càng làm họ tin là file đúng.

**Định dạng là `.xlsx`, KHÔNG phải CSV** — dù file tiện ích tên là `csv.ts`. Comment đầu file ghi
rõ lý do đã bỏ CSV dấu phẩy: Excel tiếng Việt tách dòng theo `;` nên toàn bộ CSV dồn vào một cột.
`.xlsx` còn giữ số ở dạng số (sort/sum được).

---

## 6. Giao diện

### 6.1 Bố cục

**Thanh lọc:** khoảng ngày (`FinanceFilter` + `PRESETS`) · trạng thái pipeline · người phụ trách ·
ô tìm tên tài / SĐT / tên tuyến · số chuyến tối thiểu.

**4 thẻ số:** Tài chạy thành công trong kỳ · Đã liên hệ · Trong team · **Cần gọi lại hôm nay**.
Thẻ cuối là *việc phải làm*, không phải số để ngắm — bấm vào lọc luôn danh sách quá hạn.

**Cấp 1 — accordion, hiện MỌI tuyến kể cả 0 tài.** Mặc định sort số tài giảm dần, tuyến rỗng trôi
xuống đáy. Cột:

`Tên tuyến` · `Số tài chạy thành công` · `Hoàn thành trong kỳ` · `Khách đặt trong kỳ` · `Đã liên hệ / Trong team` · `Chuyến gần nhất`

Hai cột giữa **để riêng, không viết thành phân số** — xem lý do ở §5.1 (khác mốc thời gian).

Hàng đặc biệt cuối danh sách: **"Không gắn tuyến"**.

**Badge "Có khách, thiếu tài":** tuyến có `totalBookings > 0` **và** `driverCount = 0`.
Chỉ dùng đúng điều kiện này — **không** dựa vào tỉ lệ `completedTrips / totalBookings` vì hai số
đó khác mốc thời gian (§5.1), tỉ lệ giữa chúng không có nghĩa.

Đây là lý do phải có cột "Khách đặt trong kỳ": tuyến 0 tài vì *không ai đặt* là vấn đề marketing;
tuyến *có khách đặt mà không tài nào chạy xong* mới là tuyến cần tuyển gấp — và đó chính là danh
sách việc CEO cần.

**Cấp 2 (mở ra, tải lazy)** — tài trên đúng tuyến đó, sort số chuyến giảm dần, hiện 10 người đầu +
nút *"Xem tất cả (n)"*. Cột:

`Tài xế (tên + SĐT, nút gọi & copy)` · `Chuyến trên tuyến` · **`Tỉ trọng %`** · `Chuyến gần nhất` ·
`Trạng thái (dropdown đổi tại chỗ)` · `Người phụ trách` · `Hẹn gọi lại (đỏ nếu quá hạn)` ·
`Ghi chú (sửa inline)` · `Chi tiết`

**Vì sao có cột tỉ trọng %:** một tài chạy 40 chuyến nghe nhiều, nhưng 40/500 là một người trong
đám đông, còn 40/60 nghĩa là **tuyến này đang sống nhờ một người** — vừa là ứng viên số một để
mời, vừa là rủi ro nếu họ bỏ đi. Cột số tuyệt đối một mình không nói được điều đó.

### 6.2 Drawer chi tiết

Hồ sơ + xe + HTX · điểm & đánh giá (lazy, `getDriverReputation`) · **tuyến THỰC CHẠY đối chiếu
tuyến ĐĂNG KÝ, đánh dấu chỗ lệch** · log CSKH (chỉ đọc) · log team riêng ·
form: đổi stage / gán tuyến phụ trách / gán người phụ trách / hẹn gọi lại / ghi nhận cuộc gọi.

### 6.3 Ba điểm dễ sai trong UI

1. **Một tài chạy 3 tuyến xuất hiện ở cả 3 nhóm — và đó là đúng.** Dòng cấp 2 là cặp *(tài × tuyến)*,
   `tripsOnRoute` là số chuyến trên tuyến đó.
2. **Nhưng `stage` gắn theo TÀI (D3)** → đổi trạng thái ở tuyến A thì badge ở tuyến B phải đổi theo.
   Bắt buộc: (a) UI ghi rõ *"trạng thái áp cho tài xế, không theo từng tuyến"*; (b) khi cập nhật
   phải patch **mọi nhóm đang mở** có tài đó, nếu không hai nhóm hiện hai trạng thái khác nhau của
   cùng một người.
3. **Thẻ số "Trong team" đếm tài xế DUY NHẤT, không đếm dòng.** Không thì một người chạy 3 tuyến
   bị tính thành 3.

### 6.4 Tìm kiếm & hành động hàng loạt

Ô tìm hoạt động ở **hai tầng riêng biệt**, và UI phải nói rõ điều đó:

- **Tên tuyến** → lọc ngay danh sách cấp 1 (param `q` của §5.1).
- **Tên tài / SĐT** → gửi xuống §5.2, tức chỉ lọc **bên trong những tuyến đang mở**.

**Cố ý KHÔNG làm "tuyến có kết quả tự bung ra".** Client chỉ có dữ liệu của nhóm đã mở nên không
thể biết tuyến chưa mở có ai khớp; muốn làm thật thì phải thêm một truy vấn đếm-khớp theo tuyến ở
§5.1. Không đáng cho đợt 1 — nhưng cũng KHÔNG được làm nửa vời rồi để người dùng tưởng đã tìm hết
và kết luận sai rằng "tài này không chạy tuyến nào". Hiện chú thích thẳng:
*"Tìm theo tên/SĐT chỉ soi trong các tuyến đang mở."*

Không thêm tab bảng phẳng thứ hai (bớt một màn phải nuôi).

Checkbox trong nhóm đang mở → đổi trạng thái hàng loạt, gán người phụ trách hàng loạt, export `.xlsx`
dòng đã chọn.

**Không có endpoint bulk.** FE gọi §5.4 tuần tự, **tối đa 50 dòng/lần**, hiện tiến độ và **liệt kê
đích danh dòng lỗi** thay vì báo "có lỗi xảy ra". Lý do không làm endpoint bulk: thao tác này chạy
vài chục lần một ngày, không đáng thêm một đường ghi thứ hai phải tự sinh event và tự xử lý lỗi
từng phần.

---

## 7. Phân quyền

**Frontend:**
- `nav-items.tsx`: thêm `{ href: '/driver-team', label: 'Đội tài chuyên nghiệp', icon: Handshake }` vào nhóm **Vận hành**, cạnh *Điểm & đánh giá tài xế*. (`Handshake` có trong lucide-react ^0.475.0 — đã kiểm `node_modules/lucide-react/dist/esm/icons/handshake.js`.)
- `rbac.ts`: thêm `'/driver-team': 'driver-team'` vào `MENU_FUNCTION_BY_HREF`.
- `rbac.test.ts:23`: sửa `toBe(27)` → `toBe(28)` (test cố ý khoá cứng để bắt việc quên khai báo).
- `function-catalog.ts`: **không phải sửa** — catalog dựng tự động từ `navItems`.

**Backend:** thêm `'driver-team'` vào `MENU_FUNCTIONS` (`src/rbac/rbac.constants.ts`) — 1 dòng,
`MENU_FUNCTIONS` **không** bị test khoá số lượng (chỉ `SETTINGS_FUNCTIONS` bị khoá = 10). Controller
gắn nguyên guard chain của `driver-reputation-admin.controller.ts`:
`@UseGuards(JwtAuthGuard, RolesGuard, FunctionAccessGuard)` + `@Roles(UserRole.ADMIN)` +
`@RequireFunction('driver-team')` ở mức **class**.

**Cố ý KHÔNG viết migration grant quyền cho role sẵn có.** Repo có tiền lệ
`1791700000000-GrantCskhActivityToManagerRoles.ts` cấp key mới cho các role quản lý — ở đây thì
làm ngược lại là đúng: quyền này cấp **thủ công qua UI `/roles`** cho đúng vài tài khoản. Cấp
hàng loạt là phá chính mục tiêu riêng tư của D4.

Role vận hành/CSKH không được cấp function này → menu ẩn (`isMenuVisible`), route guard đá về
`/no-access` (`isRouteAllowed`), BE trả 403. Ba tầng độc lập, không dựa vào tầng nào một mình —
admin là static export nên che ở FE chỉ là UX, chốt an ninh nằm ở BE.

---

## 8. Timezone (CLAUDE.md — bắt buộc VN +07:00)

- `from` / `to` gửi **VN-local `YYYY-MM-DD`**, BE hiểu ranh giới `+07:00`. FE dùng lại `todayVn`,
  `daysAgoVn`, `PRESETS` của `finance-filter.tsx` — không hand-roll.
- **BE BẮT BUỘC dùng `src/common/vn-time.util.ts`**, không tự viết lại:
  - `vnRangeToUtc(from, to)` → `{ startUtc, endUtc, daySpan }`, đã validate NaN / đảo ngược /
    quá 365 ngày và ném `BadRequestException`. `booking.completedAt` là `timestamp without time
    zone` chứa byte UTC nên **so sánh thẳng** với `startUtc`/`endUtc`, không cần `AT TIME ZONE`.
  - `vnTimestampSql(col)` chỉ dùng khi cần **gom nhóm theo ngày VN**. Comment trong file cảnh
    báo: viết `AT TIME ZONE 'Asia/Ho_Chi_Minh'` một lần là **sai 14 tiếng, âm thầm** — phải
    double conversion.
- Gom nhóm & so sánh ngày ở BE tính theo VN.
- `nextFollowUpAt`: người dùng nhập **ngày VN** → gửi ISO; hiển thị bằng `formatVnDateTime`.
- "Cần gọi lại hôm nay" và "quá hạn" tính theo mốc ngày VN, không theo timezone trình duyệt.
- **Ca test bắt buộc:** chuyến hoàn thành `2026-08-01 23:30` giờ VN phải nằm trong ngày `2026-08-01`,
  không rơi sang `2026-07-31`.

---

## 9. Tương thích ngược

Toàn bộ là **bảng mới + endpoint mới**. Không sửa field nào của API đang chạy, không đụng
`/drivers/admin/list`, không đụng log `customer-call`. App khách và app tài xế **không bị ảnh hưởng**
— không có endpoint dùng chung nào bị đổi shape.

Thứ tự rollout: **BE trước, FE sau**. Nếu FE lên trước thì endpoint trả 404 → màn hiện empty state
*"Tính năng chưa bật"*, không vỡ trang.

---

## 10. Ca biên

| Ca | Xử lý |
|---|---|
| Booking không có `routeId` (legacy / routing-miss) | Nhóm **"Không gắn tuyến"**, hàng riêng cuối cấp 1; cấp 2 gọi với `:routeId = none` |
| Tuyến không có chuyến nào trong kỳ | Vẫn hiện, mọi số = 0 (nhờ join từ `defined_routes`) |
| Tuyến đã xoá mềm (`deletedAt`) | Không hiện ở cấp 1. Nếu còn trong `assignedRouteIds` thì drawer hiện `Tuyến đã xoá (#id)` |
| Tài bị ban / khoá tạm / chưa duyệt | Vẫn hiện kèm badge cảnh báo; **cảnh báo lại** khi đặt sang `JOINED` (cảnh báo, không chặn) |
| Tài đã bị xoá nhưng còn booking cũ | Vẫn đếm vào số liệu tuyến; dòng cấp 2 hiện tên + badge "đã xoá" |
| Hai admin sửa cùng lúc | Last-write-wins; log giữ **cả hai** event nên truy lại được |
| Ghi chú gửi chuỗi rỗng | = xoá ghi chú (đồng nhất với `updateDriverCsStatus`) |
| Export vượt 1000 dòng | Cảnh báo rõ số dòng bị cắt |
| Khoảng ngày rỗng dữ liệu | Empty state, không hiện bảng trống không lời giải thích |

---

## 11. Kiểm thử

**Backend (`npx tsc --noEmit` + `npx jest`):**
- Unit service tổng hợp: chỉ đếm `COMPLETED`; ranh giới ngày VN (ca 23:30 ở §8); tuyến 0 chuyến vẫn
  ra kết quả; nhóm `routeId IS NULL`; `driverCount` đếm **DISTINCT** driver.
- `shareOfRoute` khi `completedTrips = 0` → trả `0`, **không** chia cho 0 (BE tính, FE chỉ hiển thị).
- Summary §5.0 đếm DISTINCT: tài chạy 3 tuyến chỉ tính **1** lần ở cả 4 con số.
- Unit `PATCH`: upsert tạo row khi chưa có; sinh đúng loại event; `note: ""` xoá ghi chú.
- `limit` vượt 200 bị BE kẹp về 200.
- **RBAC không test bằng e2e HTTP** — repo không có hạ tầng đó (`test/` chỉ có `app.e2e-spec.ts`
  tối giản). Lưới an toàn thật là `src/rbac/route-coverage.spec.ts`: nó quét TĨNH mọi
  `*.controller.ts` và fail nếu route có `@Roles(UserRole.ADMIN)` mà thiếu `@RequireFunction`
  hoặc thiếu `FunctionAccessGuard`. Controller `driver-team` copy đúng pattern của
  `driver-reputation-admin.controller.ts` là tự pass. Hành vi 403 đã được
  `function-access.guard.spec.ts` phủ, **không viết lại**.
- Unit test controller phải **mock `RbacService`** (super admin), vì `FunctionAccessGuard` gắn ở
  class-level nên Nest vẫn khởi tạo guard khi build testing module dù không gọi HTTP.

**Frontend (`npx tsc --noEmit` + `npx vitest run`):**
- Bộ dựng query param (theo mẫu `driver-reputation-query.ts`).
- Map nhãn `stage` → tiếng Việt + màu badge, gồm `stage = null` → "Tiềm năng".
- Hiển thị `shareOfRoute` (định dạng %, xử lý `null`/`0`).
- Hàm patch trạng thái lan sang **mọi nhóm đang mở** có cùng `driverId` (§6.3.2) — đây là lỗi
  dễ tái phát nhất, phải có test riêng.
- Bộ dựng dữ liệu export: phẳng có cột tuyến, lặp trang, cảnh báo khi cắt ở 1000 dòng.
- `rbac.test.ts` phải pass với 28 function.

---

## 12. Rollout

1. `vigo-backend`: migration index (`CONCURRENTLY`, ngoài transaction) + 2 bảng + 7 endpoint (§5.0–§5.6) + RBAC key → deploy **prod trước**.
2. `vigo-admin`: nhánh `feat/driver-team` cắt từ `main`.
3. Merge `feat/driver-team` → `dev` → **test runtime trên DEV (cổng bắt buộc)**.
4. PR `feat/driver-team` → `main` → merge = deploy prod.
5. Resync `main` → `dev`.

Cấp function `driver-team` cho **đúng** tài khoản CEO + người được giao chăm team. Không gắn vào
role Vận hành / CSKH.

---

## 13. Câu hỏi mở

Không còn câu hỏi chặn. Hai điểm cần theo dõi sau khi chạy thật:

- Nếu số tuyến vượt ~60, accordion cấp 1 sẽ cần phân trang hoặc gom theo tỉnh — hiện ~27 nên chưa cần.
- Nếu query tổng hợp chậm khi booking phình to, đổi ruột service sang bảng tổng hợp refresh định kỳ.
  API contract giữ nguyên nên FE không phải sửa (D1).
