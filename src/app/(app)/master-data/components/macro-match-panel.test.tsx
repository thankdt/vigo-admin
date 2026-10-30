import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MacroMatchCombo, MacroMatchRankingRow, MacroMatchResponse } from '@/lib/api';
import type { ProvinceOption, PricingMacroRule } from '@/lib/types';
import { MacroMatchPanel } from './macro-match-panel';

const PROVINCES: ProvinceOption[] = [
  { code: '01', name: 'Hà Nội' },
  { code: '19', name: 'Thái Nguyên' },
];

const rule = (patch: Partial<PricingMacroRule> & { id: number }): PricingMacroRule => ({
  name: `R${patch.id}`,
  isActive: true,
  priority: 0,
  serviceType: 'ALL',
  vehicleType: 'ALL',
  originProvinceCode: null,
  originWardCode: null,
  destProvinceCode: null,
  destWardCode: null,
  adjustmentType: 'DELTA_AMOUNT',
  adjustmentValue: 10000,
  applyPerSeat: true,
  isBidirectional: false,
  ...patch,
});

const RULES: PricingMacroRule[] = [
  rule({ id: 13, priority: 1, originProvinceCode: '19', originWardCode: '19001', originWardName: 'Đại Từ', destProvinceCode: '01', destWardCode: '01002', destWardName: 'Cầu Giấy', adjustmentValue: 20000 }),
  rule({ id: 12, priority: 1, originProvinceCode: '19', originWardCode: '19001', originWardName: 'Đại Từ', destProvinceCode: '01', destWardCode: '01002', destWardName: 'Cầu Giấy', adjustmentValue: 15000 }),
  rule({ id: 14, priority: 0, originProvinceCode: '19', originWardCode: '19001', originWardName: 'Đại Từ', destProvinceCode: '01', destWardCode: '01002', destWardName: 'Cầu Giấy' }),
  rule({ id: 5, priority: 9, originProvinceCode: '19', destProvinceCode: '01', adjustmentType: 'PERCENTAGE', adjustmentValue: 5 }),
  rule({ id: 7, adjustmentType: 'MIN_FLOOR', adjustmentValue: 50000 }),
  rule({ id: 3, priority: 2, serviceType: 'RIDE', originProvinceCode: '01', originWardCode: '01002', originWardName: 'Cầu Giấy', destProvinceCode: '19', destWardCode: '19001', destWardName: 'Đại Từ', adjustmentType: 'FIXED_PRICE', adjustmentValue: 400000, isBidirectional: true }),
];

const row = (ruleId: number, verdict: MacroMatchRankingRow['verdict'], orientation: 'FORWARD' | 'REVERSE' = 'FORWARD'): MacroMatchRankingRow => ({
  ruleId,
  verdict,
  orientation,
  specificity: { wardEnds: 2, provinceEnds: 0, serviceExact: 0, vehicleExact: 0 },
  score: 100,
});

const COMBOS: MacroMatchCombo[] = [
  {
    serviceType: 'CARPOOL',
    vehicleType: 'CAR_4',
    winnerRuleId: 13,
    orientation: 'FORWARD',
    score: 200,
    ranking: [row(13, 'WINNER'), row(12, 'LOSES_ID'), row(14, 'LOSES_PRIORITY'), row(5, 'LOSES_SPECIFICITY'), row(7, 'IGNORED_TYPE')],
    truncated: false,
  },
  { serviceType: 'CARPOOL', vehicleType: 'CAR_7', winnerRuleId: null, orientation: null, score: null, ranking: [], truncated: false },
  {
    serviceType: 'RIDE',
    vehicleType: 'CAR_4',
    winnerRuleId: 3,
    orientation: 'REVERSE',
    score: 300,
    ranking: [row(3, 'WINNER', 'REVERSE'), ...Array.from({ length: 49 }, () => row(13, 'LOSES_SPECIFICITY'))],
    truncated: true,
  },
  { serviceType: 'RIDE', vehicleType: 'CAR_7', winnerRuleId: 99, orientation: 'FORWARD', score: 1, ranking: [row(99, 'WINNER')], truncated: false },
];

