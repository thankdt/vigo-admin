import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { DriverReputation } from '@/lib/types';

/**
 * Test ĐỐI KHÁNG ở tầng RENDER — hàm format đúng vẫn có thể bị nơi gọi làm hỏng.
 *
 * Cụ thể: `DriverReputationSection` tự quyết định "có sao hay không" bằng
 * `stars !== null && stars !== undefined`, trong khi `formatDisplayStars` lại
 * coi `<= 0` và số vô nghĩa là CHƯA CÓ. Hai định nghĩa lệch nhau ⇒ có input rơi
 * vào nhánh "vẽ sao" nhưng chữ lại là "Chưa có đánh giá", tức là admin nhìn thấy
 * một hàng 5 sao RỖNG — đúng nghĩa "0 sao" mà luật cấm.
 */

vi.mock('@/lib/api', () => ({
  getDriverReputation: vi.fn(),
  getDriverRatings: vi.fn(),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ can: () => true, me: null, loading: false, refresh: vi.fn() }),
}));

// Chỉ cần đúng một hàm format thời gian; tránh kéo cả dialog nặng vào test.
vi.mock('./driver-detail-dialog', () => ({
  formatVnDateTime: (s: string | null) => s ?? '',
}));

import { getDriverReputation, getDriverRatings } from '@/lib/api';
import { DriverReputationSection } from './driver-reputation-section';

const baseRep: DriverReputation = {
  driverId: 'd1',
  score: 82.4,
  bayesStars: 4.4,
  displayStars: null,
  ratingCount: 0,
  hasEnoughRatings: false,
  distribution: {},
  ops: { acceptRate: null, onTimeRate: null, completionRate: null },
  collecting: ['accept', 'onTime', 'completion'],
  usedComponents: ['star'],
  lastRatingAt: null,
};

/** Icon sao lucide thực sự được vẽ trên màn (khối điểm; danh sách đánh giá rỗng). */
function starIcons(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('svg.lucide-star'));
}

async function renderWith(rep: Partial<DriverReputation>) {
  vi.mocked(getDriverReputation).mockResolvedValue({ ...baseRep, ...rep });
  vi.mocked(getDriverRatings).mockResolvedValue({ items: [], total: 0 } as never);
  const view = render(<DriverReputationSection driverId="d1" />);
  await waitFor(() =>
    expect(screen.queryByText('Đang tải điểm đánh giá…')).not.toBeInTheDocument(),
  );
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LUẬT 1 — chỉ số chưa có dữ liệu không bao giờ ra 0%', () => {
  it('3 chỉ số null → "Đang thu thập" x3, không ô nào hiện "0%"', async () => {
    const { container } = await renderWith({});
    expect(screen.getAllByText('Đang thu thập')).toHaveLength(3);
    expect(container.textContent).not.toContain('0%');
  });

  it('0 THẬT vẫn ra "0%" (0 khác null)', async () => {
    await renderWith({
      ops: { acceptRate: 0, onTimeRate: 0.9, completionRate: null },
      collecting: ['completion'],
    });
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
    expect(screen.getAllByText('Đang thu thập')).toHaveLength(1);
  });
});

describe('LUẬT 2 — chưa đủ đánh giá thì KHÔNG được vẽ hàng sao', () => {
  it('displayStars null → "Chưa có đánh giá" và KHÔNG có icon sao nào', async () => {
    const { container } = await renderWith({ displayStars: null });
    expect(screen.getByText('Chưa có đánh giá')).toBeInTheDocument();
    expect(starIcons(container)).toHaveLength(0);
  });

  it('displayStars = 0 (placeholder lỗi) → KHÔNG được vẽ 5 sao rỗng', async () => {
    // `formatDisplayStars(0)` đã trả "Chưa có đánh giá", nhưng cổng `hasStars`
    // chỉ kiểm null ⇒ vẫn rơi vào nhánh vẽ sao: chữ "Chưa có đánh giá" nằm cạnh
    // 5 ngôi sao rỗng, in đậm cỡ 2xl như một GIÁ TRỊ. Nhìn ra đúng "0 sao".
    const { container } = await renderWith({ displayStars: 0 });
    expect(starIcons(container)).toHaveLength(0);
  });

  it('displayStars = NaN → không vẽ sao, không hiện "NaN"', async () => {
    const { container } = await renderWith({ displayStars: Number.NaN });
    expect(container.textContent).not.toContain('NaN');
    expect(starIcons(container)).toHaveLength(0);
  });

  it('displayStars hợp lệ → vẽ đúng 5 icon sao và số "4.5"', async () => {
    const { container } = await renderWith({
      displayStars: 4.53,
      ratingCount: 12,
      hasEnoughRatings: true,
    });
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(starIcons(container)).toHaveLength(5);
    expect(container.querySelectorAll('svg.fill-amber-400')).toHaveLength(4);
  });
});

describe('LUẬT 4 — backend cũ thiếu field xử lý như null', () => {
  it('thiếu ops và collecting → 3 chỉ số "Đang thu thập", không sập', async () => {
    await renderWith({
      ops: undefined as never,
      collecting: undefined as never,
    });
    expect(screen.getAllByText('Đang thu thập')).toHaveLength(3);
  });

  it('thiếu score → "—", KHÔNG hiện "0"', async () => {
    const { container } = await renderWith({ score: undefined as never });
    expect(container.textContent).toContain('—/100');
  });
});
