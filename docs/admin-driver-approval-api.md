# Admin API - Quản lý xét duyệt tài xế
Tài liệu hướng dẫn cách sử dụng các endpoint Admin để quản trị và xét duyệt hồ sơ tài xế trong hệ thống Vigo.

---

## 1. Flow Xét Duyệt Tài Xế (Approval Flow)

1. **Phía App Tài Xế:**
   - Hoàn tất cập nhật các trường bắt buộc (`licenseImages`, `cccdImages`, `vehicleRegistration`, `fixedRouteId`).
   - Gọi API `POST /drivers/submit-for-approval`.
   - Trạng thái profile lúc này: `isSubmittedForApproval = true`, `isApproved = false`.
   
2. **Hệ thống Quản Trị (Admin):**
   - Admin gọi API danh sách `GET /drivers/admin/list?isApproved=pending` để lấy tất cả hồ sơ đang đợi phê duyệt từ các tài xế.
   - Khi Admin xem chi tiết và ấn **"Duyệt"**: 
     Gọi API `POST /drivers/admin/:id/approve` và chọn các dịch vụ sẽ mở cho tài xế (ví dụ: `CARPOOL`, `DELIVERY`). Trạng thái chuyển sang `isApproved = true`.
   - Khi Admin ấn **"Từ chối"**: 
     Gọi API `POST /drivers/admin/:id/reject`. Hệ thống trả hồ sơ về trạng thái ban đầu (`isSubmittedForApproval = false`, `isApproved = false`).

---

## 2. Các API Endpoint

Tất cả các API Admin yêu cầu header:
```
Authorization: Bearer <Admin_JWT_Token>
```

### 2.1. API Lấy Danh Sách Tài Xế (Kèm Filter Trạng Thái Duyệt)

**Endpoint:** `GET /drivers/admin/list`

**Query Parameters:**
| Field | Type | Default | Mô tả |
| :--- | :--- | :--- | :--- |
| `page` | `number` | `1` | Số trang (phân trang). |
| `limit` | `number` | `20` | Giới hạn số phần tử một trang. |
| `search` | `string` | `undefined` | Keyword hỗ trợ tìm kiếm qua (Tên, SĐT, Biển số xe). |
| `isApproved` | `string` | `undefined` | Trạng thái hiển thị duyệt. Options:<br/>- `'true'`: Các tài xế đã được duyệt.<br/>- `'false'`: Các tài xế CHƯA được duyệt.<br/>- `'pending'`: Các tài xế **Đã gửi yêu cầu và đang chờ duyệt**. |

