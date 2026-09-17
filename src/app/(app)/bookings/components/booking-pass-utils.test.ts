import { describe, it, expect } from 'vitest';
import { buildTripPassText } from './booking-pass-utils';
import type { Booking } from '@/lib/types';

describe('buildTripPassText', () => {
  it('tạo đầy đủ thông tin chuyến có hẹn giờ, tuyến đường, khoảng cách, xe, giá và bảo mật thông tin khách', () => {
    const booking: Booking = {
      id: 'BK123456',
      customerId: 'cust1',
      status: 'SEARCHING',
      pickupAddress: '2 Khu Đấu Giá Ngô Thì Nhậm, Yên Nghĩa, Hà Đông, Hà Nội',
      dropoffAddress: 'Đường Thân Cảnh Phúc, Việt Yên, Bắc Ninh',
      distanceKm: 56.2,
      price: 200000,
      finalPrice: 200000,
      requestedSeats: 2,
      requestedVehicleType: 'CAR_4',
      serviceType: 'RIDE',
      scheduledFromTime: '2026-08-26T04:00:00.000Z', // 11:00 UTC+7
      scheduledToTime: '2026-08-26T07:00:00.000Z',   // 14:00 UTC+7
      route: { id: 1, name: 'Hà Nội - Bắc Giang' },
      customer: {
        id: 'cust1',
        fullName: 'Ngô thị Bích Ngọc',
        phone: '0344509422',
      },
      companionPhone: '0988776655',
      note: 'Có 1 vali to',
      createdAt: '2026-08-26T01:00:00.000Z',
    };

    const text = buildTripPassText(booking);

    expect(text).toContain('🚕 CHƯA CÓ TÀI XẾ');
    expect(text).not.toContain('Mã: #BK123456');
    expect(text).toContain('⏰ Thời gian: 11:00 → 14:00 — 26/08/2026');
    expect(text).toContain('📍 Điểm đón: 2 Khu Đấu Giá Ngô Thì Nhậm, Yên Nghĩa, Hà Đông, Hà Nội');
    expect(text).toContain('📍 Điểm trả: Đường Thân Cảnh Phúc, Việt Yên, Bắc Ninh');
    expect(text).toContain('🛣 Tuyến đường: Hà Nội - Bắc Giang (56.2 km)');
    expect(text).toContain('🚗 Loại xe: Xe 4 chỗ (Bao xe)');
    expect(text).toContain('👥 Số khách: 2 người');
    expect(text).toContain('💰 Cước phí: 200.000');
    expect(text).toContain('📝 Ghi chú: Có 1 vali to');

    // Không để lộ SĐT và tên khách hàng hoặc SĐT người đi cùng
    expect(text).not.toContain('0344509422');
    expect(text).not.toContain('0988776655');
    expect(text).not.toContain('Ngô thị Bích Ngọc');
    expect(text).not.toContain('Khách hàng:');
    expect(text).not.toContain('Người đi cùng:');
  });

  it('xử lý chuyến đi ngay (không hẹn giờ)', () => {
    const booking: Booking = {
      id: 'BK999',
      customerId: 'cust2',
      status: 'PROCESSING',
      pickupAddress: { address: 'Bến xe Mỹ Đình', lat: 21.0, lng: 105.0 },
      dropoffAddress: { address: 'Sân bay Nội Bài', lat: 21.2, lng: 105.8 },
      distanceKm: 25,
      price: 150000,
      requestedVehicleType: 'CAR_7',
      customer: {
        id: 'cust2',
        fullName: 'Trần Văn A',
        phone: '0912345678',
      },
      createdAt: '2026-08-26T01:00:00.000Z',
    };

    const text = buildTripPassText(booking);

    expect(text).toContain('⏰ Thời gian: Đi ngay');
    expect(text).toContain('📍 Điểm đón: Bến xe Mỹ Đình');
    expect(text).toContain('📍 Điểm trả: Sân bay Nội Bài');
    expect(text).toContain('📏 Khoảng cách: 25.0 km');
    expect(text).toContain('🚗 Loại xe: Xe 7 chỗ');
    expect(text).toContain('👥 Số khách: 1 người');
    expect(text).toContain('💰 Cước phí: 150.000');
    expect(text).not.toContain('0912345678');
    expect(text).not.toContain('Trần Văn A');
  });
});
