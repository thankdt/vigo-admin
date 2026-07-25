import { describe, it, expect } from 'vitest';
import { bookingToDraft } from './duplicate-utils';
import type { Booking } from '@/lib/types';

// Chuyến gốc tối thiểu — mỗi test override phần nó quan tâm.
const base = (over: Partial<Booking> = {}): Booking => ({
  id: 'b1e2c3d4-0000-0000-0000-000000000001',
  customerId: 'c1',
  pickupAddress: { address: 'Sân bay Nội Bài', lat: 21.2187, lng: 105.8047 },
  dropoffAddress: { address: '1 Trần Phú, Hà Nội', lat: 21.0278, lng: 105.8342 },
  price: 500000,
  status: 'COMPLETED',
  createdAt: '2026-07-01T03:00:00.000Z',
  customer: { id: 'c1', fullName: 'Nguyễn Văn A', phone: '0909123456' },
  ...over,
}) as Booking;

describe('bookingToDraft — khách hàng', () => {
  it('ưu tiên senderInfo (snapshot lúc đặt) hơn customer', () => {
    const d = bookingToDraft(base({
      senderInfo: { name: 'Tên lúc đặt', phone: '0911222333' },
    }));
    expect(d.customerPhone).toBe('0911222333');
    expect(d.customerName).toBe('Tên lúc đặt');
  });

  it('fallback sang customer khi không có senderInfo', () => {
    const d = bookingToDraft(base());
    expect(d.customerPhone).toBe('0909123456');
    expect(d.customerName).toBe('Nguyễn Văn A');
  });

  it('customer null và không có senderInfo → để trống, không throw', () => {
    const d = bookingToDraft(base({ customer: null }));
    expect(d.customerPhone).toBe('');
    expect(d.customerName).toBe('');
  });

  it('senderInfo thiếu phone → lấy phone từ customer', () => {
    const d = bookingToDraft(base({ senderInfo: { name: 'Chỉ có tên' } }));
    expect(d.customerPhone).toBe('0909123456');
    expect(d.customerName).toBe('Chỉ có tên');
  });
});

describe('bookingToDraft — địa chỉ & toạ độ', () => {
  it('đọc shape chuẩn {address, lat, long}', () => {
    const d = bookingToDraft(base({
      pickupAddress: { address: 'A', lat: 21.1, long: 105.1 } as any,
      dropoffAddress: { address: 'B', lat: 20.9, long: 105.9 } as any,
    }));
    expect(d.pickup).toEqual({ address: 'A', lat: 21.1, long: 105.1 });
    expect(d.dropoff).toEqual({ address: 'B', lat: 20.9, long: 105.9 });
    expect(d.missingCoords).toEqual([]);
  });

  it('đọc biến thể key lng / latitude / longitude', () => {
    const d = bookingToDraft(base({
      pickupAddress: { address: 'A', lat: 21.1, lng: 105.1 } as any,
      dropoffAddress: { address: 'B', latitude: 20.9, longitude: 105.9 } as any,
    }));
    expect(d.pickup).toEqual({ address: 'A', lat: 21.1, long: 105.1 });
    expect(d.dropoff).toEqual({ address: 'B', lat: 20.9, long: 105.9 });
    expect(d.missingCoords).toEqual([]);
  });

  it('địa chỉ là string thuần → null + báo thiếu toạ độ', () => {
    const d = bookingToDraft(base({ pickupAddress: 'Chợ Đồng Xuân' }));
    expect(d.pickup).toBeNull();
    expect(d.missingCoords).toEqual(['pickup']);
  });

  it('object thiếu lat/long → null + báo thiếu toạ độ', () => {
    const d = bookingToDraft(base({ dropoffAddress: { address: 'B' } as any }));
    expect(d.dropoff).toBeNull();
    expect(d.missingCoords).toEqual(['dropoff']);
  });

  it('toạ độ 0/0 coi như thiếu (không tạo chuyến ở giữa biển)', () => {
    const d = bookingToDraft(base({
      pickupAddress: { address: 'A', lat: 0, long: 0 } as any,
    }));
    expect(d.pickup).toBeNull();
    expect(d.missingCoords).toEqual(['pickup']);
  });

  it('dropoffAddress null (chuyến giao hàng cũ) → null + báo thiếu', () => {
    const d = bookingToDraft(base({ dropoffAddress: null }));
    expect(d.dropoff).toBeNull();
    expect(d.missingCoords).toEqual(['dropoff']);
  });

  it('thiếu cả hai → liệt kê cả hai theo thứ tự đón, trả', () => {
    const d = bookingToDraft(base({ pickupAddress: 'A', dropoffAddress: null }));
    expect(d.missingCoords).toEqual(['pickup', 'dropoff']);
  });
});

