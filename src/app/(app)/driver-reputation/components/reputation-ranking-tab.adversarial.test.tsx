import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DriverReputationRankRow } from '@/lib/types';

/**
 * Test ĐỐI KHÁNG ở tầng RENDER cho BẢNG XẾP HẠNG — song song với
 * `drivers/components/driver-reputation-section.adversarial.test.tsx`.
 *
 * Vì sao cần dù `reputation-labels.test.ts` đã xanh: hàm format đúng vẫn có thể
 * bị NƠI GỌI làm hỏng. Luật "null ≠ 0 sao" ở trang này nằm trong JSX
 * (`StarsCell`), không nằm trong hàm format — đúng chỗ đã từng đẻ ra lỗi "chữ
 * 'Chưa có đánh giá' nằm cạnh 5 ngôi sao rỗng" ở khối chi tiết tài xế.
 *
 * Và bảng này là nơi thiệt hại lớn nhất: gần như TOÀN BỘ đội tài có
 * `displayStars = null`, nên sai ở đây là dán nhãn "0 sao" lên cả đội.
 *
 * Ngoài ra khoá luôn hai tham số truy vấn mà chỉ component mới quyết được:
 *  - mặc định `minRatings=1` (không thì admin nhận 11.7k dòng rỗng),
 *  - tick "hiện cả tài chưa có đánh giá" phải gửi số 0 THẬT (bẫy `0 || 1`).
 * `driver-reputation-query.test.ts` chỉ chứng minh hàm dựng URL xử lý đúng số 0
 * — KHÔNG chứng minh component chịu truyền số 0 xuống.
 */

vi.mock('@/lib/api', () => ({
  getDriverReputationRanking: vi.fn(),
  parseApiError: (msg: string) => msg,
}));

import { getDriverReputationRanking } from '@/lib/api';
import { ReputationRankingTab } from './reputation-ranking-tab';

const mkRow = (over: Partial<DriverReputationRankRow> = {}): DriverReputationRankRow => ({
  driverId: 'd1',
  fullName: 'Nguyễn Văn A',
  phone: '0900000001',
  ratingCount: 0,
  displayStars: null,
  bayesStars: 4.6,
  lastRatingAt: null,
  ...over,
});

/** Icon sao lucide thực sự được vẽ ra (dùng chung selector với test khối chi tiết). */
const starIcons = (el: HTMLElement | Element): Element[] =>
  Array.from(el.querySelectorAll('svg.lucide-star'));

/** Riêng các sao ĐẶC (đã tô) — phần người dùng đọc ra thành "mấy sao". */
const filledStars = (el: HTMLElement | Element): Element[] =>
  Array.from(el.querySelectorAll('svg.lucide-star.fill-amber-400'));

/** Dòng dữ liệu của tài xế `name` (bỏ qua hàng tiêu đề / hàng trạng thái). */
const rowOf = (name: string): HTMLElement => screen.getByText(name).closest('tr') as HTMLElement;

/**
 * Ô "Sao" của một dòng (cột thứ 3).
 *
 * Phải soi ĐÚNG ô này chứ không `within(row).getByText(...)`: nhãn "Chưa có
 * đánh giá" CỐ Ý xuất hiện hai lần trên cùng một dòng — cột "Sao" và cột "Đánh
 * giá gần nhất" (`lastRatingText(null)`). Tìm theo chữ trên cả dòng sẽ dính cả
 * hai và không phân biệt được ô nào đang nói gì.
 */
/**
 * Tra ô theo TIÊU ĐỀ CỘT chứ không theo chỉ số cứng.
 *
 * Bản đầu dùng `getAllByRole('cell')[2]` và gãy ngay khi thêm cột "#" vào đầu
 * bảng — 5 test đỏ cùng lúc trong khi hành vi chẳng sai gì. Tra theo tiêu đề
 * thì thêm/đổi thứ tự cột bao nhiêu lần cũng không ảnh hưởng.
 */
const colIndex = (header: string): number => {
  const heads = within(screen.getByRole('table')).getAllByRole('columnheader');
  const i = heads.findIndex((h) => (h.textContent ?? '').trim().startsWith(header));
  if (i < 0) throw new Error(`Không tìm thấy cột "${header}"`);
  return i;
};

const cellOf = (name: string, header: string): HTMLElement =>
  within(rowOf(name)).getAllByRole('cell')[colIndex(header)] as HTMLElement;

const starsCellOf = (name: string): HTMLElement => cellOf(name, 'Sao');

async function renderWith(rows: DriverReputationRankRow[], total = rows.length) {
  vi.mocked(getDriverReputationRanking).mockResolvedValue({
    items: rows,
    total,
    minRatingsToShow: 5,
  });
  const view = render(<ReputationRankingTab onSelectDriver={vi.fn()} />);
  // Debounce 300ms rồi mới bắn request — chờ tới khi bảng có dữ liệu thật.
  await waitFor(() => expect(getDriverReputationRanking).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByText(rows[0].fullName as string)).toBeInTheDocument());
  return view;
}

