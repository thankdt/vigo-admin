import { describe, it, expect } from 'vitest';
import { drilldownTitle } from './report-dims';

describe('drilldownTitle', () => {
  it('gộp tỉnh đi + tỉnh đến thành "A → B" để đọc ra hướng, các chiều khác nối bằng " · "', () => {
    expect(
      drilldownTitle({ provinceFrom: 'Hà Nội', provinceTo: 'Hải Phòng', cancelPhase: 'Huỷ trước khi có tài' }),
    ).toBe('Hà Nội → Hải Phòng · Huỷ trước khi có tài');
  });

  it('hai chiều ngược nhau cho hai tiêu đề khác nhau', () => {
    expect(drilldownTitle({ provinceFrom: 'Hải Phòng', provinceTo: 'Hà Nội' })).toBe('Hải Phòng → Hà Nội');
  });

  it('giữ thứ tự chiều: chiều đứng trước cặp tỉnh vẫn đứng trước', () => {
    expect(drilldownTitle({ serviceType: 'Bao xe', provinceFrom: 'Hà Nội', provinceTo: 'Bắc Ninh' })).toBe(
      'Bao xe · Hà Nội → Bắc Ninh',
    );
  });

  it('chỉ có MỘT trong hai chiều tỉnh thì không bịa mũi tên', () => {
    expect(drilldownTitle({ provinceFrom: 'Hà Nội', cancelPhase: 'Không huỷ' })).toBe('Hà Nội · Không huỷ');
  });

  it('báo cáo cũ theo tuyến vẫn hiện nguyên giá trị chiều', () => {
    expect(drilldownTitle({ route: 'Hà Nội - Hải Phòng', cancelPhase: 'Không huỷ' })).toBe(
      'Hà Nội - Hải Phòng · Không huỷ',
    );
  });
});
