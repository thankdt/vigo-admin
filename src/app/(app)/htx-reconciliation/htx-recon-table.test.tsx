import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HtxHeadTailRow1, HtxHeadLowerRows, HtxLeafCells } from './htx-recon-table';
import { expandHtxRow, type HtxFinancials } from './htx-recon-shared';

// Same worked example as htx-recon-shared.test.ts (cột 8…26 trong spec sheet).
const SAMPLE: HtxFinancials = {
  grossRevenue: 259200,
  totalVat: 19200,
  htxCommission: 7000,
  htxVatRemit: 15360,
  htxTotalReceived: 25540,
  vigoCommission: 21000,
  vigoVatRemit: 3840,
  platformFeeGross: 48000,
  km: 20000,
};

// Renders the shared header + body fragments inside a real table. This is the
// guard that would have caught the "TableHead is not defined" runtime crash:
// a render test exercises the actual JSX, not just the pure helper.
function renderTable() {
  return render(
    <table>
      <thead>
        <tr>
          <th rowSpan={4}>STT</th>
          <HtxHeadTailRow1 />
        </tr>
        <HtxHeadLowerRows />
      </thead>
      <tbody>
        <tr>
          <td>1</td>
          <HtxLeafCells row={expandHtxRow(SAMPLE)} />
        </tr>
      </tbody>
    </table>,
  );
}

describe('HTX reconciliation table fragments', () => {
  it('renders the grouped + base header labels without crashing', () => {
    renderTable();
    expect(screen.getByText('Phân bổ doanh, VAT, Thuế TNCN và các khoản phí')).toBeInTheDocument();
    expect(screen.getByText('Cước vận tải HTX trước VAT')).toBeInTheDocument();
    expect(screen.getByText('VAT cước vận tải HTX')).toBeInTheDocument();
    expect(screen.getByText('Phí APP trước VAT (phí nền tảng VIGO)')).toBeInTheDocument();
    expect(screen.getByText('Tài xế')).toBeInTheDocument();
    expect(screen.getByText('HTX, ĐVCCX')).toBeInTheDocument();
    expect(screen.getByText('VIGO')).toBeInTheDocument();
    expect(screen.getByText('Các khoản thu tài xế')).toBeInTheDocument();
    expect(screen.getByText('Tổng tiền tài xế thực nhận')).toBeInTheDocument();
    expect(screen.getByText('Phí nền tảng (gộp)')).toBeInTheDocument();
    expect(screen.getByText('Khuyến mãi (nền tảng tài trợ)')).toBeInTheDocument();
    expect(screen.getByText('Phí nền tảng (thực thu)')).toBeInTheDocument();
  });

  it('renders the 19 formatted financial body cells', () => {
    renderTable();
    expect(screen.getByText('192.000')).toBeInTheDocument(); // htxFareBeforeVat (8)
    expect(screen.getAllByText('15.360')).toHaveLength(2); // htxFareVat (9) + htxVat (21)
    expect(screen.getAllByText('48.000')).toHaveLength(2); // appFeeBeforeVat (10) + platformFeeGross (14)
    expect(screen.getAllByText('3.840')).toHaveLength(2); // appFeeVat (11) + vigoVat (25)
    expect(screen.getByText('259.200')).toBeInTheDocument(); // customerTotal (12)
    expect(screen.getByText('212.000')).toBeInTheDocument(); // driverIncome (13)
    expect(screen.getByText('20.000')).toBeInTheDocument(); // km (15)
    expect(screen.getByText('28.000')).toBeInTheDocument(); // platformFee (16)
    expect(screen.getAllByText('3.180')).toHaveLength(2); // driverPit (17) + htxPit (22)
    expect(screen.getByText('208.820')).toBeInTheDocument(); // driverNet (19)
    expect(screen.getByText('7.000')).toBeInTheDocument(); // htxFee (20)
    expect(screen.getByText('25.540')).toBeInTheDocument(); // htxTotal (23)
    expect(screen.getByText('21.000')).toBeInTheDocument(); // vigoFee (24)
    expect(screen.getByText('24.840')).toBeInTheDocument(); // vigoTotal (26)
  });
});
