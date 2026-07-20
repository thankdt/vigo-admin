// Pure helper: quyết định CARPOOL/RIDE có áp dụng "loại xe" không — dùng
// CHUNG cho (a) điều kiện hiện select "Loại xe" trong JSX và (b) điều kiện
// gửi requestedVehicleType lên backend, để 2 nơi này KHÔNG THỂ lệch nhau
// (bug gốc của tính năng này: UI ẩn field mà payload logic lại tưởng có
// field để gửi — vì 2 điều kiện từng được viết độc lập ở 2 nơi).
// Backend dùng requestedVehicleType để auto-switch CARPOOL→RIDE khi
// requestedSeats >= sức chứa xe (CAR_4=4, CAR_7=6) — CHỈ chạy nếu field này
// có mặt trong request.

export type ServiceType = 'RIDE' | 'DELIVERY' | 'CARPOOL';
export type VehicleType = 'CAR_4' | 'CAR_7';

export function isVehicleTypeApplicable(serviceType: ServiceType): boolean {
  return serviceType === 'RIDE' || serviceType === 'CARPOOL';
}

export function resolveRequestedVehicleType(
  serviceType: ServiceType,
  vehicleType: VehicleType,
): VehicleType | undefined {
  return isVehicleTypeApplicable(serviceType) ? vehicleType : undefined;
}
