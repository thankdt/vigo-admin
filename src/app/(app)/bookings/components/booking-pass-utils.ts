import type { Booking } from '@/lib/types';
import { formatScheduleWindow } from './schedule-window';
import { formatVnDateTime } from '../../leakage-review/leakage-labels';

export const PASS_VEHICLE_TYPE_MAP: Record<string, string> = {
  CAR_4: 'Xe 4 chỗ',
  CAR_7: 'Xe 7 chỗ',
};

export const PASS_SERVICE_TYPE_MAP: Record<string, string> = {
  RIDE: 'Bao xe',
  DELIVERY: 'Giao hàng',
  CARPOOL: 'Đi chung',
};

const fmtVnd = (v: number | string | null | undefined) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(v ?? 0));

export const getAddressText = (addr: string | { address: string; lat?: number; lng?: number; long?: number } | null | undefined): string => {
  if (!addr) return '—';
  if (typeof addr === 'string') return addr;
  return addr.address || '—';
};

/**
 * Tạo nội dung văn bản tổng hợp thông tin chuyến đi để CSKH copy pass vào nhóm Zalo/Telegram.
 * Bao gồm: từ đâu đến đâu, bao xa, sdt khách, bao nhiêu tiền, đi bao người, xe mấy chỗ, hẹn giờ đi.
 */
export function buildTripPassText(booking: Booking): string {
  const pickup = getAddressText(booking.pickupAddress);
  const dropoff = getAddressText(booking.dropoffAddress);

  // Hẹn giờ đi là giờ nào ngày nào
  const scheduleWindow = formatScheduleWindow(
    booking.scheduledFromTime ?? booking.scheduledTime,
    booking.scheduledToTime,
  );
  let timeText = 'Đi ngay';
  if (scheduleWindow) {
    timeText = scheduleWindow;
  } else if (booking.scheduledTime) {
    timeText = formatVnDateTime(booking.scheduledTime);
  }

  // Khoảng cách & Tuyến đường
  const distanceKm = booking.distanceKm != null ? `${Number(booking.distanceKm).toFixed(1)} km` : null;
  let routeLine: string | null = null;
  if (booking.route?.name && distanceKm) {
    routeLine = `🛣 Tuyến đường: ${booking.route.name} (${distanceKm})`;
  } else if (booking.route?.name) {
    routeLine = `🛣 Tuyến đường: ${booking.route.name}`;
  } else if (distanceKm) {
    routeLine = `📏 Khoảng cách: ${distanceKm}`;
  }

  // Xe mấy chỗ & Loại dịch vụ
  const vType = booking.requestedVehicleType ? (PASS_VEHICLE_TYPE_MAP[booking.requestedVehicleType] ?? booking.requestedVehicleType) : null;
  const sType = booking.serviceType ? (PASS_SERVICE_TYPE_MAP[booking.serviceType] ?? booking.serviceType) : null;
  let vehicleInfo = 'Xe 4/7 chỗ';
  if (vType && sType) {
    vehicleInfo = `${vType} (${sType})`;
  } else if (vType) {
    vehicleInfo = vType;
  } else if (sType) {
    vehicleInfo = sType;
  }

  // Đi bao người
  const seatsText = booking.requestedSeats != null ? `${booking.requestedSeats} người` : '1 người';

  // Bao nhiêu tiền cuốc này
  const finalPrice = booking.finalPrice ?? booking.price ?? 0;
  const priceText = fmtVnd(finalPrice);

  const lines = [
    `🚕 THÔNG TIN CHUYẾN ĐI`,
    `⏰ Thời gian: ${timeText}`,
    `📍 Điểm đón: ${pickup}`,
    `📍 Điểm trả: ${dropoff}`,
    routeLine,
    `🚗 Loại xe: ${vehicleInfo}`,
    `👥 Số khách: ${seatsText}`,
    `💰 Cước phí: ${priceText}`,
    booking.note ? `📝 Ghi chú: ${booking.note}` : null,
  ].filter(Boolean);

  return lines.join('\n');
}

