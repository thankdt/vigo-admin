/**
 * Cổng đại lý KHÔNG nhận token qua URL (?token= / ?sso_token=) — nhận là dính login CSRF: link
 * chứa token của kẻ xấu đăng nhập nạn nhân vào tài khoản kẻ xấu. SSO của app khách/tài xế ghi
 * token thẳng vào localStorage của webview. Lỡ có token trên URL thì chỉ GỠ đi (không lưu) để
 * nó không nằm lại thanh địa chỉ/lịch sử trình duyệt. Giữ nguyên query khác và hash.
 */
export function stripUrlTokens(): void {
  try {
    const searchParams = new URLSearchParams(window.location.search);
    if (!searchParams.has('sso_token') && !searchParams.has('token')) return;
    searchParams.delete('sso_token');
    searchParams.delete('token');
    const cleanSearch = searchParams.toString();
    const cleanUrl = window.location.pathname + (cleanSearch ? `?${cleanSearch}` : '') + window.location.hash;
    // Giữ history.state: App Router lưu trạng thái điều hướng của nó trong đó.
    window.history.replaceState(window.history.state, '', cleanUrl);
  } catch (_) {}
}
