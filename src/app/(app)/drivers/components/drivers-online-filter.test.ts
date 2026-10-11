import { describe, expect, it } from 'vitest';
import {
  ONLINE_FILTER_TABS,
  onlineFilterWarning,
  onlineStateParam,
} from './drivers-online-filter';

describe('onlineStateParam', () => {
  it('chỉ gửi ở tab Đã duyệt và Tất cả', () => {
    expect(ONLINE_FILTER_TABS).toEqual(['true', 'all']);
    expect(onlineStateParam('true', 'stale')).toBe('stale');
    expect(onlineStateParam('all', 'online')).toBe('online');
  });

  it.each(['pending', 'unsubmitted', 'false', 'needsReview'])('tab %s → không gửi', (tab) => {
    expect(onlineStateParam(tab, 'stale')).toBeUndefined();
  });

  it('chưa chọn → không gửi', () => {
    expect(onlineStateParam('true', '')).toBeUndefined();
  });
});

describe('onlineFilterWarning', () => {
  it('không lọc → không cảnh báo', () => {
    expect(onlineFilterWarning(undefined, {})).toBeNull();
  });

  // BE cũ im lặng bỏ param lạ và trả danh sách KHÔNG lọc — admin phải được báo.
  it('gửi mà meta không echo → unsupported', () => {
    expect(onlineFilterWarning('stale', {})).toBe('unsupported');
    expect(onlineFilterWarning('stale', undefined)).toBe('unsupported');
  });

  it('Redis lỗi → presenceUnavailable', () => {
    expect(onlineFilterWarning('stale', { onlineState: 'stale', presenceUnavailable: true })).toBe(
      'presenceUnavailable',
    );
  });

  it('echo đúng → không cảnh báo', () => {
    expect(onlineFilterWarning('busy', { onlineState: 'busy' })).toBeNull();
  });
});