*Lưu ý: Để hiển thị danh sách hồ sơ cần Admin vào duyệt, hãy truyền `?isApproved=pending`.*

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "e6dd0932-5a41-4cf1-9456-11fdb1cf16b9",
      "userId": "1b0fb2c7-08ca-4db4-a95e-1886cb5466bc",
      "isApproved": false,
      "licenseNumber": "123456789012",
      "licenseImages": [
        "https://vigo-bucket.s3.amazonaws.com/license-front.jpg",
        "https://vigo-bucket.s3.amazonaws.com/license-back.jpg"
      ],
      "cccdImages": [
        "https://vigo-bucket.s3.amazonaws.com/cccd-front.jpg",
        "https://vigo-bucket.s3.amazonaws.com/cccd-back.jpg"
      ],
      "vehicleRegistration": {
        "plateNumber": "29A-12345",
        "brand": "Toyota",
        "model": "Vios",
        "color": "White"
      },
      "enabledDropoffDistricts": [1, 2, 3],
      "fixedRouteId": 1,
      "currentLocation": null,
      "status": "OFFLINE",
      "availableSeats": 0,
      "enabledServices": [
        "RIDE",
        "DELIVERY"
      ],
      "isSubmittedForApproval": true,
      "createdAt": "2026-04-08T10:00:00.000Z",
      "updatedAt": "2026-04-08T10:05:00.000Z",
      "user": {
        "id": "1b0fb2c7-08ca-4db4-a95e-1886cb5466bc",
        "role": "DRIVER",
        "phone": "0888888888",
        "password": null,
        "email": "driver1@example.com",
        "fullName": "Nguyễn Văn Driver",
        "avatar": "default_avatar.png",
        "googleId": null,
        "appleId": null,
        "isActive": true,
        "tokenVersion": 0,
        "loyaltyPoints": 150,
        "loyaltyTier": "MEMBER",
        "deletedAt": null
      },
      "fixedRoute": {
        "id": 1,
        "name": "Hà Nội - Nam Định",
        "description": "Tuyến cao tốc Pháp Vân",
        "originProvince": "Hà Nội",
        "destinationProvince": "Nam Định",
        "basePrice": 150000,
        "isActive": true,
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

---

### 2.2. API Duyệt Tài Xế

**Endpoint:** `POST /drivers/admin/:id/approve`

**Path Variables:**
- `id`: UUID của bộ hồ sơ driver (`driver.id`)

**Body Payload:**
```json
{
  "enabledServices": ["RIDE", "CARPOOL", "DELIVERY"] 
}
```

**Enums (`ServiceType`):**
- `RIDE`: Dịch vụ Taxi / Đặt xe ngay.
- `DELIVERY`: Dịch vụ Giao hàng.
- `CARPOOL`: Dịch vụ Đi chung xe (Ghép chuyến).

**Response (200/201 OK):**
Trả về Object hồ sơ tài xế đã cập nhật (không query field `user` và `fixedRoute` trừ khi config return).
```json
{
  "id": "e6dd0932-5a41-4cf1-9456-11fdb1cf16b9",
  "userId": "1b0fb2c7-08ca-4db4-a95e-1886cb5466bc",
  "isApproved": true,
  "licenseNumber": "123456789012",
  "licenseImages": [
    "https://vigo-bucket.s3.amazonaws.com/license-front.jpg",
    "https://vigo-bucket.s3.amazonaws.com/license-back.jpg"
  ],
  "cccdImages": [
    "https://vigo-bucket.s3.amazonaws.com/cccd-front.jpg",
    "https://vigo-bucket.s3.amazonaws.com/cccd-back.jpg"
  ],
  "vehicleRegistration": {
    "plateNumber": "29A-12345",
    "brand": "Toyota",
    "model": "Vios",
    "color": "White"
  },
  "enabledDropoffDistricts": [1, 2, 3],
  "fixedRouteId": 1,
  "currentLocation": null,
  "status": "OFFLINE",
  "availableSeats": 0,
  "enabledServices": [
    "RIDE",
    "CARPOOL",
    "DELIVERY"
  ],
  "isSubmittedForApproval": true,
  "createdAt": "2026-04-08T10:00:00.000Z",
  "updatedAt": "2026-04-08T10:15:00.000Z"
}
```

---

### 2.3. API Từ chối Duyệt Tài Xế

**Endpoint:** `POST /drivers/admin/:id/reject`

**Path Variables:**
- `id`: UUID của bộ hồ sơ driver (`driver.id`)

**Body Payload:**
```json
{
  "reason": "Vui lòng chụp lại hình ảnh CMND do bị mờ góc hoặc sai mặt."
}
```
*(Ghi chú: Lý do hiện tại có thể lưu log ở client/admin cho driver nhìn thấy nếu có front-end tích hợp)*

**Response (200/201 OK):**
```json
{
  "id": "e6dd0932-5a41-4cf1-9456-11fdb1cf16b9",
  "userId": "1b0fb2c7-08ca-4db4-a95e-1886cb5466bc",
  "isApproved": false,
  "licenseNumber": "123456789012",
  "licenseImages": [
    "https://vigo-bucket.s3.amazonaws.com/license-front.jpg",
    "https://vigo-bucket.s3.amazonaws.com/license-back.jpg"
  ],
  "cccdImages": [
    "https://vigo-bucket.s3.amazonaws.com/cccd-front.jpg",
    "https://vigo-bucket.s3.amazonaws.com/cccd-back.jpg"
  ],
  "vehicleRegistration": {
    "plateNumber": "29A-12345",
    "brand": "Toyota",
    "model": "Vios",
    "color": "White"
  },
  "enabledDropoffDistricts": [1, 2, 3],
  "fixedRouteId": 1,
  "currentLocation": null,
  "status": "OFFLINE",
  "availableSeats": 0,
  "enabledServices": [
    "RIDE",
    "DELIVERY"
  ],
  "isSubmittedForApproval": false,
  "createdAt": "2026-04-08T10:00:00.000Z",
  "updatedAt": "2026-04-08T10:20:00.000Z"
}
```
