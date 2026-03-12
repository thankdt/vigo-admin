# Admin API Guideline (Configuration & Management)

This document outlines the API endpoints for system configuration and management, including Administrative Units, Defined Routes, Pricing, Users, Drivers, and Bookings.

## 0. Authentication
**All Admin APIs require a valid JWT Token with `role: 'ADMIN'`.**

### Login
- **Endpoint**: `POST /auth/login` (Same as User/Driver app)
- **Body**:
  ```json
  {
    "phone": "0999999999",
    "pass": "admin123"
  }
  ```
- **Response**: Returns `access_token`. Use this token in the `Authorization: Bearer <token>` header for all subsequent requests.

### Default Admin Credentials
- **Phone**: `0999999999`
- **Password**: `admin123`

---


## 1. Master Data
**Base URL**: `https://api.vigo.com/master-data`

### Administrative Units
#### Create Admin Unit
- **Endpoint**: `POST /admin-units`
- **Body**:
  ```json
  {
    "name": "Hà Nội",
    "level": "PROVINCE", // PROVINCE, DISTRICT, WARD
    "parentId": 1 // Optional (for DISTRICT/WARD)
  }
  ```
- **Response**: Created Admin Unit object.

#### Get All Admin Units
- **Endpoint**: `GET /admin-units`
- **Response**: List of Admin Units.

### Defined Routes
#### Create Route
- **Endpoint**: `POST /routes`
- **Body**:
  ```json
  {
    "name": "Hà Nội - Hải Dương (QL5)",
    "basePolyline": "...", // Optional
    "imageKey": "routes/hanoi-haiduong.jpg", // Optional S3 Key
    "districtIds": [1, 2, 3, 4, 5] // List of District IDs this route passes through (e.g., Gia Lam, Van Lam, Cam Giang...)
  }
  ```
- **Response**: Created Route object with `districts` relation and signed `imageUrl` (if `imageKey` was provided).

#### Get All Routes
- **Endpoint**: `GET /routes`
- **Response**: List of Defined Routes including their districts.

#### Update Route
- **Endpoint**: `POST /routes/:id`
- **Body**: Same as Create (support partial update, e.g., `{ "imageKey": "new-image.jpg" }`).
- **Response**: Updated Route (with signed `imageUrl` if applicable).

#### Delete Route
- **Endpoint**: `POST /routes/:id/delete`
- **Response**: Success status.

### Route Pricing (District-Based)
#### Create Pricing
- **Endpoint**: `POST /pricing`
- **Description**: Configure the price for dropping off at a specific District on a specific Route.
- **Body**:
  ```json
  {
    "routeId": 1,
    "adminUnitId": 105, // District ID (e.g., Tứ Kỳ)
    "price": 200000,
    "priority": 1, // 1: District, 2: Ward (Higher priority overrides)
    "serviceType": "DELIVERY" // DELIVERY | CARPOOL | RIDE (default: DELIVERY)
  }
  ```
- **Response**: Created Pricing object.
- **Lưu ý**: Mỗi tuyến có thể có nhiều dòng giá cho các loại dịch vụ khác nhau. Ví dụ:
  - `serviceType: "DELIVERY"` → giá giao hàng
  - `serviceType: "CARPOOL"` → giá xe ghép (per seat)

#### Update Pricing
- **Endpoint**: `POST /pricing/:id`
- **Body**: `{ "price": 250000 }` (có thể cập nhật `serviceType` nếu cần)
- **Response**: Update result.

#### Delete Pricing
- **Endpoint**: `POST /pricing/:id/delete`
- **Response**: Delete result.

#### Get Pricing by Route
- **Endpoint**: `GET /pricing/:routeId`
- **Query Params**:
  - `serviceType` (optional): `DELIVERY` | `CARPOOL` | `RIDE` — Filter theo loại dịch vụ. Nếu không truyền sẽ trả về tất cả.
- **Response**: List of pricing configurations for the route.

## 2. Driver Management
**Base URL**: `https://api.vigo.com/drivers/admin`

### Get Drivers List
- **Endpoint**: `GET /list`
- **Query Params**:
  - `page`: default 1
  - `limit`: default 20
  - `isApproved`: 'true' | 'false' | 'pending'
  - `search`: Name, Phone, or Vehicle Plate
- **Response**: Paginated list of drivers.

### Approve Driver
- **Endpoint**: `POST /:id/approve`
- **Response**: Approved Driver object.

### Reject Driver
- **Endpoint**: `POST /:id/reject`
- **Body**: `{ "reason": "Missing documents" }`
- **Response**: Rejected Driver object.