describe('bookingToDraft — loại dịch vụ & xe', () => {
  it('giữ nguyên serviceType/vehicleType hợp lệ', () => {
    const d = bookingToDraft(base({ serviceType: 'RIDE', requestedVehicleType: 'CAR_7' }));
    expect(d.serviceType).toBe('RIDE');
    expect(d.vehicleType).toBe('CAR_7');
  });

  it('serviceType lạ/thiếu → CARPOOL (mặc định của form)', () => {
    expect(bookingToDraft(base({ serviceType: 'SOMETHING_NEW' })).serviceType).toBe('CARPOOL');
    expect(bookingToDraft(base({ serviceType: undefined })).serviceType).toBe('CARPOOL');
  });

  it('requestedVehicleType null/lạ → CAR_4', () => {
    expect(bookingToDraft(base({ requestedVehicleType: null })).vehicleType).toBe('CAR_4');
    expect(bookingToDraft(base({ requestedVehicleType: 'BIKE' })).vehicleType).toBe('CAR_4');
  });
});

describe('bookingToDraft — hành khách', () => {
  it('passengerNames null → không có khách đi cùng', () => {
    expect(bookingToDraft(base({ passengerNames: null } as any)).coPassengers).toEqual([]);
  });

  it('chỉ có khách chính → không có khách đi cùng', () => {
    expect(bookingToDraft(base({ passengerNames: ['Nguyễn Văn A'] } as any)).coPassengers).toEqual([]);
  });

  it('bỏ index 0 (khách chính), giữ phần còn lại', () => {
    const d = bookingToDraft(base({ passengerNames: ['A', 'B', 'C'] } as any));
    expect(d.coPassengers).toEqual(['B', 'C']);
  });

  it('loại tên rỗng/khoảng trắng và trim', () => {
    const d = bookingToDraft(base({ passengerNames: ['A', ' B ', '', '   '] } as any));
    expect(d.coPassengers).toEqual(['B']);
  });

  it('cắt theo giới hạn ghế của loại xe — RIDE CAR_4 tối đa 4 khách (3 đi cùng)', () => {
    const d = bookingToDraft(base({
      serviceType: 'RIDE',
      requestedVehicleType: 'CAR_4',
      passengerNames: ['A', 'B', 'C', 'D', 'E', 'F'],
    } as any));
    expect(d.coPassengers).toEqual(['B', 'C', 'D']);
  });

  it('RIDE CAR_7 tối đa 6 khách (5 đi cùng)', () => {
    const d = bookingToDraft(base({
      serviceType: 'RIDE',
      requestedVehicleType: 'CAR_7',
      passengerNames: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    } as any));
    expect(d.coPassengers).toEqual(['B', 'C', 'D', 'E', 'F']);
  });

  it('CARPOOL tối đa 6 khách (5 đi cùng)', () => {
    const d = bookingToDraft(base({
      serviceType: 'CARPOOL',
      passengerNames: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    } as any));
    expect(d.coPassengers).toEqual(['B', 'C', 'D', 'E', 'F']);
  });
});

