function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // Next 15 ở chế độ output:'export' lấy payload RSC tại "<đường-dẫn>index.txt".
    // Khi lệnh fetch đó NÉM lỗi (mạng chớp, đổi wifi, máy vừa ngủ dậy), router
    // hard-navigate trình duyệt thẳng vào chính URL .txt đó -> S3 trả text/plain ->
    // người dùng thấy nguyên cục payload thay vì trang.
    //
    // Bản vá gốc nằm ở patches/next+15.5.9.patch. Function này là LƯỚI ĐỠ: cứu cả những
    // tab đang mở bundle cũ (chưa vá) và mọi đường khác lỡ rơi vào .txt.
    //
    // Chỉ bắt đúng hậu tố "/index.txt" — toàn bộ .txt trong bản build đều là payload RSC,
    // không có robots.txt/sitemap nên không chặn nhầm thứ gì.
    if (uri.length < 10 || uri.slice(-10) !== '/index.txt') {
        return request;
    }

    // CHỈ chặn ĐIỀU HƯỚNG THẬT của trình duyệt. Router của Next gọi đúng URL này bằng
    // fetch() với sec-fetch-dest: empty — phải để đi tiếp, nếu không chuyển trang phía
    // client sẽ chết. Client không gửi header này (bot, curl) cũng để đi tiếp.
    var dest = request.headers['sec-fetch-dest'];
    if (!dest || dest.value !== 'document') {
        return request;
    }

    // "/agent-orders/index.txt" -> "/agent-orders/" ; "/index.txt" -> "/"
    return {
        statusCode: 302,
        statusDescription: 'Found',
        headers: {
            'location': { value: uri.slice(0, -9) },
            'cache-control': { value: 'no-store' }
        }
    };
}
