import { describe, it, expect } from 'vitest';
import { ApiError, buildApiError, describeApiError } from './api-error';

/**
 * `fetchWithAuth` từng ném `Error(JSON.stringify(envelope))` → 136 site toast
 * hiện nguyên cục JSON lên màn hình admin. `buildApiError` là chỗ duy nhất bóc
 * envelope, nên các bất biến dưới đây bảo vệ toàn bộ 136 site đó cùng lúc.
 */

const envelope = (
  code: string,
  message: string,
  details?: unknown,
) => ({ success: false, error: { code, message, details }, timestamp: '', path: '' });

describe('buildApiError — bất biến message', () => {
  it('KHÔNG BAO GIỜ để JSON lọt vào message', () => {
    // Bất biến quan trọng nhất của cả đợt sửa. Nếu test này đỏ nghĩa là
    // cardump đã quay lại dưới một hình thức khác.
    const err = buildApiError({
      body: envelope('BOK_019', 'Không tìm thấy chuyến.'),
      httpStatus: 404,
      path: 'GET /bookings/1',
    });
    expect(err.message).not.toMatch(/[{}]/);
  });

  it('message không bao giờ rỗng, kể cả với status lạ không có trong bảng', () => {
    // 405/413/415/501… chắc chắn sẽ xảy ra. Thiếu câu bắt-tất thì admin thấy
    // toast trắng, mà test "không chứa {}" ở trên vẫn xanh.
    for (const status of [405, 413, 415, 418, 501, 599]) {
      const err = buildApiError({ body: {}, httpStatus: status, path: 'GET /x' });
      expect(err.message.length, `status ${status}`).toBeGreaterThan(0);
    }
  });

  it('401 có câu riêng — nhánh redirect bỏ sót 401 phát sinh trên trang đăng nhập', () => {
    const err = buildApiError({ body: {}, httpStatus: 401, path: 'POST /auth/me' });
    expect(err.message).toMatch(/đăng nhập/i);
  });
});

describe('buildApiError — chọn câu hiển thị', () => {
  it('giữ nguyên message tiếng Việt của backend', () => {
    const err = buildApiError({
      body: envelope('BOK_019', 'Không tìm thấy chuyến.'),
      httpStatus: 404,
      path: 'GET /bookings/1',
    });
    expect(err.message).toBe('Không tìm thấy chuyến.');
    expect(err.rawMessage).toBeUndefined();
  });

  it('thay message tiếng Anh bằng câu chuẩn, cất câu gốc vào rawMessage', () => {
    const err = buildApiError({
      body: envelope('Not Found', 'Booking not found'),
      httpStatus: 404,
      path: 'GET /bookings/1',
    });
    expect(err.message).toBe('Không tìm thấy dữ liệu.');
    expect(err.rawMessage).toBe('Booking not found');
  });

  it('MIỄN TRỪ VAL_001: giữ nguyên câu tiếng Anh vì nó chỉ đích danh field sai', () => {
    // Backend gom mọi lỗi class-validator vào VAL_001, và 848 decorator DTO
    // không có message tiếng Việt. Thay bằng "Dữ liệu gửi lên không hợp lệ."
    // sẽ khiến admin sửa mò trên form tiền — mất thông tin, vĩnh viễn.
    const err = buildApiError({
      body: envelope('VAL_001', 'commissionPercent must not be greater than 100', [
        'commissionPercent must not be greater than 100',
      ]),
      httpStatus: 400,
      path: 'PATCH /agents/1',
    });
    expect(err.message).toBe('commissionPercent must not be greater than 100');
    expect(err.rawMessage).toBeUndefined();
  });

  it('fallbackMessage thắng câu chuẩn khi backend không trả câu nào', () => {
    // Các endpoint OTP/đăng ký có câu tiếng Việt riêng theo ngữ cảnh
    // ('Gửi OTP thất bại'). Dùng câu chuẩn chung theo status sẽ mất ngữ cảnh đó.
    const err = buildApiError({
      body: {},
      httpStatus: 400,
      path: 'POST /auth/otp',
      fallbackMessage: 'Gửi OTP thất bại. Vui lòng thử lại.',
    });
    expect(err.message).toBe('Gửi OTP thất bại. Vui lòng thử lại.');
  });

  it('câu tiếng Việt của backend vẫn thắng fallbackMessage', () => {
    const err = buildApiError({
      body: envelope('AUTH_009', 'Mã OTP không đúng.'),
      httpStatus: 400,
      path: 'POST /auth/otp',
      fallbackMessage: 'Gửi OTP thất bại. Vui lòng thử lại.',
    });
    expect(err.message).toBe('Mã OTP không đúng.');
  });

  it('lỗi mạng → httpStatus 0 và câu về kết nối', () => {
    const err = buildApiError({ networkError: new TypeError('Failed to fetch'), path: 'GET /x' });
    expect(err.httpStatus).toBe(0);
    expect(err.code).toBe('NETWORK');
    expect(err.message).toMatch(/kết nối/i);
  });

  it('body không phải JSON (HTML 502 từ ALB) → câu 5xx, mã HTTP_502', () => {
    const err = buildApiError({ body: undefined, httpStatus: 502, path: 'GET /x' });
    expect(err.code).toBe('HTTP_502');
    expect(err.message).toMatch(/máy chủ/i);
  });
});

