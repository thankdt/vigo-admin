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
  Headset,
  LifeBuoy,
  Layers,
  Send,
  Briefcase,
  LineChart,
  PhoneCall,
  Star,
  Handshake,
  type LucideIcon,
  Gavel,
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
    ],
  },
  {
    label: 'Vận hành',
    items: [
      { href: '/bookings', label: 'Chuyến đi', icon: Book },
      { href: '/agent-orders', label: 'Đơn đặt hộ', icon: PackageOpen },
      { href: '/drivers', label: 'Tài xế', icon: Car },
      // Cạnh mục tài xế, cùng cụm "chất lượng tài xế" với Tỉ lệ huỷ / Góp ý.
      { href: '/driver-reputation', label: 'Điểm & đánh giá tài xế', icon: Star },
      // Cùng cụm "chất lượng tài xế". Quyền RIÊNG driver-team — ops/CSKH không thấy.
      { href: '/driver-team', label: 'Đội tài chuyên nghiệp', icon: Handshake },
      { href: '/master-data', label: 'Tuyến đường & Vùng', icon: Map },
      { href: '/feedback', label: 'Góp ý tài xế', icon: MessageSquare },
    ],
  },
  {
    // Cụm RIÊNG để phân quyền: người xử lý vi phạm được cấp đúng 3 quyền này
    // (driver-cancel-review + leakage-review + driver-penalties), tách hẳn khỏi team
    // vận hành. Gom vào một nhóm để lúc gán quyền không phải mò trong danh sách dài,
    // và để người được cấp thấy đúng một cụm việc của mình.
    label: 'Xử lý vi phạm',
    items: [
      { href: '/driver-cancel-review', label: 'Tỉ lệ huỷ tài xế', icon: TrendingDown },
      { href: '/leakage-review', label: 'Nghi vấn gian lận', icon: ShieldAlert },
      { href: '/driver-penalties', label: 'Phạt vi phạm', icon: Gavel },
    ],
  },
  {
    // 2026-08-12 (CRM GĐ0): gom các màn XOAY QUANH KHÁCH về một chỗ. Trước đây
    // /acquisition ở "Tổng quan", /cskh-activity ở "Vận hành", /users ở "Người dùng
    // & Đối tác" — CSKH phải nhảy 3 nhóm để làm một việc. Nhóm chỉ là TRÌNH BÀY,
    // href và function giữ nguyên nên KHÔNG ai bị cắt quyền.
    // Affiliate/KOL CỐ Ý không nằm ở đây: đối tượng của chúng là NGƯỜI GIỚI THIỆU
    // (ví, hoa hồng, công nợ), không phải khách đi xe — xem spec §3.4.
    label: 'Khách hàng (CRM)',
    items: [
      // Đầu nhóm là CỐ Ý: màn CSKH mở nhiều nhất trong ngày, và nó thành trang đích
      // sau đăng nhập cho người chỉ có quyền CSKH.
      { href: '/crm-queue', label: 'Hàng đợi CSKH', icon: PhoneCall },
      { href: '/users', label: 'Khách hàng', icon: Users },
      // 2026-08-18 (CRM GĐ3): khiếu nại của khách, nhập tay từ nhóm Zalo.
      { href: '/crm-tickets', label: 'Ticket khách hàng', icon: LifeBuoy },
      // 2026-08-18 (CRM GĐ4): dựng tệp khách từ chỉ số tính sẵn.
      { href: '/crm-segments', label: 'Phân khúc', icon: Layers },
      // 2026-08-18 (CRM GĐ5): gửi ZNS/push cho một phân khúc — ra ngoài, khách thật.
      { href: '/crm-campaigns', label: 'Chiến dịch chăm sóc', icon: Send },
      // 2026-08-18 (CRM GĐ6): hồ sơ công ty + pipeline B2B.
      { href: '/crm-accounts', label: 'Khách doanh nghiệp', icon: Briefcase },
      // 2026-08-18 (CRM GĐ7): cohort giữ chân — đo bài toán số 1 (§14.4).
      { href: '/crm-insights', label: 'Insights khách hàng', icon: LineChart },
      { href: '/cskh-activity', label: 'Hoạt động CSKH', icon: Headset },
      { href: '/acquisition', label: 'Nguồn khách', icon: PieChart },
    ],
  },
  {
    label: 'Người dùng & Đối tác',
    items: [
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
      { href: '/settings', label: 'Cài đặt', icon: Settings },
    ],
  },
];

// Danh sách phẳng (suy từ nhóm) — giữ nguyên cho functionForHref, filter quyền và
// test bijection (rbac.test.ts) không phải đổi.
export const navItems: NavItem[] = navGroups.flatMap((g) => g.items);