## 3. User Management
**Base URL**: `https://api.vigo.com/users/admin`

### Get Users List
- **Endpoint**: `GET /list`
- **Query Params**:
  - `page`: default 1
  - `limit`: default 20
  - `search`: Name or Phone
  - `role`: USER | DRIVER
- **Response**: Paginated list of users.

### Lock User
- **Endpoint**: `POST /:id/lock`
- **Response**: User deactivated.

### Unlock User
- **Endpoint**: `POST /:id/unlock`
- **Response**: User activated.

## 4. Booking Management
**Base URL**: `https://api.vigo.com/bookings/admin`

### Get All Bookings
- **Endpoint**: `GET /list`
- **Query Params**:
  - `page`: default 1
  - `limit`: default 20
  - `status`: SEARCHING, ACCEPTED, COMPLETED, CANCELLED...
  - `customerId`: Filter by Customer ID
  - `driverId`: Filter by Driver User ID
- **Response**: Paginated list of bookings.

### Get Booking Detail
- **Endpoint**: `GET /:id`
- **Response**: Full booking details including Driver and Customer info.

### Update Booking Status
- **Endpoint**: `POST /:id/status`
- **Body**:
  ```json
  {
    "status": "CANCELLED", // or COMPLETED, REJECTED, etc.
    "note": "Customer called to cancel"
  }
  ```
- **Response**: Updated Booking object.
- **Side Effect**: Sends `booking_status_updated` socket event to relevant Customer and Driver.

### Get Available Drivers
- **Endpoint**: `GET /available-drivers`
- **Query Params**:
  - `lat`: Admin's viewport center latitude (optional)
  - `long`: Admin's viewport center longitude (optional)
- **Response**: List of online drivers with their locations and current status.

### Reassign Booking
- **Endpoint**: `PUT /:id/reassign`
- **Body**:
  ```json
  {
    "driverId": "uuid-driver-id"
  }
  ```
- **Response**: Updated Booking object with new driver.
- **Side Effect**:
  - Notifies old driver (if any) of cancellation/unassignment.
  - Notifies new driver of assignment.
  - Notifies customer of driver update.

## 5. System Configuration
**Base URL**: `https://api.vigo.com/master-data/system-config`

### Get All Configurations
- **Endpoint**: `GET /`
- **Response**: List of all system configurations.

### Get Configuration by Key
- **Endpoint**: `GET /:key`
- **Response**: Single configuration object.

### Create/Update Configuration
- **Endpoint**: `POST /`
- **Body**:
  ```json
  {
    "key": "PRICING_BASE_PRICE",
    "value": "20000",
    "description": "Base price for first 2km"
  }
  ```
- **Response**: Updated configuration.

### Common Configuration Keys
| Key | Default Value | Description |
| :--- | :--- | :--- |
| `PRICING_BASE_PRICE` | 15000 | Base price (VND) |
| `PRICING_BASE_DISTANCE` | 2 | Distance included in base price (km) |
| `PRICING_PER_KM` | 5000 | Price per additional km (VND) |
| `HOTLINE` | 1900 1234 | Customer support hotline |
| `DEFAULT_SEARCH_RADIUS` | 5 | Driver search radius (km) |
| `LOYALTY_SILVER_PERCENT` | 3 | Discount % for Silver Tier |
| `LOYALTY_GOLD_PERCENT` | 5 | Discount % for Gold Tier |
| `LOYALTY_DIAMOND_PERCENT` | 10 | Discount % for Diamond Tier |
| `PRICING_WEEKEND_SURCHARGE` | 10000 | Surcharge for Sat/Sun (VND) |
| `PRICING_HOLIDAY_SURCHARGE` | 20000 | Surcharge for Holidays (VND) |

## 6. Voucher / Promotion Management
**Base URL**: `https://api.vigo.com/promotions`

### Create Voucher (Admin)
- **Endpoint**: `POST /`
- **Body**:
  ```json
  {
    "code": "WELCOME50",
    "name": "Giảm 50k cho bạn mới",
    "discountType": "FIXED_AMOUNT", // FIXED_AMOUNT or PERCENTAGE
    "discountValue": 50000,
    "minOrderValue": 100000,
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-12-31T23:59:59Z",
    "usageLimit": 1000,
    "pointCost": 0, // 0 if free, >0 if redeemable with loyalty points
    "imageUrl": "https://..."
  }
  ```
- **Response**: Created Promotion object.

