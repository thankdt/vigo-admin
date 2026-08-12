/**
 * Lỗi API đã bóc sẵn cho người đọc.
 *
 * Trước đây `fetchWithAuth` ném `new Error(JSON.stringify(envelope))`, nên cả 136
 * site `toast({ description: err.message })` in nguyên cục JSON lên màn hình admin.
 * Vì KHÔNG site nào rẽ nhánh theo nội dung `err.message` (đã đo), chỉ cần chỗ này
 * đảm bảo `message` luôn là câu tiếng Việt sạch là toàn bộ 136 site hết cardump
 * mà không phải sửa tay từng chỗ.
 */

/** Ký tự có dấu tiếng Việt — dùng để phân biệt câu tiếng Việt với câu tiếng Anh. */
const VN_DIACRITICS =
  /[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i;

/**
 * Câu chuẩn theo HTTP status, dùng khi backend không trả câu tiếng Việt.
 *
 * `401` KHÔNG thừa: nhánh redirect trong `fetchWithAuth` có điều kiện
 * `pathname !== '/'`, nên 401 phát sinh ngay trên trang đăng nhập sẽ rơi xuống
 * đây. Thiếu dòng này thì admin thấy toast trắng.
 */
const STATUS_MESSAGE: Record<number, string> = {
  0: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
  400: 'Dữ liệu gửi lên không hợp lệ.',
  401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  403: 'Bạn không có quyền thực hiện thao tác này.',
  404: 'Không tìm thấy dữ liệu.',
  409: 'Dữ liệu đã bị trùng hoặc vừa thay đổi. Tải lại rồi thử lại.',
  422: 'Dữ liệu không hợp lệ.',
  429: 'Thao tác quá nhanh. Vui lòng thử lại sau.',
};

const SERVER_ERROR =
  'Máy chủ đang gặp sự cố. Vui lòng báo đội kỹ thuật kèm mã lỗi bên dưới.';

/** Bảng trên không thể liệt kê hết (405, 413, 415, 501…) — thiếu là chuyện chắc xảy ra. */
const FALLBACK =
  'Thao tác không thực hiện được. Vui lòng báo đội kỹ thuật kèm mã lỗi bên dưới.';

function standardMessage(httpStatus: number): string {
  return STATUS_MESSAGE[httpStatus] ?? (httpStatus >= 500 ? SERVER_ERROR : FALLBACK);
}

/**
 * Dấu thời gian giờ VN (UTC+7), độc lập với timezone trình duyệt — theo luật bắt
 * buộc của dự án. Cùng idiom `+7 * 3600_000` với `vnDay` trong driver-team-labels.
 */
function vnTimestamp(ms: number = Date.now()): string {
  return new Date(ms + 7 * 3600_000).toISOString().replace('T', ' ').slice(0, 19);
}

export class ApiError extends Error {
  /** 'BOK_019' | 'VAL_001' | 'Not Found' | 'NETWORK' | 'HTTP_502' */
  readonly code: string;
  /** 0 khi lỗi mạng (chưa nhận được response nào) */
  readonly httpStatus: number;
  /** 'PUT /drivers/8f2a/wallet-lock' */
  readonly path: string;
  /** Giữ lại để đưa vào nút Sao chép — KHÔNG hiện trên toast */
  readonly details?: unknown;
  /** Câu gốc của backend, chỉ có khi câu đó đã bị thay bằng câu chuẩn */
  readonly rawMessage?: string;
  /** Giờ VN lúc lỗi xảy ra */
  readonly at: string;

  constructor(init: {
    message: string;
    code: string;
    httpStatus: number;
    path: string;
    details?: unknown;
    rawMessage?: string;
    at?: string;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.httpStatus = init.httpStatus;
    this.path = init.path;
    this.details = init.details;
    this.rawMessage = init.rawMessage;
    this.at = init.at ?? vnTimestamp();
  }

  /**
   * Nội dung nút "Sao chép chi tiết" — admin dán thẳng vào Zalo/ticket cho dev.
   *
   * `details` BẮT BUỘC có mặt: với VAL_001 nó là danh sách đầy đủ mọi field sai,
   * trong khi toast chỉ hiện được câu đầu tiên.
   */
  toClipboard(): string {
    const lines = [
      `${this.code} | HTTP ${this.httpStatus}`,
      this.path,
      `${this.at} (VN)`,
    ];
    if (this.rawMessage) lines.push(`rawMessage: ${this.rawMessage}`);
    if (this.details !== undefined && this.details !== null) {
      lines.push(`details: ${JSON.stringify(this.details)}`);
    }
    return lines.join('\n');
  }
}

export type ApiErrorView = {
  title: string;
  message: string;
  /**
   * `null` khi lỗi KHÔNG phải ApiError — khi đó toast phải ẩn hẳn khối mã lỗi
   * và nút Sao chép, thay vì hiện "Mã lỗi: undefined (HTTP undefined)".
   */
  trace: { code: string; httpStatus: number; clipboard: string } | null;
};

/**
 * Bóc `unknown` thành dữ liệu dựng toast. Nhận `unknown` chứ không phải `ApiError`
 * vì call-site bắt lỗi từ `catch` — có thể là ApiError, Error thường, hoặc bất kỳ
 * giá trị nào (chuỗi, undefined) do thư viện bên thứ ba ném ra.
 */
export function describeApiError(err: unknown, title: string): ApiErrorView {
  if (err instanceof ApiError) {
    return {
      title,
      message: err.message || FALLBACK,
      trace: {
        code: err.code,
        httpStatus: err.httpStatus,
        clipboard: err.toClipboard(),
      },
    };
  }

  const message =
    err instanceof Error && err.message ? err.message : FALLBACK;
  return { title, message, trace: null };
}

/** Envelope chuẩn của backend; một số endpoint cũ chỉ có `message` ở tầng gốc. */
type ErrorBody = {
  error?: { code?: string; message?: unknown; details?: unknown };
  message?: unknown;
};

export function buildApiError(input: {
  body?: unknown;
  httpStatus?: number;
  path: string;
  networkError?: unknown;
  /**
   * Câu tiếng Việt theo ngữ cảnh của call-site, dùng thay câu chuẩn theo status
   * khi backend không trả câu nào dùng được. Ví dụ 'Gửi OTP thất bại.' cụ thể
   * hơn hẳn 'Dữ liệu gửi lên không hợp lệ.'
   */
  fallbackMessage?: string;
  /** Chỉ dùng trong test để cố định giờ */
  nowMs?: number;
}): ApiError {
  const at = vnTimestamp(input.nowMs);

  if (input.networkError) {
    return new ApiError({
      message: standardMessage(0),
      code: 'NETWORK',
      httpStatus: 0,
      path: input.path,
      at,
    });
  }

  const httpStatus = input.httpStatus ?? 0;
  const body = (input.body ?? {}) as ErrorBody;
  const code = body.error?.code || `HTTP_${httpStatus}`;

  // `ErrorBody` là ép kiểu, KHÔNG phải kiểm tra — nên phải chốt runtime ở đây.
  // Backend hiện ép mảng lỗi class-validator về một chuỗi trước khi trả, nhưng
  // bất biến "message là câu người đọc được" không được phép phụ thuộc vào hành
  // vi của repo khác: backend đổi filter là admin in ra "a,b" hoặc
  // "[object Object]" mà không ai biết. Giá trị lạ vẫn được giữ trong `details`
  // để nút Sao chép không mất thông tin.
  const rawMsg = body.error?.message ?? body.message;
  const beMessage = typeof rawMsg === 'string' ? rawMsg : undefined;
  const details = body.error?.details ?? (beMessage ? undefined : rawMsg);

  const base = { code, httpStatus, path: input.path, details, at };

  // MIỄN TRỪ VAL_001 — lỗi nhập liệu từ class-validator.
  // Backend gom mọi lỗi validate vào một mã này, mà 848 decorator DTO không có
  // message tiếng Việt. Thay câu đó bằng "Dữ liệu gửi lên không hợp lệ." sẽ xoá
  // mất TÊN FIELD sai, khiến admin sửa mò trên form voucher/rút tiền/hoa hồng.
  // Một câu tiếng Anh chỉ đích danh field hữu ích hơn một câu Việt vô nghĩa.
  if (code === 'VAL_001' && beMessage) {
    return new ApiError({ ...base, message: beMessage });
  }

  if (beMessage && VN_DIACRITICS.test(beMessage)) {
    return new ApiError({ ...base, message: beMessage });
  }

  // Toàn ASCII ⇒ tiếng Anh. Thay bằng câu theo ngữ cảnh nếu call-site có, không
  // thì câu chuẩn theo status. Câu gốc luôn được giữ cho nút Sao chép.
  return new ApiError({
    ...base,
    message: input.fallbackMessage ?? standardMessage(httpStatus),
    rawMessage: beMessage || undefined,
  });
}
