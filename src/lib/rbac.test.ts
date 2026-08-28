import { describe, it, expect } from 'vitest';
import {
  MENU_FUNCTION_BY_HREF,
  SETTINGS_GROUP_FUNCTIONS,
  functionForHref,
  isMenuVisible,
  isRouteAllowed,
  firstAllowedRoute,
} from './rbac';
import { navGroups, navItems } from './nav-items';
import { CONFIG_GROUPS } from '@/app/(app)/settings/components/system-config-groups';
import type { AdminMe } from './types';

const mkMe = (over: Partial<AdminMe> = {}): AdminMe => ({
  id: 'u', fullName: 'A', phone: '0900', isSuperAdmin: false, functions: [], ...over,
});

// Sync guard for the RBAC catalog. If someone adds a menu item or a config group but
// forgets to declare its function, these hard-coded counts / derived assertions fail
// instead of the permission silently slipping through the gate (spec §2.1).
describe('rbac catalog mirror', () => {
  it('has exactly 36 menu functions (navItems minus /settings)', () => {
    // 2026-08-12: +crm-queue · 2026-08-18: +crm-tickets, +crm-segments, +crm-campaigns,
    // +crm-accounts, +crm-insights · 2026-08-28: +pooling.
    expect(Object.keys(MENU_FUNCTION_BY_HREF).length).toBe(36);
  });

  // Ranh giới riêng tư của màn "Đội tài chuyên nghiệp": ghi chú tuyển team KHÔNG
  // được lộ cho người chỉ có quyền xem danh sách tài xế.
  it('/driver-team là function RIÊNG, không dùng chung với drivers', () => {
    expect(MENU_FUNCTION_BY_HREF['/driver-team']).toBe('driver-team');
    expect(MENU_FUNCTION_BY_HREF['/driver-team']).not.toBe('drivers');
  });

  it('có function drivers KHÔNG mở được /driver-team', () => {
    const opsUser = { isSuperAdmin: false, functions: ['drivers'] } as any;
    expect(isRouteAllowed('/driver-team', opsUser)).toBe(false);
    expect(isMenuVisible('/driver-team', opsUser)).toBe(false);
  });

  it('có function driver-team thì vào được', () => {
    const ceo = { isSuperAdmin: false, functions: ['driver-team'] } as any;
    expect(isRouteAllowed('/driver-team', ceo)).toBe(true);
  });

  /**
   * 2026-08-12: chuyển "Tỉ lệ huỷ tài xế" + "Nghi vấn gian lận" từ nhóm "Vận hành"
   * sang nhóm mới "Xử lý vi phạm". Nhóm menu chỉ là TRÌNH BÀY — quyền vẫn khoá theo
   * href — nhưng đây là loại thay đổi rất dễ vô tình cắt quyền của người đang dùng,
   * nên khoá lại bằng test thay vì tin vào comment.
   */
  describe('đổi nhóm menu KHÔNG được đụng tới quyền', () => {
    const VIOLATION_HREFS = ['/driver-cancel-review', '/leakage-review', '/driver-penalties'];

    it('người đang có quyền soát vẫn thấy đúng mục của họ sau khi đổi nhóm', () => {
      const opsCu = mkMe({ functions: ['driver-cancel-review', 'leakage-review'] });
      expect(isMenuVisible('/driver-cancel-review', opsCu)).toBe(true);
      expect(isMenuVisible('/leakage-review', opsCu)).toBe(true);
      expect(isRouteAllowed('/driver-cancel-review', opsCu)).toBe(true);
      expect(isRouteAllowed('/leakage-review', opsCu)).toBe(true);
    });

    it('quyền phạt vẫn TÁCH RIÊNG — có 2 quyền soát không kéo theo quyền phạt', () => {
      const opsCu = mkMe({ functions: ['driver-cancel-review', 'leakage-review'] });
      expect(isMenuVisible('/driver-penalties', opsCu)).toBe(false);
      expect(isRouteAllowed('/driver-penalties', opsCu)).toBe(false);
    });

    it('3 mục vẫn nằm trong catalog và giữ nguyên function key', () => {
      for (const href of VIOLATION_HREFS) {
        expect(navItems.some((i) => i.href === href)).toBe(true);
        expect(MENU_FUNCTION_BY_HREF[href]).toBe(href.replace(/^\//, ''));
      }
    });

    // Sidebar bỏ nhóm rỗng (`layout.tsx`: filter items.length > 0) — người không có
    // quyền nào trong nhóm mới không được thấy tiêu đề "Xử lý vi phạm" trơ trọi.
    it('người không có quyền nào trong nhóm mới thì nhóm biến mất, không hiện tiêu đề rỗng', () => {
      const khongCoQuyen = mkMe({ functions: ['bookings'] });
      const nhomMoi = navGroups.find((g) => g.label === 'Xử lý vi phạm')!;
      expect(nhomMoi).toBeDefined();
      const visible = nhomMoi.items.filter((i) => isMenuVisible(i.href, khongCoQuyen));
      expect(visible).toHaveLength(0);
    });

    it('nhóm "Xử lý vi phạm" gồm đúng 3 mục đã chốt', () => {
      const nhomMoi = navGroups.find((g) => g.label === 'Xử lý vi phạm')!;
      expect(nhomMoi.items.map((i) => i.href).sort()).toEqual([...VIOLATION_HREFS].sort());
    });
  });

  /**
   * 2026-08-12 (CRM GĐ0): gom /users + /cskh-activity + /acquisition vào nhóm mới
   * "Khách hàng (CRM)". Cùng loại rủi ro với lần tách "Xử lý vi phạm": nhóm chỉ là
   * trình bày, nhưng thứ tự nhóm quyết định TRANG ĐÍCH sau đăng nhập
   * (app/page.tsx -> firstAllowedRoute(navItems)). Khoá lại bằng test.
   */
  describe('nhóm Khách hàng (CRM)', () => {
    // 2026-08-18 (CRM GĐ3): +/crm-tickets sau /users. /crm-queue phải giữ vị trí ĐẦU vì
    // nó là trang đích sau đăng nhập của người chỉ có quyền CSKH.
    const CRM_HREFS = [
      '/crm-queue',
      '/users',
      '/crm-tickets',
      '/crm-segments',
      '/crm-campaigns',
      '/crm-accounts',
      '/crm-insights',
      '/cskh-activity',
      '/acquisition',
    ];

    it('nhóm tồn tại và gồm đúng 9 mục, ĐÚNG THỨ TỰ', () => {
      const crm = navGroups.find((g) => g.label === 'Khách hàng (CRM)');
      expect(crm).toBeDefined();
      expect(crm!.items.map((i) => i.href)).toEqual(CRM_HREFS);
    });

    it('các mục KHÔNG còn nằm ở nhóm cũ (không bị nhân đôi trong menu)', () => {
      for (const href of CRM_HREFS) {
        expect(navItems.filter((i) => i.href === href)).toHaveLength(1);
      }
    });

    it('giữ nguyên function key — không ai bị cắt quyền vì đổi nhóm', () => {
      for (const href of CRM_HREFS) {
        expect(MENU_FUNCTION_BY_HREF[href]).toBe(href.replace(/^\//, ''));
      }
      const cskh = mkMe({ functions: ['cskh-activity'] });
      expect(isMenuVisible('/cskh-activity', cskh)).toBe(true);
      expect(isRouteAllowed('/cskh-activity', cskh)).toBe(true);
    });

    // Cả lý do tồn tại của GĐ1: CSKH tuyến đầu KHÔNG được cấp 'bookings' (đổi trạng
    // thái chuyến, điều tài, tạo chuyến) chỉ để làm được việc gọi khách.
    it('crm-queue là quyền RIÊNG, có bookings không mở được /crm-queue', () => {
      expect(MENU_FUNCTION_BY_HREF['/crm-queue']).toBe('crm-queue');
      const ops = mkMe({ functions: ['bookings'] });
      expect(isMenuVisible('/crm-queue', ops)).toBe(false);
      expect(isRouteAllowed('/crm-queue', ops)).toBe(false);
      const cskh = mkMe({ functions: ['crm-queue'] });
      expect(isRouteAllowed('/crm-queue', cskh)).toBe(true);
      expect(isRouteAllowed('/bookings', cskh)).toBe(false);
    });

    // URL PHẲNG, không lồng /crm/*: isRouteAllowed gate theo SEGMENT CẤP 1 nên
    // /crm/queue + /crm/tickets sẽ gộp chung một function, mất khả năng phân quyền
    // từng mảnh. Khoá lại để sau này không ai "dọn cho đẹp" thành /crm/*.
    it('trang đích của người CHỈ có quyền CSKH là /crm-queue', () => {
      const cskh = mkMe({ functions: ['crm-queue'] });
      expect(firstAllowedRoute(cskh, navItems.map((i) => i.href))).toBe('/crm-queue');
    });

    it('nhóm CRM đứng sau "Xử lý vi phạm" và trước "Người dùng & Đối tác"', () => {
      const labels = navGroups.map((g) => g.label);
      expect(labels.indexOf('Khách hàng (CRM)')).toBe(labels.indexOf('Xử lý vi phạm') + 1);
      expect(labels.indexOf('Khách hàng (CRM)')).toBeLessThan(labels.indexOf('Người dùng & Đối tác'));
    });

    // Ảnh hưởng ĐÃ LƯỜNG của việc đổi nhóm: người có cả users lẫn cskh-activity
    // trước đây tiếp đất ở /cskh-activity (nhóm Vận hành đứng trước), nay là /users.
    // Ghi lại thành test để lần sau ai đổi thứ tự sẽ thấy hệ quả, không phải đoán.
    it('trang đích sau đăng nhập: /users đứng trước /cskh-activity', () => {
      const me = mkMe({ functions: ['users', 'cskh-activity'] });
      expect(firstAllowedRoute(me, navItems.map((i) => i.href))).toBe('/users');
    });

    it('người không có quyền nào trong nhóm thì nhóm biến mất, không hiện tiêu đề rỗng', () => {
      const chiCoBookings = mkMe({ functions: ['bookings'] });
      const crm = navGroups.find((g) => g.label === 'Khách hàng (CRM)')!;
      expect(crm.items.filter((i) => isMenuVisible(i.href, chiCoBookings))).toHaveLength(0);
    });
  });

  it('each menu function key = its href without the leading slash', () => {
    for (const [href, fn] of Object.entries(MENU_FUNCTION_BY_HREF)) {
      expect(fn).toBe(href.replace(/^\//, ''));
    }
  });

  it('/settings and /roles are NOT plain menu functions (gated separately)', () => {
    expect(functionForHref('/settings')).toBeUndefined();
    expect(functionForHref('/roles')).toBeUndefined();
  });

  it('functionForHref returns the mapped key for a known href', () => {
    expect(functionForHref('/finance')).toBe('finance');
  });

  it('SETTINGS_GROUP_FUNCTIONS mirrors CONFIG_GROUPS exactly (one settings.<id> per group)', () => {
    const expected = CONFIG_GROUPS.map((g) => `settings.${g.id}`).sort();
    expect([...SETTINGS_GROUP_FUNCTIONS].sort()).toEqual(expected);
    expect(SETTINGS_GROUP_FUNCTIONS.length).toBe(11); // 2026-07-23: +settings.kol, +settings.agent
  });

  it('every navItems href except /settings is declared in the catalog (no unmapped menu)', () => {
    for (const item of navItems) {
      if (item.href === '/settings') continue;
      expect(functionForHref(item.href), `missing function for ${item.href}`).toBeDefined();
    }
  });
});

describe('isMenuVisible()', () => {
  it('super sees every menu item + /roles', () => {
    const su = mkMe({ isSuperAdmin: true });
    for (const item of navItems) expect(isMenuVisible(item.href, su)).toBe(true);
    expect(isMenuVisible('/roles', su)).toBe(true);
  });

  it('normal admin sees only granted menu items; /roles hidden', () => {
    const me = mkMe({ functions: ['users'] });
    expect(isMenuVisible('/users', me)).toBe(true);
    expect(isMenuVisible('/finance', me)).toBe(false);
    expect(isMenuVisible('/roles', me)).toBe(false);
  });

  it('/settings shows with ANY settings.* function', () => {
    expect(isMenuVisible('/settings', mkMe({ functions: ['settings.pricing'] }))).toBe(true);
    expect(isMenuVisible('/settings', mkMe({ functions: ['users'] }))).toBe(false);
  });

  it('unknown href fails closed (hidden)', () => {
    expect(isMenuVisible('/brand-new-page', mkMe({ isSuperAdmin: false, functions: [] }))).toBe(false);
  });
});

describe('isRouteAllowed()', () => {
  const me = mkMe({ functions: ['users'] });

  it('allows a permitted route and its sub-paths', () => {
    expect(isRouteAllowed('/users', me)).toBe(true);
    expect(isRouteAllowed('/users/123', me)).toBe(true);
  });

  it('blocks a route the user lacks', () => {
    expect(isRouteAllowed('/finance', me)).toBe(false);
  });

  it('always allows /no-access (redirect target, no permission)', () => {
    expect(isRouteAllowed('/no-access', me)).toBe(true);
    expect(isRouteAllowed('/no-access', mkMe({ functions: [] }))).toBe(true);
  });

  it('restricts /roles to super only', () => {
    expect(isRouteAllowed('/roles', me)).toBe(false);
    expect(isRouteAllowed('/roles', mkMe({ isSuperAdmin: true }))).toBe(true);
  });

  it('gates /settings by any-of settings.*', () => {
    expect(isRouteAllowed('/settings', mkMe({ functions: ['settings.app'] }))).toBe(true);
    expect(isRouteAllowed('/settings', me)).toBe(false);
  });

  it('fails CLOSED for a route outside the catalog (e.g. leftover /content)', () => {
    expect(isRouteAllowed('/content', me)).toBe(false);
    expect(isRouteAllowed('/content', mkMe({ isSuperAdmin: true }))).toBe(true); // super bypasses
  });
});

describe('firstAllowedRoute()', () => {
  const hrefs = navItems.map((i) => i.href);

  it('returns the first menu href the user can access (never blindly /dashboard)', () => {
    const me = mkMe({ functions: ['finance'] });
    expect(firstAllowedRoute(me, hrefs)).toBe('/finance');
  });

  it('returns /no-access when the user has no permitted menu', () => {
    expect(firstAllowedRoute(mkMe({ functions: [] }), hrefs)).toBe('/no-access');
  });

  it('super lands on the first menu item', () => {
    expect(firstAllowedRoute(mkMe({ isSuperAdmin: true }), hrefs)).toBe('/dashboard');
  });
});
