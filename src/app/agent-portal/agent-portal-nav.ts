import { LayoutDashboard, ListOrdered, PlusCircle, Wallet } from 'lucide-react';
import { AGENT_MULTI_STOP_ENABLED } from './agent-portal-flags';

/**
 * Sidebar cổng đại lý.
 *
 * Để riêng file này thay vì khai trong `(portal)/layout.tsx` vì Next App Router
 * CẤM `layout.tsx` export thêm bất cứ thứ gì ngoài `default`/`metadata`/… —
 * export thừa làm `npx tsc --noEmit` đỏ ở `.next/types` (mà `npm run build`
 * lại nuốt vì `ignoreBuildErrors`).
 *
 * Mục bị tắt vẫn nằm trong `ALL_NAV_ITEMS` (thay vì xoá) để đọc code là thấy
 * ngay đang TẮT TẠM, không phải chưa từng có.
 */
export const ALL_NAV_ITEMS = [
  { href: '/agent-portal/dashboard', label: 'Tổng quan', icon: LayoutDashboard, enabled: true },
  { href: '/agent-portal/orders/new', label: 'Đặt hộ mới', icon: PlusCircle, enabled: AGENT_MULTI_STOP_ENABLED },
  { href: '/agent-portal/orders', label: 'Đơn của tôi', icon: ListOrdered, enabled: true },
  { href: '/agent-portal/wallet', label: 'Ví & Rút tiền', icon: Wallet, enabled: true },
];

export const visibleNavItems = () => ALL_NAV_ITEMS.filter((i) => i.enabled);
