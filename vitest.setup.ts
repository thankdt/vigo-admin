import '@testing-library/jest-dom/vitest';

/**
 * jsdom KHÔNG có `ResizeObserver`, mà `cmdk` (nền của MultiSelectComboBox và mọi
 * Command/Combobox trong repo) gọi thẳng `new ResizeObserver(...)` lúc mount. Thiếu
 * polyfill thì test render component đó ném `ResizeObserver is not defined` — lỗi
 * trỏ vào react-dom nên rất dễ tưởng là hỏng component chứ không phải thiếu môi trường.
 *
 * Stub rỗng là đủ: không test nào khẳng định điều gì về việc đo kích thước — jsdom
 * vốn không layout, mọi kích thước đều là 0. Polyfill "thật" chỉ tạo ảo giác chính xác.
 */
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub;
}

/**
 * Cùng lý do: jsdom không cài `Element.prototype.scrollIntoView`, mà `cmdk` gọi nó để
 * cuộn mục đang chọn vào tầm nhìn ngay trong layout effect. Đây là thao tác CUỘN thuần
 * hình ảnh, không có gì để khẳng định trong test — no-op là đúng, không phải né tránh.
 */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoViewStub(): void {};
}
