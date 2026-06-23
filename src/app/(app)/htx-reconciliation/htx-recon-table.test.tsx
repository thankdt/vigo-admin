import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HtxHeadTailRow1, HtxHeadLowerRows, HtxLeafCells } from './htx-recon-table';
import { expandHtxRow, type HtxFinancials } from './htx-recon-shared';

const SAMPLE: HtxFinancials = {
  grossRevenue: 270000,
  totalVat: 20000,
  htxCommission: 12500,
  htxVatRemit: 16000,
  htxTotalReceived: 31500,
  vigoCommission: 37500,
  vigoVatRemit: 4000,
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
  it('renders the grouped header labels without crashing', () => {
    renderTable();
    expect(screen.getByText('Phân bổ doanh, VAT, Thuế TNCN và các khoản phí')).toBeInTheDocument();
    expect(screen.getByText('Tài xế')).toBeInTheDocument();
    expect(screen.getByText('HTX, ĐVCCX')).toBeInTheDocument();
    expect(screen.getByText('VIGO')).toBeInTheDocument();
    expect(screen.getByText('Các khoản thu tài xế')).toBeInTheDocument();
    expect(screen.getByText('Tổng tiền tài xế thực nhận')).toBeInTheDocument();
  });

  it('renders the 15 formatted financial body cells', () => {
    renderTable();
    expect(screen.getByText('250.000')).toBeInTheDocument(); // priceBeforeVat
    expect(screen.getByText('200.000')).toBeInTheDocument(); // driverIncome
    expect(screen.getByText('197.000')).toBeInTheDocument(); // driverNet
    expect(screen.getByText('31.500')).toBeInTheDocument(); // htxTotal
    expect(screen.getByText('41.500')).toBeInTheDocument(); // vigoTotal
  });
});
