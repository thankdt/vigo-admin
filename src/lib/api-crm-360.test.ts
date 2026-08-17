import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  addCrmCustomerNote,
  addCrmCustomerTag,
  getCrmCustomerNotes,
  getCrmCustomerSource,
  getCrmCustomerTags,
  getCrmCustomerTimeline,
  getCrmTagCatalog,
  logCrmProfileView,
  removeCrmCustomerNote,
  removeCrmCustomerTag,
  revealCrmCustomerPhone,
} from './api';

/**
 * Khoá HỢP ĐỒNG QUERY STRING + method/path của khối CRM 360.
 *
 * Loại lỗi cần chặn: gõ sai tên khoá `cursor` thì backend BỎ QUA nó, mỗi lần bấm
 * "Xem thêm" lại trả về trang đầu và danh sách nhân đôi dần — mà `tsc` lẫn `vitest`
 * đều xanh. Không ai nhìn ra bằng mắt.
 */

function lastUrl(): string {
  const call = vi.mocked(global.fetch).mock.calls.at(-1);
  return String(call?.[0]);
}

function lastInit(): RequestInit | undefined {
  const call = vi.mocked(global.fetch).mock.calls.at(-1);
  return call?.[1] as RequestInit | undefined;
}

function q(name: string): string | null {
  return new URL(lastUrl(), 'https://x').searchParams.get(name);
}

const USER = 'u-1';

beforeEach(() => {
  localStorage.setItem('access_token', 'tok');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ data: [], meta: {} }), { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('timeline — phân trang bằng cursor', () => {
  it('trang đầu KHÔNG gửi cursor', async () => {
    await getCrmCustomerTimeline(USER);
    expect(q('cursor')).toBeNull();
  });

  /**
   * Cursor phải đi NGUYÊN VĂN chuỗi backend trả. Backend dùng base64url và tự whitelist
   * lại khi giải mã, nên mọi phép "làm sạch" ở FE đều biến thành 400.
   */
  it('trang sau gửi cursor NGUYÊN VĂN', async () => {
    const c = 'MjAyNi0wOC0xNFQwMjowMDowMC4wMDAwMDBafENBTEx8YS0x';
    await getCrmCustomerTimeline(USER, { cursor: c });
    expect(q('cursor')).toBe(c);
  });

  it('days/limit/sources đi đúng tên khoá', async () => {
    await getCrmCustomerTimeline(USER, { days: 30, limit: 10, sources: 'NOTE,NOTIFICATION' });
    expect(q('days')).toBe('30');
    expect(q('limit')).toBe('10');
    expect(q('sources')).toBe('NOTE,NOTIFICATION');
  });

  // Không truyền thì KHÔNG gửi khoá rỗng — backend tự áp mặc định (90 ngày / 30 dòng),
  // gửi chuỗi rỗng sẽ làm nó rơi vào nhánh parse khác.
  it('tham số vắng mặt thì không gửi khoá rỗng', async () => {
    await getCrmCustomerTimeline(USER);
    expect(q('days')).toBeNull();
    expect(q('limit')).toBeNull();
    expect(q('sources')).toBeNull();
  });

  it('gọi đúng path timeline của ĐÚNG khách', async () => {
    await getCrmCustomerTimeline(USER);
    expect(lastUrl()).toContain('/admin/crm/customers/u-1/timeline');
  });
});

describe('tag & ghi chú — method và path', () => {
  it('lấy danh mục nhãn qua endpoint riêng, KHÔNG qua system-config', async () => {
    await getCrmTagCatalog();
    expect(lastUrl()).toContain('/admin/crm/tag-catalog');
    // Key CRM_CUSTOMER_TAGS thuộc nhóm settings.misc mà không starter role nào có →
    // đi đường system-config là 403 trắng khối tag cho người chỉ có function `users`.
    expect(lastUrl()).not.toContain('system-config');
  });

  it('gắn nhãn = POST đúng path', async () => {
    await addCrmCustomerTag(USER, 'Khách VIP');
    expect(lastUrl()).toContain('/admin/crm/customers/u-1/tags');
    expect(lastInit()!.method).toBe('POST');
    expect(JSON.parse(String(lastInit()!.body))).toEqual({ tag: 'Khách VIP' });
  });

  it('gỡ nhãn = DELETE kèm tagId', async () => {
    await removeCrmCustomerTag(USER, 't-9');
    expect(lastUrl()).toContain('/admin/crm/customers/u-1/tags/t-9');
    expect(lastInit()!.method).toBe('DELETE');
  });

  it('đọc nhãn = GET', async () => {
    await getCrmCustomerTags(USER);
    expect(lastUrl()).toContain('/admin/crm/customers/u-1/tags');
    expect(lastInit()?.method ?? 'GET').toBe('GET');
  });

  it('ghi chú: POST body { note }', async () => {
    await addCrmCustomerNote(USER, 'khách khó tính');
    expect(lastUrl()).toContain('/admin/crm/customers/u-1/notes');
    expect(lastInit()!.method).toBe('POST');
    expect(JSON.parse(String(lastInit()!.body))).toEqual({ note: 'khách khó tính' });
  });

  it('danh sách ghi chú gửi page/limit', async () => {
    await getCrmCustomerNotes(USER, 2);
    expect(q('page')).toBe('2');
  });

  it('xoá ghi chú = DELETE kèm noteId', async () => {
    await removeCrmCustomerNote(USER, 'n-3');
    expect(lastUrl()).toContain('/admin/crm/customers/u-1/notes/n-3');
    expect(lastInit()!.method).toBe('DELETE');
  });
});

describe('Nguồn khách', () => {
  it('gọi endpoint RIÊNG, không phải /referrals/.../stats (chiều ngược)', async () => {
    await getCrmCustomerSource(USER);
    expect(lastUrl()).toContain('/admin/crm/customers/u-1/source');
    expect(lastUrl()).not.toContain('/referrals/');
  });
});

describe('vết đọc hồ sơ + mở SĐT', () => {
  /**
   * POST chứ KHÔNG GET cho cả hai: chúng có tác dụng phụ (ghi bảng audit). GET dễ bị
   * prefetch/retry của trình duyệt làm nhiễu log — mà log nhiễu thì mất giá trị truy vết.
   */
  it('ghi vết xem hồ sơ = POST kèm surface', async () => {
    await logCrmProfileView(USER, 'users-detail');
    expect(lastUrl()).toContain('/admin/crm/customers/u-1/view');
    expect(lastInit()!.method).toBe('POST');
    expect(JSON.parse(String(lastInit()!.body))).toEqual({ surface: 'users-detail' });
  });

  it('mở SĐT = POST kèm surface', async () => {
    await revealCrmCustomerPhone(USER, 'users-list');
    expect(lastUrl()).toContain('/admin/crm/customers/u-1/reveal-phone');
    expect(lastInit()!.method).toBe('POST');
    expect(JSON.parse(String(lastInit()!.body))).toEqual({ surface: 'users-list' });
  });
});
