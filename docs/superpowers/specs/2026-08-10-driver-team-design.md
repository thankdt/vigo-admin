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
- Export CSV.

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
| `csv.ts` | Export |
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
| `nextFollowUpAt` | timestamptz NULL | Hẹn gọi lại |
| `note` | text NULL | Ghi chú hiện ở bảng (bản mới nhất) |
| `stageChangedAt` | timestamptz NULL | |
| `createdByAdminUserId` | uuid NULL | |
| `createdAt` / `updatedAt` | timestamptz | |

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
| `createdAt` | timestamptz, INDEX `(driverId, createdAt DESC)` | |

Log này **không dùng chung** với `customer-call` của CSKH và nằm sau `@RequireFunction('driver-team')`.
Chiều ngược lại vẫn thông: drawer đọc được log CSKH (chỉ đọc) để hai bên không gọi chồng nhau.

### 4.3 Migration index trên `booking`

`booking.entity.ts` hiện có `driverId` (:67), `status` (:83), `routeId` (:122), `completedAt` (:438)
nhưng **không khai `@Index` nào cho tổ hợp này** → query tổng hợp sẽ quét bảng.

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_booking_completed_route_driver"
  ON "booking" ("status", "completedAt", "routeId", "driverId");
```

**`CONCURRENTLY`** để không khoá ghi trên bảng booking prod. Lưu ý: TypeORM migration chạy trong
transaction mặc định, mà `CREATE INDEX CONCURRENTLY` **không chạy được trong transaction** →
migration này phải tắt transaction (`transaction = false` hoặc `queryRunner` riêng). Đây là điểm
bắt buộc reviewer kiểm.

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
      "completedTrips": 143,
      "totalBookings": 190,        // MỌI status — để phân biệt thiếu cầu vs thiếu cung
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

`totalBookings` lấy bằng `COUNT(*) FILTER (WHERE ...)` trong cùng một câu — gần như không tốn thêm.

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
      "otherRoutes": [{ "routeId": 7, "name": "…", "trips": 22 }],
      "registeredRouteIds": [7],   // Driver.routes — để đối chiếu khai vs thực chạy
      "lastCompletedAt": "2026-08-09T15:12:00Z",
      "firstCompletedAt": "2026-05-02T08:00:00Z",
      "isApproved": "true", "isBanned": false, "suspendedUntil": null,
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

Trả `team` (như trên, có thể null) + `events: DriverTeamEvent[]` (mới nhất trước).

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

### 5.6 Export CSV

FE tự dựng bằng `csv.ts`: lặp trang §5.2 (`limit = 200`) cho các tuyến đang chọn, xuất **phẳng** có
cột tuyến (file mang đi gọi điện thì phẳng dễ dùng hơn). Cap **1000 dòng** tổng; vượt cap thì
**hiện cảnh báo rõ số dòng bị cắt**, không cắt im lặng.

---

## 6. Giao diện

### 6.1 Bố cục

**Thanh lọc:** khoảng ngày (`FinanceFilter` + `PRESETS`) · trạng thái pipeline · người phụ trách ·
ô tìm tên tài / SĐT / tên tuyến · số chuyến tối thiểu.

**4 thẻ số:** Tài chạy thành công trong kỳ · Đã liên hệ · Trong team · **Cần gọi lại hôm nay**.
Thẻ cuối là *việc phải làm*, không phải số để ngắm — bấm vào lọc luôn danh sách quá hạn.

**Cấp 1 — accordion, hiện MỌI tuyến kể cả 0 tài.** Mặc định sort số tài giảm dần, tuyến rỗng trôi
xuống đáy. Cột:

`Tên tuyến` · `Số tài chạy thành công` · `Chuyến hoàn thành / tổng đặt` · `Đã liên hệ / Trong team` · `Chuyến gần nhất`

Hàng đặc biệt cuối danh sách: **"Không gắn tuyến"**.

**Badge "Có khách, thiếu tài":** tuyến có `totalBookings > 0` nhưng `driverCount = 0`, hoặc tỉ lệ
`completedTrips / totalBookings` thấp. Đây là lý do phải có cột `tổng đặt`: tuyến 0 tài vì *không
ai đặt* là vấn đề marketing; tuyến *có khách đặt mà không tài nào chạy xong* mới là tuyến cần
tuyển gấp — và đó chính là danh sách việc CEO cần.

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

Gõ tên/SĐT hoặc lọc trạng thái → các tuyến có kết quả **tự bung ra** kèm số khớp, tuyến không khớp
thu lại. Không thêm tab bảng phẳng thứ hai (bớt một màn phải nuôi).

Checkbox trong nhóm đang mở → đổi trạng thái hàng loạt, gán người phụ trách hàng loạt, export CSV
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

**Backend:** thêm key `driver-team` vào `rbac.constants.ts`; controller gắn `@RequireFunction('driver-team')`.

Role vận hành/CSKH không được cấp function này → menu ẩn (`isMenuVisible`), route guard đá về
`/no-access` (`isRouteAllowed`), BE trả 403. Ba tầng độc lập, không dựa vào tầng nào một mình —
admin là static export nên che ở FE chỉ là UX, chốt an ninh nằm ở BE.

---

## 8. Timezone (CLAUDE.md — bắt buộc VN +07:00)

- `from` / `to` gửi **VN-local `YYYY-MM-DD`**, BE hiểu ranh giới `+07:00`. Dùng lại `todayVn`,
  `daysAgoVn`, `PRESETS` của `finance-filter.tsx` — không hand-roll.
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
- e2e RBAC: thiếu function `driver-team` → **403** trên cả 6 endpoint.

**Frontend (`npx tsc --noEmit` + `npx vitest run`):**
- Bộ dựng query param (theo mẫu `driver-reputation-query.ts`).
- Map nhãn `stage` → tiếng Việt + màu badge, gồm `stage = null` → "Tiềm năng".
- Hiển thị `shareOfRoute` (định dạng %, xử lý `null`/`0`).
- Hàm patch trạng thái lan sang **mọi nhóm đang mở** có cùng `driverId` (§6.3.2) — đây là lỗi
  dễ tái phát nhất, phải có test riêng.
- Bộ dựng CSV: phẳng có cột tuyến, lặp trang, cảnh báo khi cắt ở 1000 dòng.
- `rbac.test.ts` phải pass với 28 function.

---

## 12. Rollout

1. `vigo-backend`: migration index (`CONCURRENTLY`, ngoài transaction) + 2 bảng + 6 endpoint (§5.0–§5.5) + RBAC key → deploy **prod trước**.
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
