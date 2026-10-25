import { describe, it, expect } from 'vitest';
import {
  WARD_SEARCH_MAX_RESULTS,
  buildSearchIndex,
  pendingQuickSearch,
  searchTargets,
} from './ward-search';
import type { ProvinceOption, SpecialZone, WardOption } from './types';

/**
 * Fixture trích từ dữ liệu THẬT (34 tỉnh / 3.321 xã sau sáp nhập 2025) — chọn đúng các kiểu va chạm đã làm bản đầu
 * chọn nhầm khi quét cả bộ: xã trùng tên ở nhiều tỉnh, tên chỉ khác dấu («Thanh Xuân»/«Thạnh Xuân»), xã trùng tên tỉnh
 * («Lào Cai»), xã trùng tên sân bay («Nội Bài»), tỉnh có từ ngắn («Hà Nội»), tên có dấu nháy, tên bắt đầu bằng «Tĩnh».
 */
const PROVINCES: ProvinceOption[] = [
  { code: '01', name: 'Hà Nội' },
  { code: '04', name: 'Cao Bằng' },
  { code: '08', name: 'Tuyên Quang' },
  { code: '11', name: 'Điện Biên' },
  { code: '15', name: 'Lào Cai' },
  { code: '19', name: 'Thái Nguyên' },
  { code: '20', name: 'Lạng Sơn' },
  { code: '22', name: 'Quảng Ninh' },
  { code: '25', name: 'Phú Thọ' },
  { code: '33', name: 'Hưng Yên' },
  { code: '38', name: 'Thanh Hóa' },
  { code: '40', name: 'Nghệ An' },
  { code: '44', name: 'Quảng Trị' },
  { code: '48', name: 'Đà Nẵng' },
  { code: '51', name: 'Quảng Ngãi' },
  { code: '64', name: 'Gia Lai' },
  { code: '66', name: 'Đắk Lắk' },
  { code: '68', name: 'Lâm Đồng' },
  { code: '79', name: 'Hồ Chí Minh' },
  { code: '92', name: 'Cần Thơ' },
  { code: '31', name: 'Hải Phòng' },
  { code: '46', name: 'Huế' },
  { code: '86', name: 'Vĩnh Long' },
];

let seq = 0;
const w = (provinceCode: string, name: string): WardOption => ({ code: `${provinceCode}${String(++seq).padStart(4, '0')}`, name, provinceCode });

const WARDS: WardOption[] = [
  // Hà Nội
  w('01', 'Thanh Xuân'), w('01', 'Hà Đông'), w('01', 'Nghĩa Đô'), w('01', 'Cầu Giấy'), w('01', 'Hoàn Kiếm'),
  w('01', 'Láng'), w('01', 'Nội Bài'), w('01', 'Đông Anh'), w('01', 'Phú Bình'), w('01', 'Hòa Bình'), w('01', 'Hóa Bình'),
  w('01', 'Hoàn Kiếm Bắc'), // đối chứng: «hoankiem» phải thắng nguyên tên «Hoàn Kiếm» chứ không hoà với tên dài hơn
  // Cần Thơ / Hồ Chí Minh (tên chỉ khác dấu so với Hà Nội, hoặc trùng tên)
  w('92', 'Thạnh Xuân'), w('92', 'Tân Bình'), w('92', 'Khánh Hòa'), w('92', 'Thạnh An'),
  w('79', 'Tân Bình'), w('79', 'Bến Thành'), w('79', 'Tân Sơn Nhất'), w('79', 'Sài Gòn'), w('79', 'Minh Thạnh'), w('79', 'Thanh An'),
  // Thái Nguyên
  w('19', 'Phú Bình'), w('19', 'Văn Lang'), w('19', 'Văn Lăng'), w('19', 'Đại Từ'), w('19', 'Đại Phúc'), w('19', 'Phú Lương'),
  w('19', 'Điềm Thuỵ'),
  // Lào Cai / Tuyên Quang / Cao Bằng / Lạng Sơn
  w('15', 'Lào Cai'), w('15', 'Khánh Hòa'), w('15', 'Si Ma Cai'), w('15', 'Mường Lai'),
  w('08', 'Bắc Quang'), w('08', 'Minh Thanh'), w('08', 'Bạch Xa'), w('08', 'Bắc Mê'),
  // Tên thật BẮT ĐẦU bằng một tiền tố hành chính («Xà» ≈ «xã»): không được bị coi là «xã …» rồi cắt chữ đầu
  w('08', 'Xà Phìn'), w('11', 'Phìn Hồ'),
  w('04', 'Tĩnh Túc'),
  w('20', 'Tân Thanh'),
  // Hưng Yên: xã trùng tên tỉnh + xã «Túc Trưng» (mồi nếu lỡ cắt chữ «Tĩnh»)
  w('33', 'Hưng Yên'), w('33', 'Túc Trưng'),
  // Thanh Hóa / Quảng Ngãi / Điện Biên
  w('38', 'Tĩnh Gia'), w('38', 'Đồng Tiến'), w('38', 'Đông Tiến'),
  w('51', 'Ba Tơ'), w('51', 'Ba Tô'),
  w('11', 'Mường Lay'),
  // Tên có dấu nháy / gạch nối, nối liền
  w('66', "Ea H'leo"), w('66', "Cư M'gar"),
  w('68', 'Cam Ly - Đà Lạt'), w('68', 'Lâm Viên - Đà Lạt'),
  w('64', 'Quy Nhơn'), w('64', 'Quy Nhơn Bắc'),
  // Đà Nẵng / Nghệ An cùng có «Hải Châu»
  w('48', 'Hải Châu'), w('48', 'Thanh Khê'), w('40', 'Hải Châu'),
  // Xã trùng tên tỉnh
  w('25', 'Phú Thọ'), w('44', 'Quảng Trị'),
  w('22', 'Móng Cái 1'),
  // «P. Hồng Hà» viết liền thành "phongha" = «Phong Hà»: chữ «P.» phải được hiểu là tiền tố phường, không dính vào tên
  w('01', 'Hồng Hà'), w('15', 'Phong Hà'),
];

const ZONES: SpecialZone[] = [
  { code: 'NOIBAI', name: 'Sân bay Nội Bài', provinceCode: '01', provinceName: 'Hà Nội', kind: 'AIRPORT', active: true },
  { code: 'TSN', name: 'Sân bay Tân Sơn Nhất', provinceCode: '79', provinceName: 'Hồ Chí Minh', kind: 'AIRPORT', active: true },
];