### List Vouchers
- **Endpoint**: `GET /?type=standard`
- **Response**: List of active promotions.

## 8. Banner Management
**Base URL**: `https://api.vigo.com/banners`

### Get All Banners (Admin)
- **Endpoint**: `GET /admin`
- **Response**: List of all banners.

### Create Banner
- **Endpoint**: `POST /`
- **Body**:
  ```json
  {
    "imageUrl": "https://...",
    "priority": 10,
    "isActive": true
  }
  ```
- **Response**: Created Banner object.

### Update Banner
- **Endpoint**: `PUT /:id`
- **Body**: (Partial Update)
  ```json
  {
    "priority": 5,
    "isActive": false
  }
  ```
- **Response**: Updated Banner object.

### Delete Banner
- **Endpoint**: `DELETE /:id`
- **Response**: Soft deleted banner object.

## 9. News Management
**Base URL**: `https://api.vigo.com/news`

### Get All News (Admin)
- **Endpoint**: `GET /admin`
- **Query Params**: `page`, `limit`
- **Response**: List of all news (active & inactive). **Excludes soft-deleted items.**

### Create News
- **Endpoint**: `POST /`
- **Body**:
  ```json
  {
    "title": "Update 2.0 Released",
    "description": "We have added new features...",
    "imageUrl": "https://...",
    "link": "https://...",
    "isActive": true
  }
  ```
- **Response**: Created News object.

### Update News
- **Endpoint**: `PUT /:id`
- **Body**: (Partial Update)
  ```json
  {
    "title": "Update 2.1 Fixed",
    "isActive": false
  }
  ```
- **Response**: Updated News object.

### Delete News
- **Endpoint**: `DELETE /:id`
- **Response**: Soft deleted news object (DeletedAt set).

## 10. Common Workflows

### Workflow 1: Configuring a New Route (e.g., Hà Nội - Hưng Yên)
1.  **Check Administrative Units**:
    *   Call `GET /master-data/admin-units` to check if "Hưng Yên", "Văn Giang", "Văn Lâm" exist.
    *   If missing, call `POST /master-data/admin-units` to create them.
2.  **Create the Route**:
    *   Call `POST /master-data/routes` with:
        ```json
        {
          "name": "Hà Nội - Hưng Yên",
          "districtIds": [10, 11, 12, 13] // IDs of districts the route passes through
        }
        ```
3.  **Configure Pricing**:
    *   Call `POST /master-data/pricing` for each destination district:
        ```json
        {
          "routeId": <new_route_id>,
          "adminUnitId": 11, // District ID (e.g., Van Giang)
          "price": 250000
        }
        ```

### Workflow 2: Approving a New Driver
1.  **Find Pending Drivers**:
    *   Call `GET /drivers/admin/list?isApproved=pending`.
2.  **Review Application**:
    *   Check `licenseImages`, `cccdImages`, `vehicleRegistration` in the response.
3.  **Action**:
    *   If OK: Call `POST /drivers/admin/:id/approve`.
    *   If Missing Info: Call `POST /drivers/admin/:id/reject` with `{ "reason": "Ảnh bằng lái mờ" }`.

### Workflow 3: Handling Problematic User
1.  **Search User**:
    *   Call `GET /users/admin/list?search=0912345678`.
2.  **Lock Account**:
    *   Call `POST /users/admin/:id/lock`.
    *   The user will be immediately logged out (token revoked/invalidated).

### Workflow 4: Cấu hình Giá Xe Ghép (Carpool) cho Tuyến
1.  **Kiểm tra tuyến đã có giá DELIVERY chưa**:
    *   Call `GET /master-data/pricing/:routeId?serviceType=DELIVERY` → xác nhận giá giao hàng đã có.
2.  **Tạo giá Carpool cho từng huyện trên tuyến**:
    *   Call `POST /master-data/pricing` cho mỗi huyện:
        ```json
        {
          "routeId": 10,
          "adminUnitId": 25,
          "price": 120000,
          "serviceType": "CARPOOL"
        }
        ```
    *   **Lưu ý**: Giá Carpool là giá **per seat** (1 ghế). Nếu khách đặt 2 ghế, hệ thống tự nhân `price × 2`.
3.  **Kiểm tra giá đã tạo**:
    *   Call `GET /master-data/pricing/:routeId?serviceType=CARPOOL` → xác nhận giá carpool đã có.
4.  **Cấu hình Chặng (Start-End)** _(tùy chọn)_:
    *   Có thể thêm `startDistrictId` để cấu hình giá chính xác hơn, giống logic giao hàng.
