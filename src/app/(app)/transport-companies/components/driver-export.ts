import type { Driver } from '@/lib/types';
import { driverApprovalLabel } from '../../drivers/components/driver-approval';

// Column order for the per-HTX driver xlsx export. Kept next to the row builder
// so header and cells can't drift apart.
export const DRIVER_EXPORT_HEADER = [
  'STT',
  'Tên',
  'SĐT',
  'Biển số xe',
  'Loại xe',
  'Tuyến',
  'Trạng thái duyệt',
  'Trạng thái',
  'Ngày tạo',
];

const onlineLabel = (s: Driver['status']): string =>
  s === 'ONLINE' ? 'Online' : s === 'BUSY' ? 'Bận' : 'Offline';

const vehicleLabel = (d: Driver): string => {
  const brand = d.vehicleRegistration?.brand ?? '';
  const model = d.vehicleRegistration?.model ?? d.vehicle?.model ?? '';
  const seats = d.vehicleRegistration?.seats;
  const base = [brand, model].filter(Boolean).join(' ').trim();
  if (base && seats) return `${base} (${seats} chỗ)`;
  if (base) return base;
  return seats ? `${seats} chỗ` : '';
};

const routeLabel = (d: Driver): string =>
  d.routes && d.routes.length > 0 ? d.routes.map((r) => r.name).join(', ') : d.fixedRoute?.name ?? '';

// VN-time date (DD/MM/YYYY), browser-timezone-independent (shift +7h then read UTC parts).
const fmtDateVn = (iso?: string): string => {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const d = new Date(t + 7 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};

/** Build the xlsx body rows (aligned with DRIVER_EXPORT_HEADER) for one HTX's drivers. */
export function driverExportRows(drivers: Driver[]): Array<Array<string | number>> {
  return drivers.map((d, i) => [
    i + 1,
    d.name || d.user?.fullName || '',
    d.phone || d.user?.phone || '',
    d.vehicle?.plateNumber || d.vehicleRegistration?.plateNumber || '',
    vehicleLabel(d),
    routeLabel(d),
    driverApprovalLabel(d),
    onlineLabel(d.status),
    fmtDateVn(d.createdAt || d.user?.createdAt),
  ]);
}