const MATCH: MacroMatchResponse = {
  origin: { provinceCode: '19', wardCode: '19001', zoneCode: null },
  dest: { provinceCode: '01', wardCode: '01002', zoneCode: null },
  combos: COMBOS,
  rules: RULES,
  warnings: [],
};

type Props = React.ComponentProps<typeof MacroMatchPanel>;
const base: Props = {
  availability: 'READY',
  originLabel: 'Đại Từ (Thái Nguyên)',
  destLabel: 'Cầu Giấy (Hà Nội)',
  loading: false,
  error: null,
  match: MATCH,
  selectedCombo: 0,
  onSelectCombo: () => {},
  provinces: PROVINCES,
};
const renderPanel = (patch: Partial<Props> = {}) => render(<MacroMatchPanel {...base} {...patch} />);
const comboButtons = () => screen.queryAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'));
const ranking = () => screen.getByRole('list', { name: /^Thứ tự xét quy tắc/ });
const rankingRows = () => within(ranking()).getAllByRole('listitem');

describe('MacroMatchPanel — chưa đủ điều kiện tra', () => {
  it('NEED_BOTH: chỉ một câu nhắc chọn đủ hai đầu, không tiêu đề chuyến, không bảng', () => {
    renderPanel({ availability: 'NEED_BOTH', destLabel: '', match: null });
    expect(screen.getByTestId('macro-match-panel')).toHaveTextContent('Chọn cả điểm đón và điểm đến để xem quy tắc đang áp dụng.');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(comboButtons()).toHaveLength(0);
  });

  it('TEXT_SIDE: tiêu đề + câu giải thích vì sao chưa có câu trả lời chính xác; KHÔNG hiện kết quả cũ', () => {
    renderPanel({ availability: 'TEXT_SIDE', originLabel: 'Chữ: Đông Anh (gồm tên cũ)' });
    expect(screen.getByRole('heading')).toHaveTextContent('Quy tắc đang áp dụng cho chuyến Chữ: Đông Anh (gồm tên cũ) → Cầu Giấy (Hà Nội)');
    expect(screen.getByTestId('macro-match-panel')).toHaveTextContent(
      'Đã chọn theo chữ nên chưa biết chính xác xã nào — chọn một xã/phường cụ thể ở gợi ý để xem quy tắc đang áp dụng.',
    );
    expect(comboButtons()).toHaveLength(0);
  });
});

describe('MacroMatchPanel — 4 tổ hợp và quy tắc thắng', () => {
  it('READY: tiêu đề chuyến (đón → đến), đúng 4 dòng theo thứ tự máy chủ, mỗi dòng nhãn dịch vụ · xe', () => {
    renderPanel();
    expect(screen.getByRole('heading')).toHaveTextContent('Quy tắc đang áp dụng cho chuyến Đại Từ (Thái Nguyên) → Cầu Giấy (Hà Nội)');
    const buttons = comboButtons();
    expect(buttons).toHaveLength(4);
    expect(buttons[0]).toHaveTextContent('Ghép xe · Xe 4 chỗ');
    expect(buttons[1]).toHaveTextContent('Ghép xe · Xe 7 chỗ');
    expect(buttons[2]).toHaveTextContent('Bao xe · Xe 4 chỗ');
    expect(buttons[3]).toHaveTextContent('Bao xe · Xe 7 chỗ');
  });

  it('quy tắc thắng: #mã + mức điều chỉnh + đường đi + ưu tiên; không có thì «giữ giá gốc»; chiều ngược ghi rõ', () => {
    renderPanel();
    const [b0, b1, b2, b3] = comboButtons();
    expect(b0).toHaveTextContent('#13');
    expect(b0).toHaveTextContent('+20.000 đ/ghế');
    expect(b0).toHaveTextContent('Đại Từ (Thái Nguyên) → Cầu Giấy (Hà Nội)');
    expect(b0).toHaveTextContent('ưu tiên 1');
    expect(b1).toHaveTextContent('Không có quy tắc nào áp (giữ giá gốc)');
    expect(b1).not.toHaveTextContent('#');
    expect(b2).toHaveTextContent('#3');
    expect(b2).toHaveTextContent('Ghi đè: 400.000 đ');
    expect(b2).not.toHaveTextContent('/ghế'); // bao xe: không theo ghế
    expect(b2).toHaveTextContent('Cầu Giấy (Hà Nội) ↔ Đại Từ (Thái Nguyên)');
    expect(b2).toHaveTextContent('khớp chiều ngược');
    expect(b3).toHaveTextContent('#99'); // luật thắng thiếu trong `rules`: vẫn hiện mã, không vỡ
  });

  it('dòng đang chọn được tô (aria-pressed); bấm dòng khác gọi onSelectCombo(i)', async () => {
    const user = userEvent.setup();
    const onSelectCombo = vi.fn();
    renderPanel({ selectedCombo: 2, onSelectCombo });
    const buttons = comboButtons();
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', 'false']);
    expect(buttons[2].className).toContain('emerald');
    expect(buttons[0].className).not.toContain('bg-emerald');
    await user.click(buttons[1]);
    expect(onSelectCombo).toHaveBeenCalledWith(1);
  });
});

