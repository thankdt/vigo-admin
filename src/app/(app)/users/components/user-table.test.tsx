import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { UsersTable } from './user-table';
import { getUsers } from '@/lib/api';

// UsersTable gọi useRouter() để mở hồ sơ khách. Không mock thì render ném
// "invariant expected app router to be mounted" — KHÔNG phải lỗi thiếu mock api.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// Mock phải khai MỌI export mà component import — vitest ném lỗi ngay lúc nạp
// module nếu thiếu, trước cả khi render.
vi.mock('@/lib/api', () => ({
  getUsers: vi.fn(async () => ({ data: [], meta: { total: 0, limit: 20 } })),
  lockUser: vi.fn(),
  unlockUser: vi.fn(),
  deleteAdminUser: vi.fn(),
  restoreUser: vi.fn(),
  adminGetUserReferralStats: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

describe('UsersTable — danh bạ khách (CRM GĐ0)', () => {
  beforeEach(() => vi.clearAllMocks());

  // /users nằm trong nhóm CRM nên mặc định phải là DANH BẠ KHÁCH, không lẫn chủ HTX.
  // `fetchUsers` chỉ gửi `role` khi khác 'ALL', nên mặc định sai là param biến mất hẳn
  // chứ không phải sai giá trị.
  it('lần tải đầu tiên lọc role=USER, không phải tất cả', async () => {
    render(<UsersTable />);
    // Danh sách có debounce 500ms trước khi gọi API — chờ mặc định 1000ms là sát mép
    // trên máy CI chậm, nên nới hẳn ra để không đỏ vì lý do không liên quan.
    await waitFor(() => expect(getUsers).toHaveBeenCalled(), { timeout: 3000 });
    expect(vi.mocked(getUsers).mock.calls[0][0]).toMatchObject({ role: 'USER' });
  });
});