const INDEX = buildSearchIndex({ provinces: PROVINCES, wards: WARDS, zones: ZONES });
const label = (t: { title: string; subtitle: string }) => (t.subtitle ? `${t.title} · ${t.subtitle}` : t.title);
const search = (q: string) => searchTargets(INDEX, q);
const top = (q: string) => search(q).results.map(label);

describe('buildSearchIndex', () => {
  it('mỗi tỉnh một mục «Cả tỉnh», mỗi xã một mục, mỗi điểm đặc biệt một mục', () => {
    const byKind = (k: string) => INDEX.filter((t) => t.kind === k).length;
    expect(byKind('province')).toBe(PROVINCES.length);
    expect(byKind('ward')).toBe(WARDS.length);
    expect(byKind('zone')).toBe(ZONES.length);
  });

  it('điểm đón/trả sinh ra cùng dạng với ô chọn theo tỉnh (nhãn, mã tỉnh, mã xã)', () => {
    const ward = INDEX.find((t) => t.kind === 'ward' && t.title === 'Đại Từ')!;
    expect(ward.endpoint).toEqual({ provinceCode: '19', wardCode: ward.endpoint.wardCode, label: 'Đại Từ (Thái Nguyên)' });
    expect(ward.subtitle).toBe('Thái Nguyên');

    const prov = INDEX.find((t) => t.key === 'province|19')!;
    expect(prov.endpoint).toEqual({ provinceCode: '19', label: 'Cả tỉnh Thái Nguyên' });
    expect('wardCode' in prov.endpoint).toBe(false);

    const zone = INDEX.find((t) => t.key === 'zone|NOIBAI')!;
    expect(zone.endpoint).toEqual({ provinceCode: '01', wardCode: 'ZONE:NOIBAI', label: 'Sân bay Nội Bài (điểm đặc biệt)' });
    expect(zone.subtitle).toBe('Hà Nội · điểm đặc biệt');
  });

  it('khoá mỗi mục là duy nhất (dùng làm key React)', () => {
    const keys = INDEX.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('mã tỉnh không có trong danh sách tỉnh: nhãn dùng mã chứ không in "undefined"', () => {
    const idx = buildSearchIndex({ provinces: [], wards: [{ code: '1', name: 'Lạ', provinceCode: '99' }], zones: [] });
    expect(idx[0].endpoint.label).toBe('Lạ (99)');
    expect(idx[0].subtitle).toBe('99');
  });

  it('dòng dữ liệu hỏng (thiếu tên/mã/mã tỉnh, null) bị bỏ qua, KHÔNG ném và không làm mất dòng tốt', () => {
    const bad = [
      null,
      undefined,
      { code: '1', name: undefined, provinceCode: '19' },
      { code: '2', name: '   ', provinceCode: '19' },
      { code: undefined, name: 'Thiếu mã', provinceCode: '19' },
      { code: '3', name: 'Thiếu tỉnh', provinceCode: undefined },
      { code: '19001', name: 'Đại Từ', provinceCode: '19' },
    ] as unknown as WardOption[];
    const idx = buildSearchIndex({
      provinces: [{ code: '19', name: 'Thái Nguyên' }, { code: '20', name: undefined }, null] as unknown as ProvinceOption[],
      wards: bad,
      zones: [{ code: 'Z', name: undefined, provinceCode: '19' }, null] as unknown as SpecialZone[],
    });
    expect(idx.map((t) => t.key)).toEqual(['province|19', 'ward|19|19001']);
  });

  it('danh sách xã chưa nạp (rỗng) vẫn tìm được tỉnh và điểm đặc biệt', () => {
    const idx = buildSearchIndex({ provinces: PROVINCES, wards: [], zones: ZONES });
    expect(searchTargets(idx, 'san bay noi bai').results.map((r) => r.kind)).toEqual(['zone']);
    expect(searchTargets(idx, 'thai nguyen').results[0].kind).toBe('province');
  });

  it('tên tỉnh có tiền tố «Thành phố»/«Tỉnh» (nguồn khác) vẫn tìm được bằng tên trần', () => {
    const idx = buildSearchIndex({ provinces: [{ code: '31', name: 'Thành phố Hải Phòng' }, { code: '19', name: 'Tỉnh Thái Nguyên' }], wards: [], zones: [] });
    expect(searchTargets(idx, 'hai phong').results[0].title).toBe('Cả tỉnh Thành phố Hải Phòng');
    expect(searchTargets(idx, 'thai nguyen').confident).toBe(true);
  });
});

describe('searchTargets — tự chọn CHỈ khi thắng rõ (confident)', () => {
  it('nguyên tên duy nhất: "dai tu", "Đại Từ", "ĐẠI TỪ" đều ra Đại Từ và tự chọn được', () => {
    for (const q of ['dai tu', 'Đại Từ', 'ĐẠI TỪ', '  dai   tu  ']) {
      const r = search(q);
      expect(r.results.map(label)).toEqual(['Đại Từ · Thái Nguyên']);
      expect(r.confident).toBe(true);
    }
  });

  it('cùng tên ở hai tỉnh («Phú Bình»): hiện cả hai, KHÔNG tự chọn, báo cùng tên', () => {
    const r = search('phu binh');
    expect(r.results.map(label)).toEqual(['Phú Bình · Hà Nội', 'Phú Bình · Thái Nguyên']);
    expect(r.confident).toBe(false);
    expect(r.tied).toBe(2);
    expect(r.tiedSameName).toBe(true);
  });

  it('thêm tên tỉnh thì hết mơ hồ và tự chọn được: "phu binh thai nguyen", đảo thứ tự, có dấu phẩy', () => {
    for (const q of ['phu binh thai nguyen', 'thai nguyen phu binh', 'Phú Bình, Thái Nguyên', 'Phú Bình (Thái Nguyên)', 'phường Phú Bình Thái Nguyên']) {
      const r = search(q);
      expect(r.results[0] && label(r.results[0])).toBe('Phú Bình · Thái Nguyên');
      expect(r.confident).toBe(true);
    }
  });

  it('tên chỉ khác DẤU: gõ có dấu thì tự chọn đúng xã, gõ không dấu thì hoà và KHÔNG tự chọn', () => {
    const accented = search('Thanh Xuân');
    expect(accented.results.slice(0, 2).map(label)).toEqual(['Thanh Xuân · Hà Nội', 'Thạnh Xuân · Cần Thơ']);
    expect(accented.confident).toBe(true);

    const plain = search('thanh xuan');
    expect(plain.results.slice(0, 2).map(label).sort()).toEqual(['Thanh Xuân · Hà Nội', 'Thạnh Xuân · Cần Thơ']);
    expect(plain.confident).toBe(false);
    expect(plain.tied).toBe(2);
  });

  it('cặp khác một dấu ở CÙNG tỉnh: «Ba Tơ» ≠ «Ba Tô» (có dấu tự chọn đúng; không dấu hoà)', () => {
    expect(top('Ba Tơ')[0]).toBe('Ba Tơ · Quảng Ngãi');
    expect(search('Ba Tơ').confident).toBe(true);
    expect(top('Ba Tô')[0]).toBe('Ba Tô · Quảng Ngãi');
    expect(search('Ba Tô').confident).toBe(true);
    expect(search('ba to').confident).toBe(false);
  });

  it('chỉ khác y/i (Mường Lai ≠ Mường Lay): không dấu thanh để phân biệt ⇒ hoà, KHÔNG tự chọn', () => {
    const r = search('Mường Lai');
    expect(r.results.map(label)).toEqual(expect.arrayContaining(['Mường Lai · Lào Cai', 'Mường Lay · Điện Biên']));
    expect(r.confident).toBe(false);
  });

  it('gõ khác kiểu đặt dấu thanh vẫn là một: «Điềm Thụy» = «Điềm Thuỵ», «Hoà Bình» = «Hòa Bình»', () => {
    expect(top('Điềm Thụy')[0]).toBe('Điềm Thuỵ · Thái Nguyên');
    expect(search('Điềm Thụy').confident).toBe(true);
    expect(search('Điềm Thuỵ').confident).toBe(true);
    // «Hóa Bình» (dấu sắc) là xã KHÁC: gõ «Hoà»/«Hòa» (dấu huyền, chỗ đặt khác nhau) phải ra «Hòa Bình», chọn được.
    expect(top('Hoà Bình')[0]).toBe('Hòa Bình · Hà Nội');
    expect(search('Hoà Bình').confident).toBe(true);
    expect(search('Hòa Bình').confident).toBe(true);
    expect(top('Hóa Bình')[0]).toBe('Hóa Bình · Hà Nội');
  });

  it('xã trùng tên TỈNH («Lào Cai», «Phú Thọ»): hoà, KHÔNG tự chọn (kẻo nới thành cả tỉnh)', () => {
    for (const q of ['Lào Cai', 'lao cai', 'Phú Thọ', 'Quảng Trị']) {
      const r = search(q);
      expect(r.results.slice(0, 2).map((x) => x.kind).sort()).toEqual(['province', 'ward']);
      expect(r.confident).toBe(false);
    }
  });

  it('xã trùng tên SÂN BAY («Nội Bài»): sân bay đứng trước xã khi hoà, KHÔNG tự chọn; gõ «sân bay …» thì chọn được sân bay', () => {
    const r = search('noi bai');
    expect(r.results.slice(0, 2).map((x) => x.kind)).toEqual(['zone', 'ward']);
    expect(r.confident).toBe(false);
    for (const q of ['san bay noi bai', 'Sân bay Nội Bài']) {
      const z = search(q);
      expect(z.results.map((x) => x.kind)).toEqual(['zone']);
      expect(z.confident).toBe(true);
    }
    expect(search('tan son nhat').results.slice(0, 2).map((x) => x.kind)).toEqual(['zone', 'ward']);
  });

  it('chỉ có MỘT kết quả nhưng yếu thì KHÔNG tự chọn ("quan 1" chỉ ra «Móng Cái 1» vì "quan" là đầu từ của «Quảng Ninh»)', () => {
    const r = search('quan 1');
    expect(r.results.map(label)).toEqual(['Móng Cái 1 · Quảng Ninh']);
    expect(r.confident).toBe(false);
  });

  it('mới gõ đầu từ ("phu", "noi", "ha") cho nhiều kết quả cùng hạng: KHÔNG tự chọn', () => {
    for (const q of ['phu', 'noi', 'ha']) expect(search(q).confident).toBe(false);
  });

  it('nguyên tên thắng đầu tên: «Láng» (xã) đứng trên «Cả tỉnh Lạng Sơn» khi gõ "lang"/"Láng" — không nới sang cả tỉnh khác', () => {
    for (const q of ['lang', 'Láng']) {
      const r = search(q);
      expect(label(r.results[0])).toBe('Láng · Hà Nội');
      expect(r.confident).toBe(true);
    }
    expect(search('lang').results.map(label)).toContain('Cả tỉnh Lạng Sơn');
  });

  it('tên tỉnh một mình ra «Cả tỉnh» và tự chọn được, KHÔNG kéo xã của tỉnh đó vào', () => {
    const r = search('thai nguyen');
    expect(r.results.map(label)).toEqual(['Cả tỉnh Thái Nguyên']);
    expect(r.confident).toBe(true);
    expect(search('ha noi').results[0].title).toBe('Cả tỉnh Hà Nội');
    expect(search('ha noi').results.map((x) => x.title)).not.toContain('Cầu Giấy');
  });
});

describe('searchTargets — khớp đầu từ, thứ tự và chính tả', () => {
  it('khớp đầu từ chứ không khớp giữa từ: "ha" KHÔNG ra Thanh Xuân/Thanh Khê', () => {
    const t = search('ha').results.map((r) => r.title);
    expect(t).toContain('Hà Đông');
    expect(t).toContain('Hải Châu');
    expect(t).not.toContain('Thanh Xuân');
    expect(t).not.toContain('Thanh Khê');
  });

  it('gõ dở từ cuối vẫn khớp: "dai t" ra Đại Từ, không ra Đại Phúc', () => {
    expect(top('dai t')).toEqual(['Đại Từ · Thái Nguyên']);
  });

  it('thứ tự từ không quan trọng với tên: "tu dai" vẫn ra Đại Từ (nhưng không tự chọn)', () => {
    const r = search('tu dai');
    expect(top('tu dai')).toContain('Đại Từ · Thái Nguyên');
    expect(r.confident).toBe(false);
  });

  it('xếp hạng: nguyên tên > đầu tên > đầu từ trong tên', () => {
    const t = search('phu').results.map(label);
    // «Phú Bình», «Phú Lương», «Phú Thượng»… bắt đầu bằng "phu" ⇒ trước «Đại Phúc» (chỉ từ thứ hai bắt đầu bằng "phu")
    expect(t.indexOf('Đại Phúc · Thái Nguyên')).toBeGreaterThan(t.indexOf('Phú Lương · Thái Nguyên'));
    expect(t.indexOf('Đại Phúc · Thái Nguyên')).toBeGreaterThan(t.indexOf('Phú Bình · Hà Nội'));
  });

  it('chính tả đúng như đã gõ lên trước khi hoà: «Minh Thanh» (không dấu) đứng trên «Minh Thạnh» nhưng vẫn KHÔNG tự chọn', () => {
    const r = search('Minh Thanh');
    expect(r.results.slice(0, 2).map(label)).toEqual(['Minh Thanh · Tuyên Quang', 'Minh Thạnh · Hồ Chí Minh']);
    expect(r.confident).toBe(false);
  });

  it('xã ở hai tỉnh cùng tên + dấu: «Văn Lang» ≠ «Văn Lăng» (cùng tỉnh) — gõ đúng dấu thì tự chọn đúng xã', () => {
    expect(top('Văn Lang')[0]).toBe('Văn Lang · Thái Nguyên');
    expect(search('Văn Lang').confident).toBe(true);
    expect(top('Văn Lăng')[0]).toBe('Văn Lăng · Thái Nguyên');
    expect(search('van lang').confident).toBe(false);
  });

  it('tên có dấu nháy: gõ có hoặc không nháy hoặc viết liền đều ra «Ea H\'leo»', () => {
    for (const q of ["ea h'leo", 'ea h leo', 'ea hleo', 'eahleo']) {
      expect(top(q)).toEqual(["Ea H'leo · Đắk Lắk"]);
    }
    expect(top('cu mgar')).toEqual(["Cư M'gar · Đắk Lắk"]);
    // đảo thứ tự từ: chỉ khớp được nhờ từ nối «hleo»/«mgar» (khớp liền toàn tên không giúp được)
    expect(top('hleo ea')).toEqual(["Ea H'leo · Đắk Lắk"]);
    expect(top('mgar cu')).toEqual(["Cư M'gar · Đắk Lắk"]);
  });

  it('gõ liền ("dalat", "hoankiem", "daklak") và y/i ("qui nhon") vẫn ra đúng', () => {
    expect(search('dalat').results.map((r) => r.title)).toEqual(['Cam Ly - Đà Lạt', 'Lâm Viên - Đà Lạt']);
    // gõ liền khớp NGUYÊN tên nên thắng tên dài hơn «Hoàn Kiếm Bắc» và tự chọn được
    const hk = search('hoankiem');
    expect(hk.results.map(label)).toEqual(['Hoàn Kiếm · Hà Nội', 'Hoàn Kiếm Bắc · Hà Nội']);
    expect(hk.confident).toBe(true);
    expect(top('daklak')).toEqual(['Cả tỉnh Đắk Lắk']);
    expect(top('qui nhon')[0]).toBe('Quy Nhơn · Gia Lai');
    expect(search('qui nhon').confident).toBe(true);
  });

  it('ký tự lạ dán từ văn bản cũ: Eth (U+00D0) coi như Đ; soft hyphen/zero-width bị bỏ', () => {
    // Viết bằng mã số: ký tự vô hình/lạ viết thẳng vào mã nguồn rất dễ bị công cụ làm mất.
    const ETH = String.fromCharCode(0x00d0);
    const SOFT_HYPHEN = String.fromCharCode(0x00ad);
    const ZWSP = String.fromCharCode(0x200b);
    expect(top(`${ETH}ại Từ`)).toEqual(['Đại Từ · Thái Nguyên']);
    expect(top(`d${SOFT_HYPHEN}ai${ZWSP} tu`)).toEqual(['Đại Từ · Thái Nguyên']);
    // Đảo thứ tự từ để KHÔNG thể khớp nhờ ghép liền: ký tự vô hình giữa từ phải thật sự được bỏ, kẻo tách "dai" thành "d"+"ai".
    expect(top(`tu d${ZWSP}ai`)).toContain('Đại Từ · Thái Nguyên');
  });
});

describe('searchTargets — thu hẹp bằng tên tỉnh', () => {
  it('tỉnh có từ ≤2 ký tự (Hà Nội, Đà Nẵng, Hồ Chí Minh): "cau giay ha noi", "hai chau da nang", "ben thanh ho chi minh"', () => {
    for (const [q, want] of [
      ['cau giay ha noi', 'Cầu Giấy · Hà Nội'],
      ['Cầu Giấy, Hà Nội', 'Cầu Giấy · Hà Nội'],
      ['ha noi cau giay', 'Cầu Giấy · Hà Nội'],
      ['hai chau da nang', 'Hải Châu · Đà Nẵng'],
      ['hai chau nghe an', 'Hải Châu · Nghệ An'],
      ['ben thanh ho chi minh', 'Bến Thành · Hồ Chí Minh'],
      ['tan binh ho chi minh', 'Tân Bình · Hồ Chí Minh'],
      ['tan binh can tho', 'Tân Bình · Cần Thơ'],
    ] as const) {
      const r = search(q);
      expect(r.results[0] && label(r.results[0])).toBe(want);
      expect(r.confident).toBe(true);
    }
  });

  it('cụm tên tỉnh đang gõ dở vẫn thu hẹp từ 2 ký tự ("cau giay ha" → Hà Nội), 1 ký tự thì chưa ("cau giay h" không ra gì)', () => {
    expect(top('cau giay ha')).toEqual(['Cầu Giấy · Hà Nội']);
    expect(search('cau giay h').total).toBe(0);
  });

  it('chỉ nhận CỤM bắt đầu từ chữ đầu của tên tỉnh: "quan" không thu hẹp được sang Quảng Ninh/Quảng Trị…', () => {
    expect(top('quan 1')).not.toContain('Cả tỉnh Quảng Ninh');
    // "nguyen" là từ SAU của «Thái Nguyên» ⇒ không dùng để thu hẹp xã «Phú Bình»
    expect(search('phu binh nguyen').total).toBe(0);
  });

  it('xã không thuộc tỉnh đã gõ thì KHÔNG ra (không "gần đúng")', () => {
    expect(search('phu binh ha tinh').total).toBe(0);
    expect(search('cau giay thai nguyen').total).toBe(0);
  });

  it('viết tắt tỉnh: hn, hcm, tphcm, sg, hp (khớp NGUYÊN, "tp" một mình không ra Hồ Chí Minh)', () => {
    for (const [q, want] of [['hn', 'Cả tỉnh Hà Nội'], ['hcm', 'Cả tỉnh Hồ Chí Minh'], ['tphcm', 'Cả tỉnh Hồ Chí Minh'], ['TP. HCM', 'Cả tỉnh Hồ Chí Minh'], ['sg', 'Cả tỉnh Hồ Chí Minh'], ['hp', 'Cả tỉnh Hải Phòng']] as const) {
      expect(top(q)[0]).toBe(want);
    }
    expect(search('tp').total).toBe(0);
    expect(search('hc').results.map((r) => r.title)).not.toContain('Cả tỉnh Hồ Chí Minh');
    // viết tắt dùng được cả để thu hẹp xã: "cau giay hn"
    expect(top('cau giay hn')[0]).toBe('Cầu Giấy · Hà Nội');
  });

  it('«dn» (Đà Nẵng hay Đồng Nai?) và «ct» (Cần Thơ hay công ty?) cố ý KHÔNG là viết tắt: không ra tỉnh nào', () => {
    for (const q of ['dn', 'ct']) {
      expect(search(q).results.filter((r) => r.kind === 'province')).toEqual([]);
      expect(search(q).confident).toBe(false);
    }
  });
});

describe('searchTargets — tiền tố hành chính là BỘ LỌC LOẠI', () => {
  it('«xã/phường …» chỉ lấy xã (không bao giờ ra «Cả tỉnh»): "xa dai tu", "phường Lào Cai", "p. hoan kiem", "tt dong anh"', () => {
    expect(top('xa dai tu')).toEqual(['Đại Từ · Thái Nguyên']);
    expect(top('xã Đại Từ')).toEqual(['Đại Từ · Thái Nguyên']);
    const lc = search('phường Lào Cai');
    expect(lc.results.map((r) => r.kind)).not.toContain('province');
    expect(label(lc.results[0])).toBe('Lào Cai · Lào Cai');
    expect(lc.confident).toBe(true);
    expect(top('p. hoan kiem')[0]).toBe('Hoàn Kiếm · Hà Nội');
    expect(search('p. hoan kiem').confident).toBe(true);
    expect(top('tt dong anh')[0]).toBe('Đông Anh · Hà Nội');
  });

  it('«xã Khánh Hòa» (hai xã ở hai tỉnh): hiện cả hai, không lẫn «Cả tỉnh», KHÔNG tự chọn', () => {
    const r = search('xã Khánh Hòa');
    expect(r.results.map((x) => x.kind)).toEqual(['ward', 'ward']);
    expect(r.confident).toBe(false);
    expect(r.tiedSameName).toBe(true);
  });

  it('«tỉnh/thành phố/tp …» chỉ lấy tỉnh: "tỉnh Thanh Hóa" KHÔNG ra «Tĩnh Gia», "thanh pho ha noi", "tp hcm", "tp Phú Thọ"', () => {
    expect(top('tỉnh Thanh Hóa')).toEqual(['Cả tỉnh Thanh Hóa']);
    expect(top('thành phố Hà Nội')).toEqual(['Cả tỉnh Hà Nội']);
    expect(top('tp hcm')).toEqual(['Cả tỉnh Hồ Chí Minh']);
    expect(top('cả tỉnh Lào Cai')).toEqual(['Cả tỉnh Lào Cai']);
    // «tp/thành phố» + 6 thành phố trực thuộc trung ương = cả tỉnh, chọn được; «tỉnh X» cũng vậy.
    for (const q of ['thành phố Hà Nội', 'tp hcm', 'TP. Huế', 'thanh pho hai phong', 'tỉnh Thanh Hóa', 'cả tỉnh Lào Cai']) {
      expect(search(q).confident, q).toBe(true);
    }
    // «Phú Thọ» vừa là tỉnh vừa là xã: có «tp» thì chỉ ra tỉnh (không lẫn xã), nhưng KHÔNG tự chọn — "thành phố Phú Thọ"
    // là thành phố CŨ (nay chỉ là vài phường), không phải cả tỉnh Phú Thọ.
    const r = search('tp Phú Thọ');
    expect(r.results.map(label)).toEqual(['Cả tỉnh Phú Thọ']);
    expect(r.confident).toBe(false);
    expect(search('thành phố Thanh Hóa').confident).toBe(false);
  });

  it('«tp Vinh» KHÔNG tự chọn «Cả tỉnh Vĩnh Long» chỉ vì "vinh" là đầu tên (qua bộ lọc loại chỉ tự chọn khi khớp NGUYÊN tên)', () => {
    const r = search('tp Vinh');
    expect(r.results.map(label)).toEqual(['Cả tỉnh Vĩnh Long']);
    expect(r.confident).toBe(false);
    expect(search('tỉnh Vinh').confident).toBe(false);
    expect(search('tỉnh Vĩnh Long').confident).toBe(true);
  });

  it('«P. Hồng Hà» (chữ «P.» là tiền tố phường): không dính liền thành "phongha" rồi khớp NGUYÊN tên «Phong Hà»', () => {
    for (const q of ['P. Hồng Hà', 'p hong ha', 'P.Hồng Hà']) {
      const r = search(q);
      expect(r.results.map(label), q).toEqual(['Hồng Hà · Hà Nội']);
      expect(r.confident, q).toBe(true);
    }
    // Nguy hiểm thật sự là khi xã gõ KHÔNG tồn tại: bộ lọc tiền tố không có gì để thay, nếu chữ bị dính liền thì «Phong Hà»
    // trở thành kết quả duy nhất, khớp nguyên tên ⇒ tự chọn nhầm.
    const only = mini([{ code: '15', name: 'Lào Cai' }], [['15', 'Phong Hà']]);
    const r = run(only, 'P. Hồng Hà');
    expect(r.results.map(label)).toEqual([]);
    expect(r.confident).toBe(false);
    expect(run(only, 'Phong Hà').confident).toBe(true);
    expect(run(only, 'phongha').confident).toBe(true); // gõ liền CHỦ Ý (một từ) vẫn được
  });

  it('chỉ là phương án sau: tên thật bắt đầu bằng "Tĩnh" không bị cắt chữ đầu ("tinh tuc" → «Tĩnh Túc», không ra «Túc Trưng»)', () => {
    expect(top('tinh tuc')).toEqual(['Tĩnh Túc · Cao Bằng']);
    expect(search('tinh tuc').confident).toBe(true);
  });

  it('tên thật bắt đầu bằng «Xà» (≈ tiền tố «xã»): «Xà Phìn» tự chọn đúng xã đó, không bị cắt thành «Phìn …» (kể cả gõ không dấu)', () => {
    for (const q of ['Xà Phìn', 'xa phin']) {
      const r = search(q);
      expect(r.results[0] && label(r.results[0])).toBe('Xà Phìn · Tuyên Quang');
      expect(r.confident).toBe(true);
    }
  });

  it('đơn vị cũ (huyện/quận/thị xã) KHÔNG được hiểu thành xã: không ra kết quả giả', () => {
    expect(search('huyen soc son').total).toBe(0);
  });
});

/** Chỉ mục nhỏ dựng riêng cho từng ca (không đụng fixture chung): wards = [mã tỉnh, tên]. */
const mini = (provinces: ProvinceOption[], wards: [string, string][], zones: SpecialZone[] = []) =>
  buildSearchIndex({
    provinces,
    wards: wards.map(([provinceCode, name], i) => ({ code: `${provinceCode}${String(i).padStart(3, '0')}`, name, provinceCode })),
    zones,
  });
const run = (index: ReturnType<typeof mini>, q: string) => searchTargets(index, q);
const titles = (index: ReturnType<typeof mini>, q: string) => run(index, q).results.map(label);

describe('searchTargets — ca đã lọt qua bản trước (review vòng 2): chỉ tự chọn khi THẬT chắc', () => {
  const LS = { code: '20', name: 'Lạng Sơn' };
  const LC = { code: '15', name: 'Lào Cai' };

  it('cụm tên tỉnh gõ DỞ ("lien son la") chỉ để thu hẹp, không bao giờ tự chọn; gõ đủ tên tỉnh thì tự chọn', () => {
    const idx = mini([LS, LC], [['20', 'Liên Sơn'], ['15', 'Sơn Hải']]);
    expect(titles(idx, 'lien son')).toEqual(['Liên Sơn · Lạng Sơn']);
    expect(run(idx, 'lien son').confident).toBe(true);
    const partial = run(idx, 'lien son la');
    expect(partial.results.map(label)).toEqual(['Liên Sơn · Lạng Sơn']); // vẫn thu hẹp được…
    expect(partial.confident).toBe(false); // …nhưng "la" mới là đầu «Lạng»/«Lào» nên chưa chắc
    const full = run(idx, 'lien son lang son');
    expect(full.results.map(label)).toEqual(['Liên Sơn · Lạng Sơn']);
    expect(full.confident).toBe(true);
  });

  it('dấu của tên TỈNH không "cứu" dấu thiếu của tên xã: «Phú My» ≠ «Phú Mỹ» dù "my" trùng đầu «Minh» của Hồ Chí Minh', () => {
    const idx = mini([{ code: '79', name: 'Hồ Chí Minh' }], [['79', 'Phú Mỹ']]);
    const r = run(idx, 'Phú My');
    expect(r.results.map(label)).toEqual(['Phú Mỹ · Hồ Chí Minh']);
    expect(r.confident).toBe(false);
    expect(run(idx, 'Phú Mỹ').confident).toBe(true);
    expect(run(idx, 'phu my').confident).toBe(true); // gõ không dấu hẳn thì không có dấu nào để lệch
  });

  it('kết quả DUY NHẤT nhưng lệch dấu vẫn KHÔNG tự chọn («Xuân Thanh» có dấu ở chữ đầu, chữ sau thiếu dấu nặng)', () => {
    const idx = mini([{ code: '92', name: 'Cần Thơ' }], [['92', 'Xuân Thạnh']]);
    const r = run(idx, 'Xuân Thanh');
    expect(r.results.map(label)).toEqual(['Xuân Thạnh · Cần Thơ']);
    expect(r.tied).toBe(1);
    expect(r.confident).toBe(false);
    expect(run(idx, 'Xuân Thạnh').confident).toBe(true);
    expect(run(idx, 'xuan thanh').confident).toBe(true);
  });

  it('gõ ĐỦ các từ của một tên dài hơn («Phước Mỹ» → «Phước Mỹ Trung») chỉ gợi ý, không tự chọn; gõ dở từ cuối thì tự hoàn thành', () => {
    const idx = mini([{ code: '68', name: 'Lâm Đồng' }], [['68', 'Phước Mỹ Trung']]);
    const full = run(idx, 'Phước Mỹ');
    expect(full.results.map(label)).toEqual(['Phước Mỹ Trung · Lâm Đồng']);
    expect(full.confident).toBe(false);
    expect(run(idx, 'Phước Mỹ T').confident).toBe(true);
    expect(run(idx, 'phuoc my tru').confident).toBe(true);
    expect(run(idx, 'Phước Mỹ Trung').confident).toBe(true);
  });

  it('tên + tên tỉnh ĐỦ nhưng phần tên mới là đầu từ ("dai thai nguyen") thì chưa tự chọn; gõ đủ tên xã thì tự chọn', () => {
    const idx = mini([{ code: '19', name: 'Thái Nguyên' }], [['19', 'Đại Từ']]);
    const r = run(idx, 'dai thai nguyen');
    expect(r.results.map(label)).toEqual(['Đại Từ · Thái Nguyên']);
    expect(r.confident).toBe(false);
    expect(run(idx, 'dai tu thai nguyen').confident).toBe(true);
  });

  it('qua bộ lọc loại ("tỉnh …", "xã …") chỉ tự chọn khi khớp NGUYÊN tên, kể cả khi mới gõ dở từ cuối', () => {
    const idx = mini([{ code: '86', name: 'Vĩnh Long' }, { code: '19', name: 'Thái Nguyên' }], [['19', 'Đại Từ']]);
    // Không có tiền tố: gõ dở từ cuối là tự hoàn thành (mạnh)…
    expect(run(idx, 'vin').confident).toBe(true);
    expect(run(idx, 'dai t').confident).toBe(true);
    // …nhưng qua tiền tố thì phải gõ đủ tên mới tự chọn.
    const prov = run(idx, 'tỉnh Vin');
    expect(prov.results.map(label)).toEqual(['Cả tỉnh Vĩnh Long']);
    expect(prov.confident).toBe(false);
    const ward = run(idx, 'xã dai t');
    expect(ward.results.map(label)).toEqual(['Đại Từ · Thái Nguyên']);
    expect(ward.confident).toBe(false);
    expect(run(idx, 'xã dai tu').confident).toBe(true);
    expect(run(idx, 'tỉnh Vĩnh Long').confident).toBe(true);
  });

  it('«phường»/«xã» gõ có dấu theo thói quen không biến tên KHÔNG dấu thành "đã gõ có dấu": «phường ba dinh» vẫn hoà «Ba Đình» ↔ «Ba Dinh»', () => {
    const idx = mini([{ code: '01', name: 'Hà Nội' }, { code: '51', name: 'Quảng Ngãi' }], [['01', 'Ba Đình'], ['51', 'Ba Dinh']]);
    for (const q of ['ba dinh', 'phường ba dinh', 'xã ba dinh']) {
      const r = run(idx, q);
      expect(r.results.map(label).sort(), q).toEqual(['Ba Dinh · Quảng Ngãi', 'Ba Đình · Hà Nội']);
      expect(r.tied, q).toBe(2);
      expect(r.confident, q).toBe(false);
    }
    // Đã gõ có dấu ở chính TÊN thì phân biệt được.
    const marked = run(idx, 'phường Ba Đình');
    expect(marked.results[0].subtitle).toBe('Hà Nội');
    expect(marked.confident).toBe(true);
  });

  it('gõ liền XUYÊN từ giữa tên cần ≥4 ký tự: "dalat" tìm «Cam Ly - Đà Lạt» nhưng "dal" (quá mơ hồ) thì không', () => {
    expect(search('dalat').results.map((r) => r.title)).toContain('Cam Ly - Đà Lạt');
    expect(search('dal').results.map((r) => r.title)).not.toContain('Cam Ly - Đà Lạt');
  });

  it('hoà thì cái HẸP hơn lên trước: xã đứng trên «Cả tỉnh» cùng tên, điểm đặc biệt đứng trên xã', () => {
    expect(search('Lào Cai').results.slice(0, 2).map((r) => r.kind)).toEqual(['ward', 'province']);
    expect(search('Hưng Yên').results.slice(0, 2).map((r) => r.kind)).toEqual(['ward', 'province']);
    expect(search('noi bai').results.slice(0, 2).map((r) => r.kind)).toEqual(['zone', 'ward']);
  });

  it('điểm đặc biệt: bí danh bỏ loại hình ở đầu và phần trong ngoặc, gõ kiểu nào cũng ra và tự chọn được khi duy nhất', () => {
    const zones: SpecialZone[] = [
      { code: 'A', name: 'Sân bay quốc tế Nội Bài', provinceCode: '01', provinceName: 'Hà Nội', kind: 'AIRPORT', active: true },
      { code: 'B', name: 'Cảng hàng không quốc tế Cam Ranh (T2)', provinceCode: '68', provinceName: 'Lâm Đồng', kind: 'AIRPORT', active: true },
      { code: 'C', name: 'Nhà ga Hà Nội', provinceCode: '01', provinceName: 'Hà Nội', kind: 'STATION', active: true },
    ];
    const idx = mini([{ code: '01', name: 'Hà Nội' }, { code: '68', name: 'Lâm Đồng' }], [], zones);
    for (const q of ['noi bai', 'Nội Bài', 'sân bay quốc tế Nội Bài']) {
      const r = run(idx, q);
      expect(r.results.map((x) => x.key), q).toEqual(['zone|A']);
      expect(r.confident, q).toBe(true);
    }
    // Gõ loại hình ngắn hơn tên đầy đủ ("san bay noi bai" cho «Sân bay quốc tế Nội Bài») vẫn tìm ra, chỉ là không tự chọn.
    expect(run(idx, 'san bay noi bai').results.map((x) => x.key)).toEqual(['zone|A']);
    for (const q of ['cam ranh', 'Cam Ranh']) {
      const r = run(idx, q);
      expect(r.results.map((x) => x.key), q).toEqual(['zone|B']);
      expect(r.confident, q).toBe(true);
    }
    // Gõ kèm phần ngoặc hay loại hình dở dang: vẫn TÌM RA (người dùng chọn tay), chỉ là không tự chọn.
    for (const q of ['Cam Ranh (T2)', 'cang hang khong quoc te cam ranh', 'cam ranh t2']) {
      expect(run(idx, q).results.map((x) => x.key), q).toEqual(['zone|B']);
    }
    // «Nhà ga Hà Nội» có bí danh "Hà Nội" trùng tên tỉnh: hai dòng hoà, KHÔNG tự chọn (kẻo "ha noi" thành nhà ga).
    const hn = run(idx, 'ha noi');
    expect(hn.results.slice(0, 2).map((x) => x.key)).toEqual(['zone|C', 'province|01']);
    expect(hn.confident).toBe(false);
  });

  it('«Nội bai» (dấu ở chữ đầu, chữ sau thiếu dấu): dấu của TÊN ĐẦY ĐỦ «Sân bay Nội Bài» (có chữ "bay") không cứu dấu thiếu của bí danh', () => {
    const idx = mini([{ code: '01', name: 'Hà Nội' }], [], [
      { code: 'A', name: 'Sân bay Nội Bài', provinceCode: '01', provinceName: 'Hà Nội', kind: 'AIRPORT', active: true },
    ]);
    const r = run(idx, 'Nội bai');
    expect(r.results.map((x) => x.key)).toEqual(['zone|A']);
    expect(r.confident).toBe(false);
    expect(run(idx, 'Nội Bài').confident).toBe(true);
    expect(run(idx, 'noi bai').confident).toBe(true);
  });

  it('tên trả về có sẵn tiền tố «Phường/Xã/Thị trấn/Đặc khu»: gõ tên trần vẫn khớp NGUYÊN tên (không thua «Cả tỉnh Lạng Sơn»)', () => {
    const idx = mini([{ code: '01', name: 'Hà Nội' }, LS], [['01', 'Phường Láng'], ['01', 'Thị trấn Đông Anh'], ['20', 'Đặc khu Cô Tô']]);
    const lang = run(idx, 'lang');
    expect(lang.results.map(label)).toEqual(['Phường Láng · Hà Nội', 'Cả tỉnh Lạng Sơn']);
    expect(lang.confident).toBe(true);
    expect(run(idx, 'Láng').confident).toBe(true);
    expect(run(idx, 'dong anh').confident).toBe(true);
    expect(run(idx, 'co to').confident).toBe(true);
    expect(run(idx, 'phuong lang').confident).toBe(true); // gõ cả tiền tố cũng được
    // Nhưng chỉ khi tiền tố viết ĐÚNG: «Xà Phìn»/«Phương Mai» là tên thật, không bị cắt chữ đầu.
    const real = mini([{ code: '08', name: 'Tuyên Quang' }, { code: '01', name: 'Hà Nội' }], [['08', 'Xà Phìn'], ['01', 'Phương Mai'], ['01', 'Phìn Mai']]);
    expect(run(real, 'phin').results.map(label)).toEqual(['Phìn Mai · Hà Nội', 'Xà Phìn · Tuyên Quang']);
    expect(run(real, 'mai').results.map(label)).toEqual(['Phìn Mai · Hà Nội', 'Phương Mai · Hà Nội']);
  });

  it('nguồn trả tên tỉnh kèm «Thành phố»/«Tỉnh»: tìm bằng tên trần, viết tắt và «tp …» vẫn đúng', () => {
    const idx = mini(
      [{ code: '31', name: 'Thành phố Hải Phòng' }, { code: '38', name: 'Tỉnh Thanh Hóa' }, { code: '46', name: 'Thành phố Huế' }],
      [['38', 'Tĩnh Gia']],
    );
    for (const q of ['hai phong', 'Hải Phòng', 'thanh pho hai phong', 'tp hai phong', 'hp']) {
      const r = run(idx, q);
      expect(r.results.map((x) => x.key), q).toEqual(['province|31']);
      expect(r.confident, q).toBe(true);
    }
    expect(run(idx, 'tp hue').confident).toBe(true);
    // «thành phố Thanh Hóa» là thành phố CŨ: ra «Cả tỉnh Thanh Hóa» nhưng không tự chọn.
    const th = run(idx, 'thành phố Thanh Hóa');
    expect(th.results.map((x) => x.key)).toEqual(['province|38']);
    expect(th.confident).toBe(false);
    expect(run(idx, 'thanh hoa').confident).toBe(true);
    expect(run(idx, 'tinh thanh hoa').confident).toBe(true);
    // «Tĩnh Gia» không bị «tỉnh» nuốt: gõ đúng tên xã vẫn ra xã.
    expect(run(idx, 'Tĩnh Gia').results.map(label)).toEqual(['Tĩnh Gia · Tỉnh Thanh Hóa']);
  });

  it('tên ở dạng tổ hợp (NFD, dấu tách rời) vẫn tìm và tự chọn được; tiêu đề giữ nguyên chuỗi gốc', () => {
    const nfd = 'Đại Từ'.normalize('NFD');
    expect(nfd).not.toBe('Đại Từ');
    const idx = mini([{ code: '19', name: 'Thái Nguyên'.normalize('NFD') }], [['19', nfd]]);
    for (const q of ['Đại Từ', nfd, 'dai tu']) {
      const r = run(idx, q);
      expect(r.results.map((x) => x.title), q).toEqual([nfd]);
      expect(r.confident, q).toBe(true);
    }
    expect(run(idx, 'dai tu thai nguyen').confident).toBe(true);
  });
});

describe('searchTargets — giới hạn và trạng thái', () => {
  it('ô rỗng hoặc chỉ khoảng trắng: không kết quả và KHÔNG báo "quá ngắn"', () => {
    for (const q of ['', '   ']) {
      const r = search(q);
      expect(r).toMatchObject({ results: [], total: 0, tooShort: false, confident: false });
    }
  });

  it('một ký tự (sau khi bỏ dấu) là quá ngắn: không kết quả, báo tooShort', () => {
    for (const q of ['d', 'Đ', '--']) expect(search(q)).toMatchObject({ results: [], total: 0, tooShort: true, confident: false });
  });

  it('không có gì khớp: rỗng, KHÔNG phải tooShort', () => {
    expect(search('zzzz')).toMatchObject({ results: [], total: 0, tooShort: false, confident: false });
  });

  it(`chỉ trả tối đa ${WARD_SEARCH_MAX_RESULTS} kết quả nhưng total là tổng số khớp`, () => {
    const many: WardOption[] = Array.from({ length: 100 }, (_, i) => ({ code: `9${String(i).padStart(4, '0')}`, name: `Phường ${i}`, provinceCode: '01' }));
    const idx = buildSearchIndex({ provinces: PROVINCES, wards: many, zones: [] });
    const out = searchTargets(idx, 'phuong');
    expect(out.results).toHaveLength(WARD_SEARCH_MAX_RESULTS);
    expect(out.total).toBe(100);
    expect(out.confident).toBe(false);
    expect(searchTargets(idx, 'phuong', 5).results).toHaveLength(5);
  });

  it('chạy được trên cỡ cả nước (~3.300 xã) mà không chậm bất thường', () => {
    const big: WardOption[] = Array.from({ length: 3300 }, (_, i) => ({
      code: String(10000 + i),
      name: `Xã Số ${i} Phú`,
      provinceCode: PROVINCES[i % PROVINCES.length].code,
    }));
    const idx = buildSearchIndex({ provinces: PROVINCES, wards: big, zones: ZONES });
    const t0 = performance.now();
    const out = searchTargets(idx, 'phu');
    const ms = performance.now() - t0;
    expect(out.total).toBeGreaterThan(3000);
    expect(out.results).toHaveLength(WARD_SEARCH_MAX_RESULTS);
    // Ngưỡng rộng (CI chậm) — chỉ chặn lỗi O(n²), không đo hiệu năng chính xác.
    expect(ms).toBeLessThan(1000);
  });
});

describe('pendingQuickSearch — gõ dở mà chưa chọn', () => {
  it('ô rỗng/khoảng trắng: không có gì đang chờ', () => {
    expect(pendingQuickSearch('')).toBeNull();
    expect(pendingQuickSearch('   ')).toBeNull();
  });

  it('có chữ: câu mô tả cố định, KHÔNG lặp lại chữ đã gõ (vùng thông báo aria-live không được đổi theo từng phím)', () => {
    const a = pendingQuickSearch('d');
    expect(a).toBe('đang gõ ở ô «Tìm nhanh» mà chưa chọn kết quả nào');
    expect(pendingQuickSearch('  dai tu ')).toBe(a);
  });
});
