import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { KmTablesResponse } from '@/lib/km-tables';

const getKmTables = vi.fn();
const saveKmTables = vi.fn();
vi.mock('@/lib/api', () => ({
  getKmTables: (...a: unknown[]) => getKmTables(...a),
  saveKmTables: (...a: unknown[]) => saveKmTables(...a),
}));
const toast = vi.fn(); // ổn định giữa các lần render như bản thật (hàm cấp module)
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

import { KmTablesManager } from './km-tables-manager';

const RESP: KmTablesResponse = {
  version: 2,
  source: 'db',
  tables: {
    GHEP: { points: [{ km: 50, price: 200_000 }, { km: 100, price: 300_000 }], tailPerKm: 1_400 },
    CAR_4: { points: [{ km: 10, price: 150_000 }, { km: 50, price: 500_000 }], tailPerKm: 5_500 },
    CAR_7: { points: [{ km: 10, price: 180_000 }, { km: 50, price: 650_000 }], tailPerKm: 5_500 },
  },
};

beforeEach(() => {
  getKmTables.mockReset().mockResolvedValue(structuredClone(RESP));
  saveKmTables.mockReset().mockResolvedValue(undefined);
});

describe('KmTablesManager', () => {
  it('hiện 3 bảng; nút Lưu tắt khi chưa sửa', async () => {
    render(<KmTablesManager />);
    expect(await screen.findByText(/Ghép \(giá một ghế\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lưu bảng giá/ })).toBeDisabled();
  });

  it('sửa giá một mốc hợp lệ ⇒ xác nhận ⇒ gửi đúng version đã tải', async () => {
    const user = userEvent.setup();
    render(<KmTablesManager />);
    const price = await screen.findByLabelText('CAR_4 mốc 2 giá');
    await user.clear(price);
    await user.type(price, '520000');
    await user.click(screen.getByRole('button', { name: /Lưu bảng giá/ }));
    await user.click(await screen.findByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(saveKmTables).toHaveBeenCalledTimes(1));
    const [version, tables] = saveKmTables.mock.calls[0];
    expect(version).toBe(2);
    expect(tables.CAR_4.points[1].price).toBe(520_000);
  });

  it('giá giảm khi km tăng ⇒ báo lỗi và không cho lưu', async () => {
    const user = userEvent.setup();
    render(<KmTablesManager />);
    const price = await screen.findByLabelText('CAR_4 mốc 2 giá');
    await user.clear(price);
    await user.type(price, '1000');
    expect(await screen.findByText(/giá không được thấp hơn mốc 1/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lưu bảng giá/ })).toBeDisabled();
  });
});
