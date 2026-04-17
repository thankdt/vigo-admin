# API Đơn vị Vận tải (HTX / Công ty Vận tải)

> **Ngày cập nhật**: 15/04/2026  
> **Backend version**: Cần deploy lại sau khi merge

---

## Tổng quan

Tài xế khi đăng ký xác thực sẽ phải chọn đơn vị vận tải (HTX/Công ty) mà mình đang làm việc. Admin có thể quản lý danh sách các đơn vị vận tải.

### Luồng hoạt động:

```
┌─────────────────────────────────────────────────────┐
│                    TÀI XẾ                           │
│                                                     │
│  Màn hình đăng ký xác thực:                         │
│  ┌─────────────────────────────────────┐            │
│  │ Đơn vị vận tải:                     │            │
│  │ ○ [Dropdown danh sách HTX]          │ ← GET /transport-companies
│  │ ○ Khác → [Nhập tên đơn vị]         │            │
│  │ ○ Tài xế độc lập                   │            │
│  └─────────────────────────────────────┘            │
│                                                     │
│  → PUT /drivers/profile                             │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                    ADMIN                             │
│                                                     │
│  1. Quản lý danh sách đơn vị vận tải (CRUD)         │
│  2. Xem thông tin HTX khi duyệt tài xế              │
│  3. Gán HTX chính thức cho tài xế                   │
└─────────────────────────────────────────────────────┘
```

---

## I. APIs cho Mobile (Tài xế)

### 1. Lấy danh sách đơn vị vận tải (cho dropdown)

```
GET /transport-companies
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "uuid-1",
    "name": "HTX Vận tải Đông Anh",
    "ownerName": "Nguyễn Văn A",
    "ownerPhone": "0912345678"
  },
  {
    "id": "uuid-2",
    "name": "Công ty TNHH Vận tải Miền Bắc",
    "ownerName": "Trần Văn B",
    "ownerPhone": "0987654321"
  }
]
```

> **Note**: Chỉ trả về đơn vị đang hoạt động (`isActive = true`), sắp xếp theo tên A-Z.

---

### 2. Cập nhật profile tài xế (thêm thông tin HTX)

```
PUT /drivers/profile
Authorization: Bearer <token>
Content-Type: application/json
```

**Trường hợp 1: Chọn từ danh sách**
```json
{
  "licenseImages": ["url1", "url2"],
  "cccdImages": ["url1", "url2"],
  "vehicleRegistration": { ... },
  "transportCompanyId": "uuid-of-htx",
  "submitForApproval": true
}
```

**Trường hợp 2: Chọn "Khác" → nhập tên**
```json
{
  "licenseImages": ["url1", "url2"],
  "cccdImages": ["url1", "url2"],
  "vehicleRegistration": { ... },
  "customTransportCompanyName": "HTX Vận tải ABC",
  "submitForApproval": true
}
```

**Trường hợp 3: Tài xế độc lập**
```json
{
  "licenseImages": ["url1", "url2"],
  "cccdImages": ["url1", "url2"],
  "vehicleRegistration": { ... },
  "isIndependentDriver": true,
  "submitForApproval": true
}
```

| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `transportCompanyId` | UUID | Không | ID đơn vị vận tải (nếu chọn từ danh sách) |
| `customTransportCompanyName` | string | Không | Tên đơn vị vận tải tự nhập (nếu chọn "Khác") |
| `isIndependentDriver` | boolean | Không | `true` nếu tài xế độc lập |

> **Logic**: 3 field này là mutual exclusive — chỉ gửi 1 trong 3.

---

### 3. Get Profile (response mới)

```
GET /drivers/profile
Authorization: Bearer <token>
```

**Response mới có thêm:**
```json
{
  "id": "driver-uuid",
  "fullName": "Nguyễn Văn A",
  "phone": "0912345678",
  "isApproved": false,
  "isSubmittedForApproval": true,
  
  "transportCompanyId": "uuid-of-htx",
  "transportCompany": {
    "id": "uuid-of-htx",
    "name": "HTX Vận tải Đông Anh",
    "ownerName": "Nguyễn Văn B",
    "ownerPhone": "0912345678"
  },
  "customTransportCompanyName": null,
  "isIndependentDriver": false,
  "transportCompanyName": "HTX Vận tải Đông Anh",

  "isProfileComplete": true,
  "missingFields": []
}
```

| Field mới | Mô tả |
|-----------|-------|
| `transportCompanyId` | ID đơn vị vận tải (null nếu chưa chọn) |
| `transportCompany` | Object đầy đủ (null nếu chưa chọn) |
| `customTransportCompanyName` | Tên tự nhập (null nếu không nhập) |
| `isIndependentDriver` | `true` = tài xế độc lập |
| `transportCompanyName` | **Helper field** — tên HTX hiển thị (lấy từ `transportCompany.name` hoặc `customTransportCompanyName`) |

---

## II. APIs cho Admin

### 1. Tạo đơn vị vận tải

```
POST /transport-companies
Authorization: Bearer <admin-token>
Content-Type: application/json
```

**Body:**
```json
{
  "name": "HTX Vận tải Đông Anh",
  "ownerName": "Nguyễn Văn A",
  "ownerPhone": "0912345678"
}
```

| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `name` | string | ✅ Bắt buộc | Tên HTX / Công ty |
| `ownerName` | string | Không | Tên chủ HTX |
| `ownerPhone` | string | Không | SĐT chủ HTX |
| `isActive` | boolean | Không | Mặc định `true` |

**Response:** Object đơn vị vận tải đã tạo.

---

### 2. Danh sách đơn vị vận tải (Admin)

```
GET /transport-companies/admin?page=1&limit=20&search=Đông Anh
Authorization: Bearer <admin-token>
```

| Query | Type | Mô tả |
|-------|------|-------|
| `page` | number | Trang (mặc định 1) |
| `limit` | number | Số lượng (mặc định 10, tối đa 100) |
| `search` | string | Tìm theo tên, tên chủ, SĐT chủ |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid-1",
      "name": "HTX Vận tải Đông Anh",
      "ownerName": "Nguyễn Văn A",
      "ownerPhone": "0912345678",
      "isActive": true,
      "driverCount": 5,
      "createdAt": "2026-04-15T00:00:00.000Z",
      "updatedAt": "2026-04-15T00:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrevious": false
  }
}
```

> **Note**: `driverCount` = số tài xế đang thuộc đơn vị này.

---

### 3. Chi tiết đơn vị vận tải

```
GET /transport-companies/:id
Authorization: Bearer <admin-token>
```

---

### 4. Cập nhật đơn vị vận tải

```
PUT /transport-companies/:id
Authorization: Bearer <admin-token>
Content-Type: application/json
```

**Body:** (tất cả optional)
```json
{
  "name": "HTX Vận tải Đông Anh (cập nhật)",
  "ownerName": "Nguyễn Văn B",
  "ownerPhone": "0999999999",
  "isActive": true
}
```

---

### 5. Xoá đơn vị vận tải

```
DELETE /transport-companies/:id
Authorization: Bearer <admin-token>
```

> **Note**: Soft delete — chuyển `isActive = false`, không xoá khỏi DB.

---

### 6. Gán đơn vị vận tải cho tài xế

```
PUT /drivers/admin/:driverId/transport-company
Authorization: Bearer <admin-token>
Content-Type: application/json
```

**Body:**
```json
{
  "transportCompanyId": "uuid-of-htx"
}
```

> **Mục đích**: Khi tài xế nhập tên tùy chỉnh (`customTransportCompanyName`), admin xác nhận và gán HTX chính thức.  
> **Side effect**: Tự động xoá `customTransportCompanyName` và set `isIndependentDriver = false`.

---

### 7. Danh sách tài xế (response cập nhật)

```
GET /drivers/admin/list?page=1&limit=20
Authorization: Bearer <admin-token>
```

**Response mỗi tài xế giờ có thêm:**
```json
{
  "id": "driver-uuid",
  "userId": "user-uuid",
  "user": { "fullName": "...", "phone": "..." },
  
  "transportCompanyId": "uuid-of-htx",
  "transportCompany": {
    "id": "uuid-of-htx",
    "name": "HTX Vận tải Đông Anh",
    "ownerName": "Nguyễn Văn A",
    "ownerPhone": "0912345678"
  },
  "customTransportCompanyName": null,
  "isIndependentDriver": false
}
```

**Cách hiển thị trên Admin:**

| Trường hợp | Hiển thị |
|------------|----------|
| `transportCompany` != null | Tên HTX từ `transportCompany.name` |
| `customTransportCompanyName` != null | Hiển thị tên + badge "Chưa xác nhận" |
| `isIndependentDriver` = true | Badge "Tài xế độc lập" |
| Tất cả null/false | "Chưa cung cấp" |

---

## III. Hướng dẫn implement Mobile

### UI Flow đề xuất

```
Màn hình Đăng ký xác thực:
┌────────────────────────────────────┐
│ Đơn vị vận tải                     │
│                                    │
│ ◉ Chọn đơn vị vận tải             │
│   └─ [Dropdown: GET /transport-    │
│       companies]                   │
│                                    │
│ ○ Khác                            │
│   └─ [TextField: Nhập tên đơn vị] │
│                                    │
│ ○ Tài xế độc lập                  │
│                                    │
│ [Gửi xác thực]                    │
└────────────────────────────────────┘
```

### Logic gửi dữ liệu:

```dart
// Khi gửi profile
if (selectedOption == 'existing') {
  body['transportCompanyId'] = selectedHTXId;
} else if (selectedOption == 'custom') {
  body['customTransportCompanyName'] = customNameController.text;
} else if (selectedOption == 'independent') {
  body['isIndependentDriver'] = true;
}
```

---

## IV. Hướng dẫn implement Admin

### Trang quản lý Đơn vị Vận tải (mới)

1. **Danh sách**: Bảng hiển thị HTX với cột: Tên, Chủ HTX, SĐT, Số tài xế, Trạng thái, Ngày tạo
2. **Tạo mới**: Form với field: Tên (bắt buộc), Tên chủ, SĐT chủ
3. **Sửa**: Inline edit hoặc modal
4. **Xoá**: Confirm dialog → soft delete

### Cập nhật trang Quản lý Tài xế

1. **Thêm cột "Đơn vị vận tải"** trong bảng danh sách tài xế
2. **Chi tiết tài xế**: Hiển thị HTX, nếu là `customTransportCompanyName` → hiển thị nút "Tạo HTX & Gán"
3. **Action**: Dropdown chọn HTX → gọi `PUT /drivers/admin/:id/transport-company`
