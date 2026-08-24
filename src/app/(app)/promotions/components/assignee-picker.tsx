'use client';
import * as React from 'react';
import { lookupCustomerByPhone } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, X } from 'lucide-react';

export type PickedCustomer = { id: string; phone: string; fullName: string | null };

/**
 * Ô chọn khách theo SĐT cho voucher `TARGETED`.
 *
 * Voucher `TARGETED` chỉ tới tay khách qua bảng `user_promotion` — không có ô này
 * thì chọn TARGETED ở form là tạo ra một mã KHÔNG AI nhìn thấy, kể cả người được
 * "nhắm tới". Vì vậy form gọi nó bắt buộc khi visibility = TARGETED.
 *
 * Tra theo SĐT CHÍNH XÁC (backend `findByPhone`), không phải tìm mờ: gán nhầm
 * voucher cho người lạ là mất tiền thật, nên thà bắt admin gõ đủ số còn hơn cho họ
 * chọn nhầm dòng trong danh sách gợi ý.
 */
export function AssigneePicker({
  value,
  onChange,
  disabled,
}: {
  value: PickedCustomer[];
  onChange: (next: PickedCustomer[]) => void;
  disabled?: boolean;
}) {
  const [phone, setPhone] = React.useState('');
  const [isChecking, setIsChecking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const add = async () => {
    const p = phone.trim();
    if (!p) return;
    setError(null);

    if (value.some((v) => v.phone === p)) {
      setError('Số này đã có trong danh sách.');
      return;
    }

    setIsChecking(true);
    try {
      const res = await lookupCustomerByPhone(p);
      if (!res.exists) {
        setError('Không tìm thấy tài khoản với số này.');
        return;
      }
      if (!res.id) {
        // Backend cũ chưa trả `id`. Báo thẳng thay vì gán bằng một id rỗng — im lặng
        // ở đây sẽ tạo ra dòng user_promotion trỏ vào hư không.
        setError('Backend chưa hỗ trợ gán voucher theo SĐT. Cần deploy bản mới.');
        return;
      }
      onChange([...value, { id: res.id, phone: p, fullName: res.fullName }]);
      setPhone('');
    } catch {
      setError('Không tra cứu được. Thử lại sau.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>Khách được nhận voucher</Label>
      <div className="flex gap-2">
        <Input
          value={phone}
          disabled={disabled || isChecking}
          placeholder="Số điện thoại khách"
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => {
            // Enter trong ô này phải THÊM KHÁCH, không được submit cả form —
            // submit sớm sẽ tạo voucher trước khi admin gán xong danh sách.
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={add} disabled={disabled || isChecking}>
          {isChecking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Thêm
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {value.map((c) => (
            <Badge key={c.id} variant="secondary" className="gap-1 py-1">
              {c.fullName ? `${c.fullName} · ${c.phone}` : c.phone}
              <button
                type="button"
                aria-label={`Bỏ ${c.phone}`}
                className="ml-1 rounded-sm hover:text-destructive"
                onClick={() => onChange(value.filter((v) => v.id !== c.id))}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Chưa chọn ai. Voucher chỉ định mà không gán cho khách nào thì không ai thấy nó.
        </p>
      )}
    </div>
  );
}
