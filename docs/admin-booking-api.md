# Vigo Admin - API Booking Management

> **Base URL**: `https://d2072mg5s4gnpc.cloudfront.net`
>
> **Authentication**: Tất cả API đều yêu cầu header `Authorization: Bearer <admin_token>`
>
> **Role**: Chỉ user có role `ADMIN` mới truy cập được

---

## Mục lục

1. [Danh sách booking](#1-danh-sách-booking)
2. [Chi tiết booking](#2-chi-tiết-booking)
3. [Tạo chuyến từ admin](#3-tạo-chuyến-từ-admin) ⭐ MỚI
4. [Admin nhận chuyến](#4-admin-nhận-chuyến) ⭐ MỚI
5. [Chuyển quốc cho tài xế](#5-chuyển-quốc-cho-tài-xế)
6. [Cập nhật trạng thái](#6-cập-nhật-trạng-thái)
7. [Danh sách tài xế khả dụng](#7-danh-sách-tài-xế-khả-dụng)
8. [Enums & Data Types](#8-enums--data-types)

---

## 1. Danh sách booking

```
GET /bookings/admin/list
```

**Query Params:**

| Param | Type | Default | Mô tả |
|-------|------|---------|-------|
| `page` | number | 1 | Trang |
| `limit` | number | 20 | Số lượng/trang |
| `status` | string | - | Lọc theo trạng thái (xem enum bên dưới) |
| `customerId` | uuid | - | Lọc theo khách |
| `driverId` | uuid | - | Lọc theo tài xế |

**Response:**

```json
{
  "data": [
    {
      "id": "uuid",
      "customerId": "uuid",
      "customer": {
        "id": "uuid",
        "phone": "0909123456",
        "fullName": "Nguyễn Văn A"
      },
      "driverId": "uuid | null",
      "driver": {
        "id": "uuid",
        "user": {
          "fullName": "Trần Văn B",
          "phone": "0912345678"
        }
      },
      "pickupAddress": {
        "address": "123 Nguyễn Huệ, Q1",
        "lat": 10.7731,
        "long": 106.7030
      },
      "dropoffAddress": {
        "address": "Sân bay Tân Sơn Nhất",
        "lat": 10.8184,
        "long": 106.6588
      },
      "status": "SEARCHING",
      "serviceType": "RIDE",
      "price": 150000,
      "finalPrice": 135000,
      "paymentMethod": "CASH",
      "note": "[Admin] Khách VIP",
      "createdAt": "2026-04-14T15:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

---

## 2. Chi tiết booking

```
GET /bookings/admin/:id
```

**Params:** `id` — booking UUID

**Response:** Booking object đầy đủ (bao gồm `shareLink`)

```json
{
  "id": "uuid",
  "customer": { ... },
  "driver": { ... },
  "pickupAddress": { ... },
  "dropoffAddress": { ... },
  "status": "ACCEPTED",
  "price": 150000,
  "finalPrice": 135000,
  "shareLink": "https://d2072mg5s4gnpc.cloudfront.net/share/uuid",
  ...
}
```

---

## 3. Tạo chuyến từ admin ⭐ MỚI

```
POST /bookings/admin/create
```

> 💡 Admin nhập SĐT khách, nếu khách chưa có tài khoản, hệ thống tự tạo mới.

**Request Body:**

```json
{
  "customerPhone": "0909123456",
  "customerName": "Nguyễn Văn A",
  "pickupAddress": {
    "address": "123 Nguyễn Huệ, Quận 1, TP.HCM",
    "lat": 10.7731,
    "long": 106.7030
  },
  "dropoffAddress": {
    "address": "Sân bay Tân Sơn Nhất, Tân Bình, TP.HCM",
    "lat": 10.8184,
    "long": 106.6588
  },
  "serviceType": "RIDE",
  "note": "Khách VIP, cần xe 7 chỗ",
  "driverId": "driver-uuid"
}
```

**Các trường:**

| Trường | Bắt buộc | Type | Mô tả |
|--------|----------|------|-------|
| `customerPhone` | ✅ | string (min 10 ký tự) | SĐT khách hàng |
| `customerName` | ❌ | string | Tên khách (dùng khi tạo tài khoản mới) |
| `pickupAddress` | ✅ | object | Điểm đón `{address, lat, long}` |
| `dropoffAddress` | ✅ | object | Điểm trả `{address, lat, long}` |
| `serviceType` | ❌ | enum | `RIDE` / `DELIVERY` / `CARPOOL`. Mặc định: `RIDE` |
| `note` | ❌ | string | Ghi chú cho chuyến |
| `driverId` | ❌ | string | UUID tài xế, nếu muốn gán luôn. Bỏ trống → dispatch tự động |

**Response:**

```json
{
  "id": "booking-uuid",
  "customerId": "customer-uuid",
  "customer": {
    "id": "customer-uuid",
    "phone": "0909123456",
    "fullName": "Nguyễn Văn A"
  },
  "pickupAddress": { ... },
  "dropoffAddress": { ... },
  "status": "SEARCHING",
  "price": 185000,
  "finalPrice": 185000,
  "paymentMethod": "CASH",
  "note": "[Admin] Khách VIP, cần xe 7 chỗ",
  "shareLink": "https://d2072mg5s4gnpc.cloudfront.net/share/booking-uuid",
  "createdAt": "2026-04-14T22:30:00.000Z"
}
```

**Lỗi có thể gặp:**

| Status | Mô tả |
|--------|-------|
| 400 | `customerPhone` không hợp lệ (< 10 ký tự) |
| 400 | Thiếu `pickupAddress` hoặc `dropoffAddress` |
| 401 | Token không hợp lệ |
| 403 | Không phải admin |

---

## 4. Admin nhận chuyến ⭐ MỚI

```
POST /bookings/admin/:id/accept
```

> 💡 Gán booking cho tài khoản admin operator (người đang đăng nhập).
> Admin phải có driver profile để nhận chuyến.
> **Không trừ commission** cho operator.

**Params:** `id` — booking UUID

**Request Body:** Không cần body

**Response:**

```json
{
  "id": "booking-uuid",
  "customerId": "customer-uuid",
  "driverId": "operator-driver-uuid",
  "status": "ACCEPTED",
  "note": "[Admin] Tạo bởi admin\n[Admin nhận chuyến]",
  ...
}
```

**Lỗi có thể gặp:**

| Status | Mô tả |
|--------|-------|
| 400 | Admin chưa có driver profile |
| 400 | Booking không ở trạng thái SEARCHING/SCHEDULED |
| 404 | Booking không tồn tại |

---

## 5. Chuyển quốc cho tài xế

```
PUT /bookings/admin/:id/reassign
```

> 💡 Chuyển booking từ operator (hoặc tài xế hiện tại) sang tài xế mới.
> Tài xế cũ sẽ nhận thông báo huỷ, tài xế mới nhận thông báo gán chuyến.

**Request Body:**

```json
{
  "driverId": "new-driver-uuid"
}
```

**Params:** `id` — booking UUID

**Response:** Updated booking object

**Flow đề xuất cho UI:**
1. Admin nhấn "Chuyển quốc"
2. Hiển thị dropdown danh sách tài xế (gọi API #7)
3. Gửi request reassign với `driverId` đã chọn

---

## 6. Cập nhật trạng thái

```
POST /bookings/admin/:id/status
```

**Request Body:**

```json
{
  "status": "COMPLETED",
  "note": "Admin xác nhận hoàn thành"
}
```

| Status hợp lệ | Mô tả |
|----------------|-------|
| `COMPLETED` | Hoàn thành |
| `CANCELLED` | Huỷ chuyến |
| `SEARCHING` | Tìm tài xế |
| `ACCEPTED` | Đã có tài xế |

---

## 7. Danh sách tài xế khả dụng

```
GET /bookings/admin/available-drivers
```

**Query Params:**

| Param | Type | Mô tả |
|-------|------|-------|
| `lat` | number | Vĩ độ (optional) |
| `long` | number | Kinh độ (optional) |

**Response:** Danh sách driver đã approved

---

## 8. Enums & Data Types

### BookingStatus

```
CREATED          → Vừa tạo
SEARCHING        → Đang tìm tài xế
PENDING_MATCHING → Đang matching
ACCEPTED         → Tài xế đã nhận
ARRIVED          → Tài xế đã đến
PICKED_UP        → Đã đón khách
COMPLETED        → Hoàn thành
CANCELLED        → Đã huỷ
DELIVERY_FAILED  → Giao hàng thất bại
SCHEDULED        → Đặt lịch
DELAYED_WAITING  → Chờ hoãn
```

### ServiceType

```
RIDE     → Chở khách
DELIVERY → Giao hàng
CARPOOL  → Đi chung
```

### PaymentMethod

```
CASH   → Tiền mặt
WALLET → Ví điện tử
```

### Address Object

```json
{
  "address": "Tên đầy đủ địa chỉ",
  "lat": 10.7731,
  "long": 106.7030
}
```

---

## Flow UI đề xuất

### Màn hình "Tạo chuyến"

```
┌─────────────────────────────────────────┐
│  Tạo chuyến mới                         │
│                                         │
│  📞 SĐT Khách: [_______________]       │
│  👤 Tên khách:  [_______________]       │
│                                         │
│  📍 Điểm đón:   [_______________] 🔍   │
│  📍 Điểm trả:   [_______________] 🔍   │
│                                         │
│  🚗 Loại dịch vụ: [RIDE ▼]             │
│  📝 Ghi chú:    [_______________]       │
│                                         │
│  👨‍✈️ Gán tài xế:  [Chọn tài xế ▼]       │
│                    (hoặc để trống →      │
│                     dispatch tự động)    │
│                                         │
│        [  Tạo chuyến  ]                 │
└─────────────────────────────────────────┘
```

### Flow "Nhận chuyến → Chuyển quốc"

```
1. Danh sách booking (status = SEARCHING)
   │
   ├── [Nhận chuyến]  →  POST /bookings/admin/:id/accept
   │                      (gán về operator)
   │
   └── [Chuyển quốc]  →  PUT /bookings/admin/:id/reassign
                          (chọn tài xế thực tế)
```

---

## Tài khoản Operator

> ⚠️ **Quan trọng**: Cần tạo tài khoản operator trong DB trước khi sử dụng tính năng "Nhận chuyến".
>
> - Phone: `0000000000`
> - Role: `ADMIN`
> - Phải có driver profile (bảng `driver`)
