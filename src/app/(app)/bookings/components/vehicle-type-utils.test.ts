import { describe, it, expect } from 'vitest';
import { isVehicleTypeApplicable, resolveRequestedVehicleType } from './vehicle-type-utils';

describe('isVehicleTypeApplicable', () => {
  it('trả về true khi RIDE', () => {
    expect(isVehicleTypeApplicable('RIDE')).toBe(true);
  });

  it('trả về true khi CARPOOL', () => {
    expect(isVehicleTypeApplicable('CARPOOL')).toBe(true);
  });

  it('trả về false khi DELIVERY', () => {
    expect(isVehicleTypeApplicable('DELIVERY')).toBe(false);
  });
});

describe('resolveRequestedVehicleType', () => {
  it('trả về vehicleType khi RIDE', () => {
    expect(resolveRequestedVehicleType('RIDE', 'CAR_4')).toBe('CAR_4');
    expect(resolveRequestedVehicleType('RIDE', 'CAR_7')).toBe('CAR_7');
  });

  it('trả về vehicleType khi CARPOOL (fix chính của task này)', () => {
    expect(resolveRequestedVehicleType('CARPOOL', 'CAR_4')).toBe('CAR_4');
    expect(resolveRequestedVehicleType('CARPOOL', 'CAR_7')).toBe('CAR_7');
  });

  it('trả về undefined khi DELIVERY (không đổi hành vi cũ)', () => {
    expect(resolveRequestedVehicleType('DELIVERY', 'CAR_4')).toBeUndefined();
  });
});
