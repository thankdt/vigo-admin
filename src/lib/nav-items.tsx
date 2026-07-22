import {
  LayoutDashboard,
  Settings,
  Users,
  Bot,
  Car,
  Book,
  Map,
  Ticket,
  Bell,
  Newspaper,
  Image as ImageIcon,
  Building2,
  Share2,
  Wallet,
  Crown,
  Store,
  PackageOpen,
  Megaphone,
  DollarSign,
  Scale,
  ArrowDownCircle,
  Receipt,
  MessageSquare,
  ShieldAlert,
  TrendingDown,
  PieChart,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = { href: string; label: string; icon: LucideIcon };
export type NavGroup = { label: string; items: NavItem[] };

// Menu trái admin, gom theo NHÓM chức năng để super/quản-lý-chung dễ quét. Mỗi mục
// (trừ /settings) ánh xạ 1 function trong rbac.ts (MENU_FUNCTION_BY_HREF). Thêm mục
// mới mà quên khai báo function -> test đồng bộ (rbac.test.ts) fail. Nhóm chỉ là
// TRÌNH BÀY — không ảnh hưởng quyền (filter/guard theo href).
export const navGroups: NavGroup[] = [
  {
    label: 'Tổng quan',
    items: [
      { href: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
      { href: '/reports', label: 'Báo cáo', icon: Bot },
      { href: '/acquisition', label: 'Nguồn khách', icon: PieChart },
    ],
  },
  {
    label: 'Vận hành',
    items: [
      { href: '/bookings', label: 'Chuyến đi', icon: Book },
      { href: '/agent-orders', label: 'Đơn đặt hộ', icon: PackageOpen },
      { href: '/drivers', label: 'Tài xế', icon: Car },
      { href: '/driver-cancel-review', label: 'Tỉ lệ huỷ tài xế', icon: TrendingDown },
      { href: '/leakage-review', label: 'Nghi vấn gian lận', icon: ShieldAlert },
      { href: '/feedback', label: 'Góp ý tài xế', icon: MessageSquare },
    ],
  },
  {
    label: 'Người dùng & Đối tác',
    items: [
      { href: '/users', label: 'Người dùng', icon: Users },
      { href: '/transport-companies', label: 'Đơn vị vận tải', icon: Building2 },
      { href: '/agent', label: 'Đại lý đặt hộ', icon: Store },
      { href: '/kol', label: 'KOL/KOC', icon: Crown },
      { href: '/referrals', label: 'Affiliate', icon: Share2 },
    ],
  },
  {
    label: 'Tài chính',
    items: [
      { href: '/finance', label: 'Tài chính', icon: DollarSign },
      { href: '/withdrawals', label: 'Lệnh rút tiền', icon: Wallet },
      { href: '/driver-cashflow', label: 'Dòng tiền tài xế', icon: ArrowDownCircle },
      { href: '/htx-reconciliation', label: 'Đối soát HTX', icon: Scale },
      { href: '/invoices', label: 'Hoá đơn', icon: Receipt },
    ],
  },
  {
    label: 'Nội dung & Thông báo',
    items: [
      { href: '/promotions', label: 'Khuyến mãi', icon: Ticket },
      { href: '/news', label: 'Tin tức', icon: Newspaper },
      { href: '/banners', label: 'Banner', icon: ImageIcon },
      { href: '/app-popups', label: 'Popup quảng cáo', icon: Megaphone },
      { href: '/notifications', label: 'Thông báo', icon: Bell },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      { href: '/master-data', label: 'Dữ liệu chung', icon: Map },
      { href: '/settings', label: 'Cài đặt', icon: Settings },
    ],
  },
];

// Danh sách phẳng (suy từ nhóm) — giữ nguyên cho functionForHref, filter quyền và
// test bijection (rbac.test.ts) không phải đổi.
export const navItems: NavItem[] = navGroups.flatMap((g) => g.items);
