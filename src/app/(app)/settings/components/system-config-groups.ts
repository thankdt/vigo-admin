import { DollarSign, Navigation, Car, Smartphone, Gift, Plug, ShieldAlert, PhoneOff, type LucideIcon } from 'lucide-react';

// Group the flat system_config list by key prefix so the page stays scannable.
// Order matters: keys are tested top-to-bottom and land in the FIRST match — so
// `*_APP_*` is caught before the generic DRIVER_ rule, and the last group is a
// catch-all. Each group maps cleanly to a future RBAC permission (hide a group).
export type ConfigGroup = { id: string; label: string; icon: LucideIcon; danger?: boolean; match: (key: string) => boolean };

export const CONFIG_GROUPS: ConfigGroup[] = [
  { id: 'app', label: 'Phiên bản App', icon: Smartphone, match: (k) => k.includes('_APP_') },
  { id: 'pricing', label: 'Giá & Hoa hồng', icon: DollarSign, match: (k) => k.startsWith('PRICING_') || k.endsWith('COMMISSION_RATE') },
  {
    id: 'dispatch', label: 'Điều phối & Tuyến', icon: Navigation, danger: true,
    match: (k) =>
      k.startsWith('DISPATCH_') || k.startsWith('ROUTE_') || k.startsWith('CHAIN_') ||
      ['RIDE_ALLOW_OFF_ROUTE', 'STRICT_ROUTE_MATCH', 'ROUTE_MATCH_SHADOW', 'DEFAULT_SEARCH_RADIUS', 'ARRIVED_GEOFENCE_RADIUS_M', 'SEARCHING_STALE_THRESHOLD_MS', 'STATUS_EVENT_LOGGING_ENABLED'].includes(k),
  },
  { id: 'driver', label: 'Tài xế', icon: Car, match: (k) => k.startsWith('DRIVER_') },
  {
    id: 'growth', label: 'Giới thiệu & Hạng thành viên', icon: Gift,
    // Loyalty redesign: tier points (TIER_*) + reward points / Vcoin (REWARD_*)
    // join the existing REFERRAL_/LOYALTY_ keys in this group.
    match: (k) =>
      k.startsWith('REFERRAL_') || k.startsWith('LOYALTY_') ||
      k.startsWith('TIER_') || k.startsWith('REWARD_') || k === 'SIGNUP_LOYALTY_REWARD',
  },
  {
    id: 'cancel', label: 'Chống huỷ chuyến (khoá tài xế)', icon: ShieldAlert, danger: true,
    match: (k) => k.startsWith('CANCEL_'),
  },
  {
    id: 'phone-reveal', label: 'Ẩn số điện thoại khách', icon: PhoneOff,
    match: (k) => k.startsWith('PHONE_REVEAL_'),
  },
  { id: 'misc', label: 'Tích hợp & Khác', icon: Plug, match: () => true }, // catch-all — must stay last
];

export const groupIdFor = (key: string) =>
  (CONFIG_GROUPS.find((g) => g.match(key)) ?? CONFIG_GROUPS[CONFIG_GROUPS.length - 1]).id;

// Chia config vào nhóm, áp filter tìm kiếm + gate quyền (RBAC). `canGroup(groupId)` do
// caller cung cấp (super -> luôn true). Chỉ trả nhóm user có quyền VÀ có ít nhất 1 item
// khớp query. Tách thuần để test không cần render cả manager (jsdom/Radix).
export function buildConfigGroups<T extends { key: string; description?: string | null }>(
  configs: T[],
  query: string,
  canGroup: (groupId: string) => boolean,
): { group: ConfigGroup; items: T[] }[] {
  const q = query.trim().toLowerCase();
  const visible = q
    ? configs.filter((c) => c.key.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q))
    : configs;
  return CONFIG_GROUPS
    .filter((g) => canGroup(g.id))
    .map((g) => ({ group: g, items: visible.filter((c) => groupIdFor(c.key) === g.id) }))
    .filter((entry) => entry.items.length > 0);
}