describe('MacroMatchPanel — vì sao các quy tắc khác thua (tổ hợp đang chọn)', () => {
  it('liệt kê đúng thứ tự máy chủ với #mã + kết luận + hai đầu', () => {
    renderPanel({ selectedCombo: 0 });
    const rows = rankingRows();
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent('#13');
    expect(rows[0]).toHaveTextContent('Đang áp dụng');
    expect(rows[1]).toHaveTextContent('#12');
    expect(rows[1]).toHaveTextContent('Thua: mã nhỏ hơn');
    expect(rows[2]).toHaveTextContent('#14');
    expect(rows[2]).toHaveTextContent('Thua: ưu tiên thấp hơn');
    expect(rows[3]).toHaveTextContent('#5');
    expect(rows[3]).toHaveTextContent('Thua: kém cụ thể hơn');
    expect(rows[3]).toHaveTextContent('Cả tỉnh Thái Nguyên → Cả tỉnh Hà Nội');
    expect(rows[3]).toHaveTextContent('+5%');
    expect(rows[4]).toHaveTextContent('#7');
    expect(rows[4]).toHaveTextContent('Không áp dụng (loại cũ)');
    expect(rows[4]).toHaveTextContent('Toàn quốc → Toàn quốc');
    expect(rows[1]).toHaveTextContent('Đại Từ (Thái Nguyên) → Cầu Giấy (Hà Nội)');
  });

  it('chỉ hiện bảng xếp hạng của tổ hợp ĐANG CHỌN (đổi tổ hợp là đổi bảng)', () => {
    const { rerender } = renderPanel({ selectedCombo: 0 });
    expect(ranking()).toHaveAccessibleName('Thứ tự xét quy tắc — Ghép xe · Xe 4 chỗ');
    expect(screen.getAllByRole('list', { name: /^Thứ tự xét quy tắc/ })).toHaveLength(1);
    rerender(<MacroMatchPanel {...base} selectedCombo={3} />);
    expect(ranking()).toHaveAccessibleName('Thứ tự xét quy tắc — Bao xe · Xe 7 chỗ');
    expect(rankingRows()).toHaveLength(1);
    expect(rankingRows()[0]).toHaveTextContent('#99');
  });

  it('tổ hợp không có quy tắc nào khớp: nói rõ, không có danh sách rỗng', () => {
    renderPanel({ selectedCombo: 1 });
    expect(screen.queryByRole('list', { name: /^Thứ tự xét quy tắc/ })).not.toBeInTheDocument();
    expect(screen.getByText('Không có quy tắc đang bật nào khớp chuyến này.')).toBeInTheDocument();
  });

  it('danh sách bị cắt: báo «còn nữa, chỉ hiện 50 dòng đầu»', () => {
    renderPanel({ selectedCombo: 2 });
    expect(rankingRows()).toHaveLength(50);
    expect(screen.getByTestId('macro-match-panel')).toHaveTextContent('Danh sách còn nữa, chỉ hiện 50 dòng đầu.');
  });

  it('không bị cắt thì không báo', () => {
    renderPanel({ selectedCombo: 0 });
    expect(screen.getByTestId('macro-match-panel')).not.toHaveTextContent('còn nữa');
  });

  it('selectedCombo ngoài khoảng: không vỡ, không dòng nào được tô, không bảng xếp hạng', () => {
    renderPanel({ selectedCombo: 9 });
    expect(comboButtons().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(screen.queryByRole('list', { name: /^Thứ tự xét quy tắc/ })).not.toBeInTheDocument();
  });
});

describe('MacroMatchPanel — ghi chú, cảnh báo, đang tải, lỗi', () => {
  it('chú thích cố định: chỉ quy tắc đang bật; chuyến trúng đồng giá thì bỏ mọi quy tắc', () => {
    renderPanel();
    const panel = screen.getByTestId('macro-match-panel');
    expect(panel).toHaveTextContent('Chỉ tính quy tắc đang bật.');
    expect(panel).toHaveTextContent('Chuyến trúng bảng đồng giá thì mọi quy tắc đều bị bỏ.');
  });

  it('PROVINCE_ONLY: nhắc chọn xã/phường nhưng VẪN hiện kết quả', () => {
    renderPanel({ availability: 'PROVINCE_ONLY', originLabel: 'Cả tỉnh Thái Nguyên' });
    expect(screen.getByTestId('macro-match-panel')).toHaveTextContent(
      'Bạn chọn cả tỉnh nên quy tắc cấp xã không được xét — chọn xã/phường để biết chính xác.',
    );
    expect(comboButtons()).toHaveLength(4);
  });

  it('READY thì không có câu nhắc của PROVINCE_ONLY/TEXT_SIDE', () => {
    renderPanel();
    const panel = screen.getByTestId('macro-match-panel');
    expect(panel).not.toHaveTextContent('Bạn chọn cả tỉnh');
    expect(panel).not.toHaveTextContent('Đã chọn theo chữ');
    expect(panel).not.toHaveTextContent('Chọn cả điểm đón và điểm đến');
  });

  it('RANKING_MISMATCH ⇒ dòng đỏ «báo kỹ thuật»; cảnh báo lạ ⇒ hiện mã để không mất thông tin', () => {
    renderPanel({ match: { ...MATCH, warnings: ['RANKING_MISMATCH', 'NEW_THING'] } });
    const red = screen.getByText('Kết quả xếp hạng không khớp máy tính giá — báo kỹ thuật.');
    expect(red.className).toContain('text-red');
    expect(screen.getByTestId('macro-match-panel')).toHaveTextContent('NEW_THING');
  });

  it('không có cảnh báo thì không có dòng đỏ', () => {
    renderPanel();
    expect(screen.queryByText(/không khớp máy tính giá/)).not.toBeInTheDocument();
  });

  it('đang tải: «Đang tra quy tắc…», KHÔNG hiện kết quả (kể cả kết quả cũ còn giữ)', () => {
    renderPanel({ loading: true });
    expect(screen.getByText('Đang tra quy tắc…')).toBeInTheDocument();
    expect(comboButtons()).toHaveLength(0);
  });

  it('lỗi: chữ đỏ, KHÔNG hiện kết quả (có thể đã cũ)', () => {
    renderPanel({ error: 'Máy chủ chưa hỗ trợ tìm kiếm mới (cần cập nhật backend).' });
    const err = screen.getByText('Máy chủ chưa hỗ trợ tìm kiếm mới (cần cập nhật backend).');
    expect(err.className).toContain('text-red');
    expect(comboButtons()).toHaveLength(0);
  });

  it('chưa có kết quả, chưa tải, không lỗi: chỉ tiêu đề + chú thích, không vỡ', () => {
    renderPanel({ match: null });
    expect(screen.getByRole('heading')).toBeInTheDocument();
    expect(comboButtons()).toHaveLength(0);
  });

  it('không truyền danh sách tỉnh: đầu cấp tỉnh hiện bằng mã (không vỡ)', () => {
    renderPanel({ provinces: undefined });
    expect(rankingRows()[3]).toHaveTextContent('Cả tỉnh 19 → Cả tỉnh 01');
  });
});