describe('bookingToDraft — ghi chú: bỏ tiền tố backend tự thêm', () => {
  it('bỏ "[Admin] " để không cộng dồn qua mỗi đời nhân bản', () => {
    expect(bookingToDraft(base({ note: '[Admin] Khách VIP' })).note).toBe('Khách VIP');
  });

  it('bỏ "[Đặt hộ] "', () => {
    expect(bookingToDraft(base({ note: '[Đặt hộ] Giao hàng dễ vỡ' })).note).toBe('Giao hàng dễ vỡ');
  });

  it('bỏ tiền tố cộng dồn từ dữ liệu cũ', () => {
    expect(bookingToDraft(base({ note: '[Admin] [Admin] Khách VIP' })).note).toBe('Khách VIP');
  });

  it('note chỉ có tiền tố mặc định → rỗng', () => {
    expect(bookingToDraft(base({ note: '[Admin] Tạo bởi admin' })).note).toBe('');
    expect(bookingToDraft(base({ note: '[Đặt hộ] Tạo bởi đại lý' })).note).toBe('');
  });

  it('không đụng ghi chú của khách tự đặt', () => {
    expect(bookingToDraft(base({ note: 'Đón ở cổng B [Admin]' })).note).toBe('Đón ở cổng B [Admin]');
  });
});

describe('bookingToDraft — giờ đón', () => {
  it('chuyến đi ngay → không bật hẹn giờ', () => {
    const d = bookingToDraft(base());
    expect(d.isScheduled).toBe(false);
    expect(d.scheduledFrom).toBe('');
    expect(d.scheduledTo).toBe('');
  });

  it('có khung giờ [from, to] → chép cả hai, đúng instant', () => {
    const from = '2026-07-20T01:30:00.000Z';
    const to = '2026-07-20T02:00:00.000Z';
    const d = bookingToDraft(base({ scheduledFromTime: from, scheduledToTime: to }));
    expect(d.isScheduled).toBe(true);
    // Chuỗi datetime-local là giờ máy — so lại bằng instant để test không phụ thuộc TZ.
    expect(new Date(d.scheduledFrom).getTime()).toBe(new Date(from).getTime());
    expect(new Date(d.scheduledTo).getTime()).toBe(new Date(to).getTime());
  });

  it('chỉ có scheduledTime (chuyến cũ, không có khung) → to = from + 30 phút', () => {
    const t = '2026-07-20T01:30:00.000Z';
    const d = bookingToDraft(base({ scheduledTime: t }));
    expect(d.isScheduled).toBe(true);
    expect(new Date(d.scheduledFrom).getTime()).toBe(new Date(t).getTime());
    expect(new Date(d.scheduledTo).getTime()).toBe(new Date(t).getTime() + 30 * 60_000);
  });

  it('scheduledToTime <= from (dữ liệu hỏng) → to = from + 30 phút', () => {
    const from = '2026-07-20T01:30:00.000Z';
    const d = bookingToDraft(base({ scheduledFromTime: from, scheduledToTime: from }));
    expect(new Date(d.scheduledTo).getTime()).toBe(new Date(from).getTime() + 30 * 60_000);
  });

  it('timestamp không parse được → coi như đi ngay', () => {
    const d = bookingToDraft(base({ scheduledFromTime: 'không-phải-ngày' }));
    expect(d.isScheduled).toBe(false);
    expect(d.scheduledFrom).toBe('');
  });
});

describe('bookingToDraft — ghi chú, voucher, nguồn', () => {
  it('chép ghi chú, null → chuỗi rỗng', () => {
    expect(bookingToDraft(base({ note: 'Khách VIP' })).note).toBe('Khách VIP');
    expect(bookingToDraft(base({ note: null })).note).toBe('');
  });

  it('chép promotionId, thiếu → null', () => {
    expect(bookingToDraft(base({ promotionId: 7 } as any)).promotionId).toBe(7);
    expect(bookingToDraft(base()).promotionId).toBeNull();
  });

  it('giữ id chuyến gốc để hiển thị "Từ chuyến #..."', () => {
    expect(bookingToDraft(base()).sourceBookingId).toBe('b1e2c3d4-0000-0000-0000-000000000001');
  });

  it('KHÔNG chép tài xế', () => {
    const d = bookingToDraft(base({ driverId: 'd1' })) as any;
    expect(d.driverId).toBeUndefined();
  });
});