/** Tham số của lần gọi API gần nhất. */
const lastCallArgs = () => {
  const calls = vi.mocked(getDriverReputationRanking).mock.calls;
  return calls[calls.length - 1][0] as { minRatings?: number; offset?: number };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LUẬT 2 ở bảng xếp hạng — null KHÔNG PHẢI 0 sao', () => {
  it('displayStars = null → "Chưa có đánh giá" và KHÔNG icon sao nào trong dòng', async () => {
    await renderWith([mkRow({ displayStars: null })]);
    const cell = starsCellOf('Nguyễn Văn A');
    expect(cell.textContent).toBe('Chưa có đánh giá');
    // 5 ngôi sao rỗng cạnh chữ "Chưa có đánh giá" nhìn ra đúng "0 sao".
    expect(starIcons(cell)).toHaveLength(0);
    expect(cell.textContent).not.toContain('0.0');
  });

  it('displayStars = 0 (placeholder backend) → vẫn KHÔNG vẽ sao, không hiện "0.0"', async () => {
    await renderWith([mkRow({ displayStars: 0, ratingCount: 3 })]);
    const cell = starsCellOf('Nguyễn Văn A');
    expect(cell.textContent).toBe('Chưa có đánh giá');
    expect(starIcons(cell)).toHaveLength(0);
    expect(cell.textContent).not.toContain('0.0');
  });

  it('displayStars = NaN → không vẽ sao, không in "NaN"', async () => {
    await renderWith([mkRow({ displayStars: Number.NaN })]);
    const row = rowOf('Nguyễn Văn A');
    expect(starIcons(row)).toHaveLength(0);
    expect(row.textContent).not.toContain('NaN');
  });

  it('có sao thật → số hiển thị và hàng sao KHỚP nhau (4.53 → "4.5" + 4 sao đặc)', async () => {
    await renderWith([mkRow({ displayStars: 4.53, ratingCount: 12 })]);
    const cell = starsCellOf('Nguyễn Văn A');
    expect(within(cell).getByText('4.5')).toBeInTheDocument();
    expect(starIcons(cell)).toHaveLength(5);
    // Làm tròn XUỐNG — không "tặng" sao thứ 5 cho tài 4.5.
    expect(filledStars(cell)).toHaveLength(4);
  });

  it('hai dòng cạnh nhau: dòng chưa có sao không lây hàng sao của dòng có sao', async () => {
    await renderWith([
      mkRow({ driverId: 'd1', fullName: 'Có sao', displayStars: 4.9, ratingCount: 30 }),
      mkRow({ driverId: 'd2', fullName: 'Chưa có', displayStars: null, ratingCount: 0 }),
    ]);
    expect(starIcons(starsCellOf('Có sao'))).toHaveLength(5);
    expect(starIcons(starsCellOf('Chưa có'))).toHaveLength(0);
    expect(starsCellOf('Chưa có').textContent).toBe('Chưa có đánh giá');
  });
});

describe('ratingCount = 0 vẫn là số THẬT (khác displayStars)', () => {
  it('hiện "0" ở cột số lượt, trong khi cột sao là "Chưa có đánh giá"', async () => {
    await renderWith([mkRow({ ratingCount: 0, displayStars: null })]);
    const cells = within(rowOf('Nguyễn Văn A')).getAllByRole('cell');
    expect(cells[colIndex('Số lượt đánh giá')].textContent).toBe('0');
    expect(cells[colIndex('Sao')].textContent).toContain('Chưa có đánh giá');
  });
});

describe('minRatings — bộ lọc chống 11.7k dòng rỗng, quyết ở COMPONENT', () => {
  it('mặc định gửi minRatings = 1', async () => {
    await renderWith([mkRow()]);
    expect(lastCallArgs().minRatings).toBe(1);
  });

  it('tick "Hiện cả tài chưa có đánh giá" → gửi số 0 THẬT (bẫy 0 || 1)', async () => {
    const user = userEvent.setup();
    await renderWith([mkRow()]);
    expect(lastCallArgs().minRatings).toBe(1);

    await user.click(screen.getByRole('checkbox', { name: /Hiện cả tài chưa có đánh giá/i }));

    // Nếu component viết `includeUnrated ? 0 : 1` rồi để `x || 1` nuốt mất số 0,
    // request thứ hai vẫn mang minRatings=1 và checkbox thành nút chết.
    await waitFor(() => expect(lastCallArgs().minRatings).toBe(0));
  });

  it('đổi bộ lọc → quay về trang đầu (offset 0), không giữ offset trang cũ', async () => {
    const user = userEvent.setup();
    // 100 dòng ⇒ có nhiều trang để bấm "Sau".
    await renderWith([mkRow()], 100);

    await user.click(screen.getByRole('button', { name: 'Sau' }));
    await waitFor(() => expect(lastCallArgs().offset).toBe(20));

    await user.click(screen.getByRole('checkbox', { name: /Hiện cả tài chưa có đánh giá/i }));
    await waitFor(() => {
      const args = lastCallArgs();
      expect(args.minRatings).toBe(0);
      expect(args.offset).toBe(0);
    });
  });
});