describe('buildApiError — dữ liệu để trace', () => {
  it('bóc đúng code, httpStatus, path, details', () => {
    const err = buildApiError({
      body: envelope('DRV_012', 'Tài xế đang có chuyến chưa kết thúc.', { driverId: '8f2a' }),
      httpStatus: 409,
      path: 'PUT /drivers/8f2a/wallet-lock',
    });
    expect(err.code).toBe('DRV_012');
    expect(err.httpStatus).toBe(409);
    expect(err.path).toBe('PUT /drivers/8f2a/wallet-lock');
    expect(err.details).toEqual({ driverId: '8f2a' });
  });

  it('là instance của Error nên mọi call-site cũ dùng err.message vẫn chạy', () => {
    const err = buildApiError({ body: {}, httpStatus: 500, path: 'GET /x' });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });
});

describe('ApiError.toClipboard — nội dung nút Sao chép', () => {
  it('gồm mã, HTTP, path và giờ VN để admin dán cho dev', () => {
    const err = buildApiError({
      body: envelope('DRV_012', 'Tài xế đang có chuyến chưa kết thúc.'),
      httpStatus: 409,
      path: 'PUT /drivers/8f2a/wallet-lock',
    });
    const text = err.toClipboard();
    expect(text).toContain('DRV_012');
    expect(text).toContain('409');
    expect(text).toContain('PUT /drivers/8f2a/wallet-lock');
    expect(text).toContain('(VN)');
  });

  it('mang theo details — với VAL_001 đây là danh sách ĐẦY ĐỦ field sai', () => {
    // Toast chỉ hiện được message đầu tiên. Không đưa details vào đây thì
    // admin mất các field lỗi còn lại.
    const err = buildApiError({
      body: envelope('VAL_001', 'a must be a number', [
        'a must be a number',
        'b should not be empty',
      ]),
      httpStatus: 400,
      path: 'POST /promotions',
    });
    expect(err.toClipboard()).toContain('b should not be empty');
  });

  it('mang theo rawMessage khi câu gốc đã bị thay', () => {
    const err = buildApiError({
      body: envelope('Not Found', 'Booking not found'),
      httpStatus: 404,
      path: 'GET /bookings/1',
    });
    expect(err.toClipboard()).toContain('Booking not found');
  });
});

describe('describeApiError — dữ liệu dựng toast', () => {
  it('ApiError → có khối trace để hiện mã lỗi và nút Sao chép', () => {
    const err = buildApiError({
      body: { error: { code: 'DRV_012', message: 'Tài xế đang có chuyến chưa kết thúc.' } },
      httpStatus: 409,
      path: 'PUT /drivers/8f2a/wallet-lock',
    });
    const view = describeApiError(err, 'Không cập nhật được tài xế');
    expect(view.title).toBe('Không cập nhật được tài xế');
    expect(view.message).toBe('Tài xế đang có chuyến chưa kết thúc.');
    expect(view.trace).not.toBeNull();
    expect(view.trace!.code).toBe('DRV_012');
    expect(view.trace!.httpStatus).toBe(409);
    expect(view.trace!.clipboard).toContain('PUT /drivers/8f2a/wallet-lock');
  });

  it('Error thường → trace null để ẩn hẳn khối mã lỗi', () => {
    // Không có nhánh này thì toast hiện "Mã lỗi: undefined (HTTP undefined)".
    const view = describeApiError(new Error('Có lỗi xảy ra.'), 'Thao tác thất bại');
    expect(view.trace).toBeNull();
    expect(view.message).toBe('Có lỗi xảy ra.');
  });

  it('giá trị không phải Error → vẫn có câu để hiện, không vỡ', () => {
    for (const bad of [undefined, null, 'chuỗi trần', 42, {}]) {
      const view = describeApiError(bad, 'Thao tác thất bại');
      expect(view.trace).toBeNull();
      expect(view.message.length).toBeGreaterThan(0);
    }
  });

  it('Error thường có message rỗng → dùng câu bắt-tất, không để toast trắng', () => {
    const view = describeApiError(new Error(''), 'Thao tác thất bại');
    expect(view.message.length).toBeGreaterThan(0);
  });
});
