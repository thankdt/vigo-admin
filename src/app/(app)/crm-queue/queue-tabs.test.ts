import { describe, it, expect } from 'vitest';
import { paramsForTab, QUEUE_TAB_ORDER, QUEUE_TAB_LABEL } from './queue-tabs';

describe('paramsForTab', () => {
  // Chuyến đã COMPLETED/CANCELLED KHÔNG được nằm trong tab gọi trước: backend suy pha
  // theo completedAt nên xử lý chúng sẽ ghi vào callAfter*, callBeforeStatus vẫn NULL
  // -> dòng đó ở lại hàng đợi VĨNH VIỄN.
  it('tab "before" loại trừ chuyến đã xong và sắp theo chờ lâu nhất', () => {
    expect(paramsForTab('before', 'admin-1')).toEqual({
      callBefore: 'uncalled',
      excludeStatus: 'COMPLETED,CANCELLED',
      sortBy: 'createdAt',
      order: 'ASC',
    });
  });

  it('tab "after" chỉ chuyến đã hoàn thành, sắp theo hoàn thành sớm nhất', () => {
    expect(paramsForTab('after', 'admin-1')).toEqual({
      callAfter: 'uncalled',
      status: 'COMPLETED',
      sortBy: 'completedAt',
      order: 'ASC',
    });
  });

  it('tab "mine" lọc theo admin đang đăng nhập', () => {
    expect(paramsForTab('mine', 'admin-1')).toEqual({
      claimedBy: 'admin-1',
      sortBy: 'createdAt',
      order: 'ASC',
    });
  });

  it('tab "overdue" = "after" + cờ overdue (ngưỡng giờ do BE quyết)', () => {
    const p = paramsForTab('overdue', 'admin-1');
    expect(p).toMatchObject({ callAfter: 'uncalled', status: 'COMPLETED', overdue: true });
    // Ngưỡng nằm ở system_config phía BE — FE biết con số này là bắt đầu trôi lệch.
    expect(p).not.toHaveProperty('overdueHours');
  });

  it('4 tab, đúng thứ tự hiển thị', () => {
    expect(QUEUE_TAB_ORDER).toEqual(['before', 'after', 'mine', 'overdue']);
  });

  it('mọi tab đều có nhãn tiếng Việt', () => {
    for (const tab of QUEUE_TAB_ORDER) {
      expect(QUEUE_TAB_LABEL[tab]).toBeTruthy();
    }
  });

  // Chỉ tab "mine" được phép mang claimedBy. Rò sang tab khác là CSKH thấy thiếu việc
  // của đồng nghiệp mà không hiểu vì sao.
  it('chỉ tab "mine" gửi claimedBy', () => {
    for (const tab of QUEUE_TAB_ORDER) {
      const p = paramsForTab(tab, 'admin-1');
      if (tab === 'mine') expect(p.claimedBy).toBe('admin-1');
      else expect(p).not.toHaveProperty('claimedBy');
    }
  });
});
