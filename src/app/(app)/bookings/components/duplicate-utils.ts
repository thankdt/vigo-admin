// "Nhân bản chuyến": biến một Booking có sẵn thành bản nháp điền vào form Tạo chuyến.
// Thuần (không I/O, không React) để test được từng quy tắc chép — chỗ dễ sai nhất là
// toạ độ jsonb đa dạng key và khung giờ đón.

import type { Booking } from '@/lib/types';
import { formatLocal } from './schedule-utils';

export type DraftPoint = { address: string; lat: number; long: number };

export type BookingDraft = {
  sourceBookingId: string;
  customerPhone: string;
  customerName: string;
  pickup: DraftPoint | null;
  dropoff: DraftPoint | null;
  // Ô địa chỉ đọc được text nhưng THIẾU toạ độ dùng được → form để trống ô đó và
  // báo admin chọn lại. Không bao giờ tự điền 0/0 (phá ước giá + dispatch).
  missingCoords: Array<'pickup' | 'dropoff'>;
  serviceType: 'RIDE' | 'DELIVERY' | 'CARPOOL';
  vehicleType: 'CAR_4' | 'CAR_7';
  coPassengers: string[];
  note: string;
  isScheduled: boolean;
  // 'YYYY-MM-DDTHH:mm' theo giờ máy — khớp <input type="datetime-local">.
  scheduledFrom: string;
  scheduledTo: string;
  promotionId: number | null;
};

const SERVICE_TYPES = ['RIDE', 'DELIVERY', 'CARPOOL'] as const;
const VEHICLE_TYPES = ['CAR_4', 'CAR_7'] as const;

/** Khung giờ mặc định khi chuyến gốc chỉ có một mốc giờ đón. */
const DEFAULT_WINDOW_MS = 30 * 60_000;

// Backend tự gắn tiền tố "[Admin] " / "[Đặt hộ] " vào note khi admin/đại lý tạo
// chuyến. Chép nguyên sẽ cộng dồn qua mỗi đời nhân bản ("[Admin] [Admin] …") và
// in lên hợp đồng/hiển thị cho tài xế → bóc hết tiền tố ở đầu chuỗi.
const NOTE_PREFIX_RE = /^\s*(\[Admin\]|\[Đặt hộ\])\s*/;
// Note mặc định khi admin/đại lý không nhập gì — chép sang chuyến mới là rác.
const NOTE_PLACEHOLDERS = ['Tạo bởi admin', 'Tạo bởi đại lý'];

function cleanNote(raw: string | null | undefined): string {
  let note = (raw ?? '').trim();
  while (NOTE_PREFIX_RE.test(note)) note = note.replace(NOTE_PREFIX_RE, '');
  return NOTE_PLACEHOLDERS.includes(note) ? '' : note;
}

/**
 * Trần số khách ĐI CÙNG theo loại dịch vụ/xe — khớp cap của form tạo chuyến và
 * app khách (RIDE: CAR_4 → 4 chỗ, CAR_7 → 6; CARPOOL/DELIVERY → 6). Chuyến cũ /
 * dữ liệu import có thể vượt cap; chép nguyên sẽ gửi requestedSeats quá trần.
 */
function maxExtras(serviceType: BookingDraft['serviceType'], vehicleType: BookingDraft['vehicleType']): number {
  const maxTotal = serviceType === 'RIDE' ? (vehicleType === 'CAR_7' ? 6 : 4) : 6;
  return maxTotal - 1;
}

/**
 * Đọc một điểm từ cột jsonb `pickupAddress`/`dropoffAddress`. Cột là jsonb tự do
 * nên rows cũ / bên thứ ba có thể mang `lng`/`latitude`/`longitude` thay vì
 * `lat`/`long` — backend cũng fallback y vậy khi dispatch. Trả null khi không dựng
 * được một điểm có toạ độ thật (0/0 tính là không có).
 */
function readPoint(addr: Booking['pickupAddress'] | Booking['dropoffAddress']): DraftPoint | null {
  if (!addr || typeof addr === 'string') return null;
  const a = addr as Record<string, unknown>;
  const address = typeof a.address === 'string' ? a.address : '';
  const lat = num(a.lat) ?? num(a.latitude);
  const long = num(a.long) ?? num(a.lng) ?? num(a.longitude);
  if (!address || lat == null || long == null) return null;
  if (lat === 0 && long === 0) return null;
  return { address, lat, long };
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

/** ISO → epoch ms, null nếu thiếu hoặc không parse được. */
function parseIso(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

export function bookingToDraft(b: Booking): BookingDraft {
  const pickup = readPoint(b.pickupAddress);
  const dropoff = readPoint(b.dropoffAddress);
  const missingCoords: Array<'pickup' | 'dropoff'> = [];
  if (!pickup) missingCoords.push('pickup');
  if (!dropoff) missingCoords.push('dropoff');

  // senderInfo = snapshot lúc đặt (bền hơn quan hệ customer, vốn có thể bị đổi
  // tên hoặc xoá mềm thành null).
  const customerPhone = b.senderInfo?.phone || b.customer?.phone || '';
  const customerName = b.senderInfo?.name || b.customer?.fullName || '';

  const serviceType = (SERVICE_TYPES as readonly string[]).includes(b.serviceType ?? '')
    ? (b.serviceType as BookingDraft['serviceType'])
    : 'CARPOOL';
  const vehicleType = (VEHICLE_TYPES as readonly string[]).includes(b.requestedVehicleType ?? '')
    ? (b.requestedVehicleType as BookingDraft['vehicleType'])
    : 'CAR_4';

  // passengerNames[0] = khách chính (đã nằm ở ô SĐT/tên) → chỉ lấy khách đi cùng.
  const coPassengers = (b.passengerNames ?? [])
    .slice(1)
    .map((n) => (typeof n === 'string' ? n.trim() : ''))
    .filter(Boolean)
    .slice(0, maxExtras(serviceType, vehicleType));

  // Giờ đón: chép Y NGUYÊN chuyến gốc (kể cả đã ở quá khứ) — admin cần thấy đúng
  // thông tin cũ rồi tự sửa; validateWindow vẫn chặn submit nếu giờ đã qua.
  const fromMs = parseIso(b.scheduledFromTime) ?? parseIso(b.scheduledTime);
  const toMsRaw = parseIso(b.scheduledToTime);
  const isScheduled = fromMs != null;
  const toMs = fromMs == null ? null : (toMsRaw != null && toMsRaw > fromMs ? toMsRaw : fromMs + DEFAULT_WINDOW_MS);

  return {
    sourceBookingId: b.id,
    customerPhone,
    customerName,
    pickup,
    dropoff,
    missingCoords,
    serviceType,
    vehicleType,
    coPassengers,
    note: cleanNote(b.note),
    isScheduled,
    scheduledFrom: fromMs != null ? formatLocal(new Date(fromMs)) : '',
    scheduledTo: toMs != null ? formatLocal(new Date(toMs)) : '',
    promotionId: typeof b.promotionId === 'number' ? b.promotionId : null,
  };
}
