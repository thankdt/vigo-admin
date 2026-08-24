'use client';

import * as React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { updateBookingAdminMemo } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

/** Khớp `MAX_ADMIN_MEMO_LEN` của DTO backend — chặn ở client để admin biết ngay, thay vì gõ xong mới ăn 400. */
const MAX_LEN = 2000;

/**
 * Ô nhập ghi chú NỘI BỘ của admin cho một chuyến (`booking.adminMemo`), dùng ở cột
 * "Ghi chú" của danh sách chuyến.
 *
 * KHÔNG phải `booking.note` (ghi chú của KHÁCH, tài xế đọc được trên app) và cũng không
 * phải `booking.adminNote` (LOG máy ghi, append-only, chỉ đọc — xem ở dialog chi tiết).
 *
 * Lưu khi BLUR và khi Enter; Esc huỷ và trả về giá trị đã lưu. Không SỬA gì thì KHÔNG gọi API.
 *
 * Ba con trỏ dưới đây đều tồn tại vì cùng một lý do: bảng này reload liên tục (debounce 500ms
 * của ô tìm kiếm + sau mọi thao tác khác) và nhiều admin cùng mở một danh sách, nên "giá trị
 * đang hiện trong ô" và "giá trị server đang giữ" có thể lệch nhau BẤT KỲ LÚC NÀO.
 */
export function AdminMemoCell({
  bookingId,
  value,
  onSaved,
}: {
  bookingId: string;
  // `undefined` = backend chưa trả field (bản cũ); `null` = chưa có/đã xoá memo. Cả hai
  // hiện ô rỗng, nên không cần tách nhánh ở UI.
  value: string | null | undefined;
  onSaved: (memo: string | null) => void;
}) {
  const saved = value ?? '';
  const [draft, setDraft] = React.useState(saved);
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'saved'>('idle');
  const { toast } = useToast();

  const focusedRef = React.useRef(false);
  // Admin ĐÃ THẬT SỰ gõ vào ô này chưa. Chỉ focus rồi bấm ra thì KHÔNG được lưu: trong lúc
  // ô đang focus, effect đồng bộ bên dưới cố ý không đụng vào draft, nên draft có thể là
  // giá trị CŨ trong khi admin khác vừa lưu giá trị mới. Blur mà lưu vô điều kiện là đẩy
  // ngược bản cũ đè lên bản mới của người ta — không gõ một ký tự nào.
  const dirtyRef = React.useRef(false);
  // Giá trị của request GẦN NHẤT đã gửi (hoặc giá trị server đã biết, nếu chưa gửi lần nào).
  // So với cái này chứ đừng so với `saved`: sửa 'A'→'B' (request đang bay) rồi sửa lại về
  // 'A' mà so với `saved`='A' thì thành "không đổi" → không gửi gì, và response 'B' về sau
  // sẽ làm ô nhảy về đúng chữ admin vừa xoá.
  const lastSentRef = React.useRef(saved);
  // Đếm request để bỏ kết quả VỀ MUỘN khi đã có lần lưu mới hơn.
  const reqRef = React.useRef(0);
  // Esc đặt cờ này để lần blur NGAY SAU đó không lưu. Reset ở cả onFocus: nếu vì lý do nào
  // đó blur không tới (ô bị unmount, focus bị cướp), cờ còn sót sẽ nuốt mất lần lưu KẾ TIẾP.
  const skipNextBlurRef = React.useRef(false);
  const tickTimerRef = React.useRef<number | null>(null);

  const clearTick = () => {
    if (tickTimerRef.current !== null) {
      window.clearTimeout(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  };
  React.useEffect(() => clearTick, []);

  // Đồng bộ khi dữ liệu ngoài đổi (bảng reload, admin khác vừa lưu). BỎ QUA khi ô đang focus
  // — ghi đè vô điều kiện sẽ xoá chữ admin đang gõ giữa câu, lỗi đó trông y như "app tự xoá
  // ghi chú". Phần bị bỏ qua được bù lại ở onBlur (nhánh không dirty).
  React.useEffect(() => {
    if (focusedRef.current) return;
    setDraft(saved);
    lastSentRef.current = saved;
    dirtyRef.current = false;
  }, [saved]);

  const commit = async (raw: string) => {
    const next = raw.trim();
    if (next === lastSentRef.current) {
      dirtyRef.current = false;
      if (next !== raw) setDraft(next); // gõ thêm khoảng trắng rồi bỏ đi: dọn lại ô
      return;
    }

    const req = ++reqRef.current;
    lastSentRef.current = next;
    clearTick();
    setStatus('saving');
    try {
      const res = await updateBookingAdminMemo(bookingId, next);
      if (req !== reqRef.current) return;
      const stored = res.adminMemo ?? null;
      lastSentRef.current = stored ?? '';
      // Chỉ đồng bộ lại ô khi admin KHÔNG đang gõ trong đó. Kịch bản thật: Enter để lưu
      // (ô mất focus, request bay đi), rồi bấm lại vào ô gõ tiếp NGAY — response về mà ghi
      // vô điều kiện là xoá chữ đang gõ. `reqRef` không đỡ được ca này vì chưa có request
      // nào mới hơn để so.
      if (!focusedRef.current) {
        setDraft(stored ?? '');
        dirtyRef.current = false;
      }
      onSaved(stored);
      setStatus('saved');
      tickTimerRef.current = window.setTimeout(() => setStatus('idle'), 1500);
    } catch (err: any) {
      if (req !== reqRef.current) return;
      // Request hỏng nên server vẫn giữ `saved` — trả mốc so sánh về đúng sự thật, nếu
      // không thì lần sửa sau về đúng giá trị cũ sẽ bị coi là "không đổi" và không gửi.
      lastSentRef.current = saved;
      // Trả ô về giá trị ĐÃ LƯU: giữ nguyên chữ vừa gõ sẽ khiến admin tưởng đã lưu xong rồi
      // bỏ đi, trong khi server vẫn giữ bản cũ. Nhưng nếu admin đã bấm lại vào ô và đang gõ
      // thì ĐỪNG đụng — chữ mới của họ ưu tiên hơn việc dọn ô.
      if (!focusedRef.current) {
        setDraft(saved);
        dirtyRef.current = false;
      }
      setStatus('idle');
      toast({
        variant: 'destructive',
        title: 'Không lưu được ghi chú',
        description: err?.message || 'Vui lòng thử lại.',
      });
    }
  };

  return (
    <div className="relative">
      <Input
        aria-label="Ghi chú nội bộ"
        placeholder="Ghi chú…"
        className="h-8 text-xs pr-6"
        maxLength={MAX_LEN}
        value={draft}
        onChange={(e) => {
          dirtyRef.current = true;
          setDraft(e.target.value);
        }}
        onFocus={() => {
          focusedRef.current = true;
          skipNextBlurRef.current = false;
        }}
        onBlur={() => {
          focusedRef.current = false;
          if (skipNextBlurRef.current) {
            skipNextBlurRef.current = false;
            dirtyRef.current = false;
            return;
          }
          if (!dirtyRef.current) {
            // Không sửa gì: đây là lúc bù lại phần effect đồng bộ đã bỏ qua khi ô còn focus.
            setDraft(saved);
            lastSentRef.current = saved;
            return;
          }
          void commit(draft);
        }}
        onKeyDown={(e) => {
          // `isComposing`: gõ tiếng Việt bằng IME/Telex dùng Enter để chốt chữ đang soạn.
          // Không kiểm cờ này thì phím Enter đó bị hiểu là "lưu" và cướp mất chữ đang gõ.
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            // Để blur lo việc lưu — một đường ghi duy nhất, không lo lưu hai lần.
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            skipNextBlurRef.current = true;
            dirtyRef.current = false;
            setDraft(saved);
            e.currentTarget.blur();
          }
        }}
      />
      {status === 'saving' && (
        <Loader2 className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
      )}
      {status === 'saved' && (
        <Check className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-green-600" />
      )}
    </div>
  );
}
