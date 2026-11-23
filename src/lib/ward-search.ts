import { foldVietnamese } from '@/components/ui/combobox-filter';
import { getProvinceSearchTerms } from '@/lib/province-merges';
import { LEGACY_DISTRICTS, getWardLegacyInfo } from '@/lib/ward-legacy-lookup';
import { zoneEndpoint, type MacroEndpoint } from './macro-bulk';
import type { ProvinceOption, SpecialZone, WardOption } from './types';

/**
 * Tìm nhanh điểm đón/trả theo tên (không dấu cũng được) trên MỌI tỉnh: xã/phường, «Cả tỉnh X», điểm đặc biệt.
 * Hàm thuần — ô nhập và danh sách kết quả nằm ở `ward-quick-add.tsx`.
 *
 * NGUYÊN TẮC AN TOÀN: chọn nhầm = luật giá gắn nhầm vùng, nên ô nhập chỉ TỰ chọn dòng đầu (`confident`) khi MỌI điều
 * kiện sau đều đúng: nó thắng rõ dòng thứ hai; nó khớp MẠNH (nguyên tên, hoặc đầu tên, hoặc nguyên tên + ĐỦ tên tỉnh);
 * dấu đã gõ khớp hoàn toàn. Còn lại (cùng tên ở nhiều tỉnh, xã ↔ sân bay ↔ tỉnh trùng tên, mới gõ đầu từ, tên tỉnh
 * gõ dở, dấu lệch…) thì người dùng phải chọn dòng cụ thể. Vì vậy xếp hạng ưu tiên độ CHÍNH XÁC hơn độ "rộng":
 *  - Khớp theo ĐẦU TỪ (gõ "ha" ra "Hà Đông", không ra "Thanh Xuân"), không khớp mờ như cmdk.
 *  - Dấu đã gõ được TÔN TRỌNG: gõ "Thanh Xuân" thì «Thanh Xuân» (Hà Nội) đứng trên «Thạnh Xuân» (Cần Thơ); gõ không
 *    dấu thì hai xã đó hoà nhau. Chỉ tên XÃ được dùng để xét dấu (trừ khi người dùng gõ cả tên tỉnh).
 *  - Thu hẹp bằng tên tỉnh theo CỤM bắt đầu từ chữ đầu của tên tỉnh ("cau giay ha noi", "hai chau da nang"); cụm
 *    chưa gõ ĐỦ vẫn thu hẹp được nhưng không bao giờ được tự chọn (kẻo "lien son la" ăn mất chữ «la» của tên xã).
 *  - Tiền tố hành chính là BỘ LỌC LOẠI: «xã/phường …» chỉ lấy xã; «tỉnh/thành phố …» chỉ lấy tỉnh; qua bộ lọc chỉ tự
 *    chọn khi khớp NGUYÊN tên. «tp/thành phố X» của 28 tỉnh không trực thuộc trung ương là thành phố CŨ (nay là vài
 *    phường), nên không bao giờ tự chọn «Cả tỉnh X».
 */

/** Dưới ngần này ký tự (sau khi bỏ dấu) thì chưa tìm: 1 ký tự khớp quá nhiều. */
export const WARD_SEARCH_MIN_CHARS = 2;
/** Số kết quả hiện tối đa; phần còn lại báo "còn N kết quả nữa". */
export const WARD_SEARCH_MAX_RESULTS = 30;
/** Cụm tên tỉnh dùng để thu hẹp phải dài ít nhất ngần này ký tự ("ha" của "ha noi" đủ, "a" thì không). */
const PROVINCE_HINT_MIN_CHARS = 2;

export type SearchTargetKind = 'ward' | 'province' | 'zone' | 'legacy_district';

/** Một từ đã tách: bản bỏ dấu (so khớp) + bản giữ dấu tách riêng dấu thanh (so độ chính xác dấu). */
type Tok = { fold: string; base: string; tone: string; marked: boolean; spelled: string };
/** Một cách viết tên (tên chính, bí danh, bản bỏ tiền tố…). */
type Form = {
  norm: string;
  compact: string;
  /** Vị trí (trong `compact`) nơi mỗi từ của tên bắt đầu — để khớp gõ liền giữa tên ("dalat" trong "Cam Ly - Đà Lạt"). */
  starts: number[];
  words: string[];
  /** Chính tả thật của tên (giữ dấu, y≠i, dấu thanh về một chỗ) — chỉ để xếp thứ tự khi hoà. */
  typed: string;
  accents: { base: string; tone: string }[];
  /** Bí danh/viết tắt ("hcm", "tphcm"): chỉ được khớp NGUYÊN câu, không khớp đầu từ ("tp" không được ra Hồ Chí Minh). */
  exactOnly: boolean;
  /** Bí danh tỉnh CŨ bị gộp vào tỉnh mới (chỉ là một phần): xếp sau tên hiện tại và không tự chọn khi bấm Enter. */
  subset?: boolean;
  /** Ghi chú hiển thị khi khớp theo tên cũ (vd "Cũ: Quận Bắc Từ Liêm" hay "Cũ: Phường Cổ Nhuế 1 (Quận Bắc Từ Liêm)"). */
  legacyNote?: string;
  /** Số quận/huyện cũ khác nhau góp phần vào xã này khi khớp theo `Cũ: <quận/huyện>`: ít hơn = xã lõi của quận hơn (ưu tiên trên xã giáp ranh ghép một phần). */
  legacySpread?: number;
};

export type SearchTarget = {
  /** Khoá duy nhất (dùng cho React). */
  key: string;
  kind: SearchTargetKind;
  /** Điểm đón/trả được thêm khi chọn dòng này — cùng dạng với ô chọn theo tỉnh/xã. */
  endpoint: MacroEndpoint;
  /** Chuỗi tìm gửi về máy chủ khi chọn một quận/huyện cũ (`kind === 'legacy_district'`). */
  legacySearchText?: string;
  /** Dòng chính: tên xã, «Cả tỉnh X» hoặc tên điểm đặc biệt. */
  title: string;
  /** Dòng phụ: tên tỉnh (và «điểm đặc biệt» với vùng đặc biệt). */
  subtitle: string;
  /** Các cách viết TÊN để so khớp (chính + bí danh). */
  forms: Form[];
  /** Tên tỉnh của xã/vùng để thu hẹp (khớp theo CỤM từ chữ đầu, cho phép gõ dở): [['ha','noi']]. Rỗng với mục «Cả tỉnh». */
  provinceWords: string[][];
  /** Viết tắt tỉnh (khớp NGUYÊN cụm): [['hcm'], ['sai','gon']]. */
  provinceAliases: string[][];
  provinceAccents: { base: string; tone: string }[];
  /** Mục «Cả tỉnh X» của một trong 6 thành phố trực thuộc trung ương (Hà Nội, Hải Phòng, Huế, Đà Nẵng, Hồ Chí Minh, Cần Thơ). */
  isCity: boolean;
  sortName: string;
  sortProvince: string;
};

export type SearchOutcome = {
  results: SearchTarget[];
  /** Ghi chú nguồn tên cũ theo `target.key` khi kết quả khớp qua tên cũ (huyện/phường trước sáp nhập). */
  matchNotes?: Record<string, string>;
  /** Tổng số mục khớp (trước khi cắt còn `max`). */
  total: number;
  /** Đã gõ gì đó nhưng chưa đủ `WARD_SEARCH_MIN_CHARS` ký tự để tìm. */
  tooShort: boolean;
  /** Dòng đầu được phép TỰ chọn khi bấm Enter (xem nguyên tắc an toàn ở đầu file). */
  confident: boolean;
  /** Số dòng hoà nhau ở vị trí đầu (1 nếu dòng đầu thắng rõ). */
  tied: number;
  /** Các dòng hoà đầu cùng một tên (vd hai xã «Phú Bình» ở hai tỉnh) — để gợi ý "xem tên tỉnh". */
  tiedSameName: boolean;
};

const EMPTY: SearchOutcome = { results: [], total: 0, tooShort: false, confident: false, tied: 0, tiedSameName: false };

// ───────────────────────── Chuẩn hoá chữ ─────────────────────────

/**
 * Mã ký tự dưới dạng số, KHÔNG viết thẳng ký tự vô hình/dấu kết hợp vào mã nguồn: chúng rất dễ bị trình soạn thảo, git
 * hay công cụ chuẩn hoá (NFC/NFD) làm mất hoặc dính vào ký tự bên cạnh mà không ai nhìn ra.
 */
const chars = (...codePoints: number[]): string => String.fromCharCode(...codePoints);

/** Dấu THANH kết hợp: huyền U+0300, sắc U+0301, ngã U+0303, hỏi U+0309, nặng U+0323. */
const TONE_MARK = new RegExp(`[${chars(0x0300, 0x0301, 0x0303, 0x0309, 0x0323)}]`);
/** Ký tự vô hình hay bị dán kèm: soft hyphen U+00AD, zero-width U+200B–U+200D, BOM U+FEFF. */
const INVISIBLE = new RegExp(`[${chars(0x00ad, 0x200b)}-${chars(0x200d)}${chars(0xfeff)}]`, 'g');
/** Eth U+00D0 / U+00F0 (hay gặp khi dán từ văn bản chuyển mã cũ) = Đ / đ. */
const ETH_UPPER = new RegExp(chars(0x00d0), 'g');
const ETH_LOWER = new RegExp(chars(0x00f0), 'g');

/** Bỏ ký tự vô hình dán kèm, đổi Eth (U+00D0/U+00F0) thành Đ/đ, đưa về NFC. */
function clean(s: string): string {
  return s.replace(INVISIBLE, '').replace(ETH_UPPER, 'Đ').replace(ETH_LOWER, 'đ').normalize('NFC');
}

/**
 * Tách dấu THANH (sắc, huyền, hỏi, ngã, nặng) khỏi chữ: «hoà»/«hòa», «thuỵ»/«thụy» chỉ khác chỗ đặt dấu nên phải
 * coi là một. Dấu mũ/móc/trăng (â ê ô ơ ư ă) và đ nằm trong `base`; y đồng nhất với i (quý/quí, Quy Nhơn/Qui Nhơn).
 */
function splitTone(word: string): { base: string; tone: string; spelled: string } {
  let tone = '';
  let plain = '';
  for (const ch of word.normalize('NFD')) {
    if (TONE_MARK.test(ch)) tone = ch;
    else plain += ch;
  }
  return { base: plain.normalize('NFC').replace(/y/g, 'i'), tone, spelled: (plain + tone).normalize('NFC') };
}

function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  for (const raw of clean(s).toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (!raw) continue;
    const plain = foldVietnamese(raw);
    const fold = plain.replace(/y/g, 'i').replace(/[^a-z0-9]/g, '');
    if (!fold) continue;
    const { base, tone, spelled } = splitTone(raw);
    out.push({ fold, base, tone, marked: plain !== raw, spelled });
  }
  return out;
}

const JOINED_WORD = /[\p{L}\p{N}][-'’‘ʼ.][\p{L}\p{N}]/u;

/** Dựng một cách viết tên. `drop` bỏ bớt n từ đầu (dùng cho bí danh «Sân bay X» → «X», «Xã X» → «X»). */
function makeForm(name: string, opts: { drop?: number; exactOnly?: boolean; subset?: boolean } = {}): Form | null {
  const toks = tokenize(name).slice(opts.drop ?? 0);
  if (toks.length === 0) return null;
  const words = toks.map((t) => t.fold);
  // «H'leo» (dấu nháy/gạch nối trong từ): người gõ hay viết liền "hleo" ⇒ thêm bản nối.
  for (const rawWord of clean(name).toLowerCase().split(/\s+/)) {
    if (!JOINED_WORD.test(rawWord)) continue;
    const joined = foldVietnamese(rawWord).replace(/y/g, 'i').replace(/[^a-z0-9]/g, '');
    if (joined && !words.includes(joined)) words.push(joined);
  }
  const starts: number[] = [];
  let at = 0;
  for (const t of toks) {
    starts.push(at);
    at += t.fold.length;
  }
  return {
    norm: toks.map((t) => t.fold).join(' '),
    compact: toks.map((t) => t.fold).join(''),
    starts,
    words,
    typed: toks.map((t) => t.spelled).join(' '),
    accents: toks.map((t) => ({ base: t.base, tone: t.tone })),
    exactOnly: opts.exactOnly ?? false,
    subset: opts.subset,
  };
}

// ───────────────────────── Bí danh / tiền tố ─────────────────────────

/** Cách viết đã chuẩn hoá (bỏ dấu, y→i) của một cụm chữ — các bảng dưới đây so với chữ đã chuẩn hoá. */
const foldWords = (phrase: string): string[] =>
  foldVietnamese(phrase).replace(/y/g, 'i').split(/\s+/).filter(Boolean);

/** 6 thành phố trực thuộc trung ương (từ 7/2025): chỉ chúng mới là «thành phố» cấp tỉnh. Khoá = tên đã chuẩn hoá. */
const CENTRAL_CITIES = new Set(['ha noi', 'hai phong', 'hue', 'da nang', 'ho chi minh', 'can tho']);

/**
 * Viết tắt thường gặp của thành phố lớn (khoá = tên đã chuẩn hoá, bỏ «Thành phố»/«Tỉnh» đầu). Chỉ những cách viết
 * KHÔNG mơ hồ: «dn» (Đà Nẵng hay Đồng Nai), «ct» (Cần Thơ hay công ty) cố ý không có.
 */
const PROVINCE_ALIASES: Record<string, string[]> = {
  'ho chi minh': ['HCM', 'TPHCM', 'SG', 'Sài Gòn'],
  'ha noi': ['HN'],
  'hai phong': ['HP'],
};

/**
 * Loại hình ở đầu tên điểm đặc biệt; người gõ thường chỉ gõ phần tên ("noi bai"). Dài nhất trước — «Sân bay quốc tế
 * Nội Bài» phải bỏ cả «Sân bay quốc tế», không chỉ «Sân bay».
 */
const ZONE_GENERIC_WORDS = ['sân bay quốc tế', 'cảng hàng không quốc tế', 'cảng hàng không', 'sân bay', 'nhà ga', 'bến xe', 'cảng', 'ga']
  .map(foldWords)
  .sort((a, b) => b.length - a.length);

type PrefixRule = { words: string[]; only: SearchTargetKind[]; city?: boolean };
/** Tiền tố hành chính ở đầu câu gõ ⇒ chỉ tìm đúng loại đó. Đã chuẩn hoá (bỏ dấu, y→i). `city`: nghĩa «thành phố». */
const PREFIX_RULES: PrefixRule[] = [
  { words: ['thanh', 'pho'], only: ['province'], city: true },
  { words: ['ca', 'tinh'], only: ['province'] },
  { words: ['tinh'], only: ['province'] },
  { words: ['tp'], only: ['province'], city: true },
  { words: ['dac', 'khu'], only: ['ward'] },
  { words: ['thi', 'tran'], only: ['ward'] },
  { words: ['phuong'], only: ['ward'] },
  { words: ['xa'], only: ['ward'] },
  { words: ['tt'], only: ['ward'] },
  { words: ['p'], only: ['ward'] },
  { words: ['x'], only: ['ward'] },
];

function detectPrefix(folds: string[]): { rest: number; only: SearchTargetKind[]; city: boolean } | null {
  for (const rule of PREFIX_RULES) {
    const n = rule.words.length;
    if (folds.length > n && rule.words.every((w, i) => folds[i] === w)) return { rest: n, only: rule.only, city: !!rule.city };
  }
  return null;
}

/**
 * Tiền tố cấp xã có thể nằm sẵn trong TÊN trả về từ API («Phường Láng», «Xã Đại Từ»). Nhận ra CHÍNH XÁC theo chính tả
 * có dấu (không theo bản bỏ dấu), kẻo «Xà Phìn»/«Phương Mai» — tên thật bắt đầu bằng chữ na ná — bị cắt mất chữ đầu.
 */
const WARD_NAME_PREFIXES: string[][] = ['Xã', 'Phường', 'Thị trấn', 'Đặc khu'].map((p) => tokenize(p).map((t) => t.spelled));

function wardPrefixLength(name: string): number {
  const toks = tokenize(name);
  for (const p of WARD_NAME_PREFIXES) {
    if (toks.length > p.length && p.every((s, i) => toks[i].spelled === s)) return p.length;
  }
  return 0;
}

// ───────────────────────── Dựng chỉ mục ─────────────────────────

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

type ProvinceInfo = { names: Form[]; aliases: Form[]; accents: Form['accents']; city: boolean };

function provinceInfo(name: string): ProvinceInfo | null {
  const primary = makeForm(name);
  if (!primary) return null;
  const names: Form[] = [primary];
  // «Thành phố Hải Phòng» / «Tỉnh Thái Nguyên»: thêm bản bỏ tiền tố (DB thật không có, nguồn khác có).
  const rule = PREFIX_RULES.find(
    (r) => r.only[0] === 'province' && r.words.length < primary.words.length && r.words.every((w, i) => primary.words[i] === w),
  );
  const stripped = rule ? makeForm(name, { drop: rule.words.length }) : null;
  if (stripped) names.push(stripped);
  const key = (stripped ?? primary).norm;
  const aliases: Form[] = [];
  const seenAlias = new Set<string>();
  const { exactAliases, subsetOldNames } = getProvinceSearchTerms(undefined, key);
  for (const alias of [...(PROVINCE_ALIASES[key] ?? []), ...exactAliases]) {
    if (seenAlias.has(alias)) continue;
    seenAlias.add(alias);
    const shortOrExact = /^[a-z0-9.-]+$/i.test(alias) || alias === 'Sài Gòn' || alias === 'Nội đô Hà Nội';
    const f = makeForm(alias, shortOrExact ? { exactOnly: true } : undefined);
    if (f) {
      if (shortOrExact) aliases.push(f);
      else names.push(f);
    }
  }
  for (const oldName of subsetOldNames) {
    if (seenAlias.has(oldName)) continue;
    seenAlias.add(oldName);
    const f = makeForm(oldName, { exactOnly: true, subset: true });
    if (f) aliases.push(f);
  }
  const accents = [...names, ...aliases].flatMap((f) => f.accents);
  return { names, aliases, accents, city: CENTRAL_CITIES.has(key) };
}

function districtPrefixInfo(name: string): { drop: number; shortPrefix: string } | null {
  const folds = tokenize(name).map((t) => t.fold);
  if (folds.length >= 2 && folds[0] === 'quan') return { drop: 1, shortPrefix: 'q.' };
  if (folds.length >= 2 && (folds[0] === 'huien' || folds[0] === 'huyen')) return { drop: 1, shortPrefix: 'h.' };
  if (folds.length >= 3 && folds[0] === 'thi' && folds[1] === 'xa') return { drop: 2, shortPrefix: 'tx' };
  if (folds.length >= 3 && folds[0] === 'thanh' && folds[1] === 'pho') return { drop: 2, shortPrefix: 'tp' };
  return null;
}

function buildDistrictForms(
  distName: string,
  opts: { subset?: boolean; bareSubset?: boolean; legacyNote?: string } = {},
): { forms: Form[]; sortName: string } {
  const forms: Form[] = [];
  const seen = new Set<string>();
  const pushForm = (raw: string, formOpts: { drop?: number; exactOnly?: boolean; subset?: boolean } = {}) => {
    const f = makeForm(raw, { subset: opts.subset, ...formOpts });
    if (!f || seen.has(f.norm)) return null;
    seen.add(f.norm);
    if (opts.legacyNote) f.legacyNote = opts.legacyNote;
    forms.push(f);
    return f;
  };

  const primary = pushForm(distName);
  const pInfo = districtPrefixInfo(distName);
  let bare: Form | null = null;
  if (pInfo) {
    const bareSub = opts.bareSubset ?? opts.subset;
    const bareCandidate = makeForm(distName, { drop: pInfo.drop, subset: bareSub });
    if (bareCandidate) {
      if (/^\d+$/.test(bareCandidate.norm)) {
        // Quận số ("Quận 1".."Quận 12"): KHÔNG thêm tên trần "1", thêm viết tắt q1/q.1 exactOnly.
        if (pInfo.shortPrefix === 'q.') {
          pushForm(`q${bareCandidate.norm}`, { exactOnly: true });
          pushForm(`q.${bareCandidate.norm}`, { exactOnly: true });
        }
      } else {
        if (!seen.has(bareCandidate.norm)) {
          seen.add(bareCandidate.norm);
          if (opts.legacyNote) bareCandidate.legacyNote = opts.legacyNote;
          forms.push(bareCandidate);
        }
        bare = bareCandidate;
        pushForm(`${pInfo.shortPrefix} ${bareCandidate.typed}`);
      }
    }
  }
  return {
    forms,
    sortName: (bare ?? primary)?.norm ?? '',
  };
}

/** Bí danh của điểm đặc biệt: bỏ phần trong ngoặc («(T2)») và loại hình ở đầu («Sân bay quốc tế»). */
function zoneAlias(name: string): Form | null {
  const cleaned = name.replace(/\([^)]*\)/g, ' ');
  const folds = tokenize(cleaned).map((t) => t.fold);
  const generic = ZONE_GENERIC_WORDS.find((g) => folds.length > g.length && g.every((w, i) => folds[i] === w));
  if (!generic && cleaned === name) return null;
  return makeForm(cleaned, { drop: generic ? generic.length : 0 });
}

/**
 * Dựng chỉ mục một lần (đổi khi danh sách xã/tỉnh/điểm đặc biệt đổi). Danh sách xã có thể còn rỗng (chưa nạp xong):
 * khi đó vẫn tìm được tỉnh và điểm đặc biệt (nhưng `confident` do nơi gọi chặn lại cho tới khi đủ dữ liệu).
 *
 * Dòng dữ liệu thiếu tên/mã (API lỗi, cột null) bị BỎ QUA thay vì ném: một dòng hỏng không được làm sập cả
 * hộp thoại, và cũng không thể dựng thành điểm đón/trả hợp lệ.
 */
export function buildSearchIndex(args: {
  provinces: ProvinceOption[];
  wards: WardOption[];
  zones: SpecialZone[];
}): SearchTarget[] {
  const provinces = args.provinces.filter((p) => isText(p?.code) && isText(p?.name));
  const provinceName = new Map(provinces.map((p) => [p.code, p.name]));
  const infoByCode = new Map<string, ProvinceInfo | null>(provinces.map((p) => [p.code, provinceInfo(p.name)]));
  const infoFor = (code: string, name: string): ProvinceInfo | null =>
    infoByCode.has(code) ? infoByCode.get(code)! : provinceInfo(name);
  const out: SearchTarget[] = [];

  for (const p of provinces) {
    const info = infoByCode.get(p.code);
    if (!info) continue;
    const label = `Cả tỉnh ${p.name}`;
    out.push({
      key: `province|${p.code}`,
      kind: 'province',
      endpoint: { provinceCode: p.code, label },
      title: label,
      subtitle: '',
      forms: [...info.names, ...info.aliases],
      provinceWords: [],
      provinceAliases: [],
      provinceAccents: [],
      isCity: info.city,
      sortName: info.names[info.names.length - 1].norm,
      sortProvince: '',
    });
  }

  for (const z of args.zones) {
    if (!isText(z?.code) || !isText(z?.name) || !isText(z?.provinceCode)) continue;
    const pName = provinceName.get(z.provinceCode) ?? z.provinceName ?? z.provinceCode;
    const primary = makeForm(z.name);
    if (!primary) continue;
    const forms = [primary];
    const alias = zoneAlias(z.name);
    if (alias && alias.norm !== primary.norm) forms.push(alias);
    const info = infoFor(z.provinceCode, pName);
    out.push({
      key: `zone|${z.code}`,
      kind: 'zone',
      endpoint: zoneEndpoint(z),
      title: z.name,
      subtitle: `${pName} · điểm đặc biệt`,
      forms,
      provinceWords: info?.names.map((f) => f.words) ?? [],
      provinceAliases: info?.aliases.map((f) => f.words) ?? [],
      provinceAccents: info?.accents ?? [],
      isCity: false,
      sortName: primary.norm,
      sortProvince: info?.names[0].norm ?? '',
    });
  }

  const presentWards = new Set<string>();
  for (const w of args.wards) {
    if (!isText(w?.code) || !isText(w?.name) || !isText(w?.provinceCode)) continue;
    presentWards.add(`${w.provinceCode}|${w.code}`);
    const pName = provinceName.get(w.provinceCode) ?? w.provinceCode;
    const primary = makeForm(w.name);
    if (!primary) continue;
    // Tên trả về có thể kèm «Phường/Xã …»: thêm bản BỎ tiền tố để gõ tên trần vẫn khớp NGUYÊN tên (kẻo «Láng» chỉ còn
    // khớp đầu từ và thua «Cả tỉnh Lạng Sơn»).
    const cut = wardPrefixLength(w.name);
    const bare = cut > 0 ? makeForm(w.name, { drop: cut }) : null;
    const forms: Form[] = bare ? [primary, bare] : [primary];
    const seenNorm = new Set(forms.map((f) => f.norm));

    const legacy = getWardLegacyInfo(w.provinceCode, w.code);
    if (legacy) {
      const spread = legacy.districtNames.length;
      for (const distName of legacy.districtNames) {
        const note = `Cũ: ${distName}`;
        const built = buildDistrictForms(distName, { subset: true, legacyNote: note });
        for (const df of built.forms) {
          if (seenNorm.has(df.norm)) continue;
          seenNorm.add(df.norm);
          df.legacySpread = spread;
          forms.push(df);
        }
      }
      const distSuffix = legacy.districtNames.length > 0 ? ` (${legacy.districtNames.join(', ')})` : '';
      for (const oldWard of legacy.oldWardNames) {
        const note = `Cũ: ${oldWard}${distSuffix}`;
        const addOldForm = (raw: string, formOpts: { drop?: number; exactOnly?: boolean } = {}) => {
          const f = makeForm(raw, { ...formOpts, subset: true });
          if (!f || seenNorm.has(f.norm)) return null;
          seenNorm.add(f.norm);
          f.legacyNote = note;
          forms.push(f);
          return f;
        };
        addOldForm(oldWard);
        const oldCut = wardPrefixLength(oldWard);
        if (oldCut > 0) {
          const bareOld = makeForm(oldWard, { drop: oldCut, subset: true });
          if (bareOld) {
            if (/^\d+$/.test(bareOld.norm)) {
              const firstTok = tokenize(oldWard)[0]?.fold;
              if (firstTok === 'phuong') {
                addOldForm(`p${bareOld.norm}`, { exactOnly: true });
                addOldForm(`p.${bareOld.norm}`, { exactOnly: true });
              }
            } else if (!seenNorm.has(bareOld.norm)) {
              seenNorm.add(bareOld.norm);
              bareOld.legacyNote = note;
              forms.push(bareOld);
            }
          }
        }
      }
    }

    const info = infoFor(w.provinceCode, pName);
    out.push({
      key: `ward|${w.provinceCode}|${w.code}`,
      kind: 'ward',
      endpoint: { provinceCode: w.provinceCode, wardCode: w.code, label: `${w.name} (${pName})` },
      title: w.name,
      subtitle: pName,
      forms,
      provinceWords: info?.names.map((f) => f.words) ?? [],
      provinceAliases: info?.aliases.map((f) => f.words) ?? [],
      provinceAccents: info?.accents ?? [],
      isCity: false,
      sortName: (bare ?? primary).norm,
      sortProvince: info?.names[0].norm ?? '',
    });
  }

  for (const dist of LEGACY_DISTRICTS) {
    const presentCount = dist.wardCodes.reduce(
      (n, wc) => n + (presentWards.has(`${dist.newProvinceCode}|${wc}`) ? 1 : 0),
      0,
    );
    if (presentCount === 0) continue;
    const pName = provinceName.get(dist.newProvinceCode) ?? dist.newProvinceName;
    const newProvInfo = infoFor(dist.newProvinceCode, pName);
    const oldProvForm = dist.oldProvinceName ? makeForm(dist.oldProvinceName) : null;
    const { forms, sortName } = buildDistrictForms(dist.name, { bareSubset: true });
    if (forms.length === 0) continue;
    const subtitle = dist.oldProvinceName
      ? `${pName} (${dist.oldProvinceName} cũ) · huyện cũ, ${presentCount} phường/xã`
      : `${pName} · huyện cũ, ${presentCount} phường/xã`;
    const legacySearchText = dist.isDuplicateName
      ? `${dist.name}, ${dist.oldProvinceName || pName}`
      : dist.name;
    out.push({
      key: `legacy_district|${dist.index}`,
      kind: 'legacy_district',
      endpoint: { provinceCode: dist.newProvinceCode, label: dist.name },
      legacySearchText,
      title: dist.name,
      subtitle,
      forms,
      provinceWords: newProvInfo?.names.map((f) => f.words) ?? [],
      provinceAliases: [
        ...(newProvInfo?.aliases.filter((f) => f.exactOnly).map((f) => f.words) ?? []),
        ...(oldProvForm ? [oldProvForm.words] : []),
      ],
      provinceAccents: [
        ...(newProvInfo?.names.flatMap((f) => f.accents) ?? []),
        ...(oldProvForm ? oldProvForm.accents : []),
      ],
      isCity: false,
      sortName,
      sortProvince: newProvInfo?.names[0].norm ?? '',
    });
  }

  return out;
}

// ───────────────────────── Khớp và xếp hạng ─────────────────────────

type Query = {
  toks: Tok[];
  folds: string[];
  q: string;
  compact: string;
  spelled: string;
  /**
   * Phần TÊN của câu gõ có dấu ở chữ nào không ⇒ chữ không dấu cũng là chủ ý («Vinh» ≠ «Vĩnh»). Chỉ tính phần tên, không
   * tính tiền tố đã cắt: «phường ba dinh» (gõ «phường» có dấu theo thói quen, tên không dấu) vẫn là gõ không dấu.
   */
  marked: boolean;
  /** Được phép khớp "gõ liền" ("dalat", "hoankiem")? Chữ một ký tự ("p", "x", "t") sẽ dính vào từ kế bên. */
  compactOk: boolean;
};

function makeQuery(toks: Tok[], marked: boolean): Query {
  const folds = toks.map((t) => t.fold);
  const compact = folds.join('');
  // «P. Hồng Hà» ghép liền thành "phongha" ≈ «Phong Hải»: chỉ ghép khi câu gõ MỘT từ hoặc mọi từ đều ≥2 ký tự.
  const compactOk = compact.length >= 3 && (folds.length === 1 || folds.every((f) => f.length >= 2));
  return { toks, folds, q: folds.join(' '), compact, spelled: toks.map((t) => t.spelled).join(' '), marked, compactOk };
}

/**
 * Các từ gõ có phải CỤM tên tỉnh? 0 = không; 1 = đang gõ dở (bắt đầu từ chữ đầu của tên tỉnh: "ha noi", "thai ngu");
 * 2 = đã gõ ĐỦ tên tỉnh (hoặc đúng một viết tắt).
 */
function provinceLevel(names: string[][], aliases: string[][], toks: string[]): 0 | 1 | 2 {
  let level: 0 | 1 | 2 = 0;
  for (const pw of names) {
    if (toks.length === 0 || toks.length > pw.length) continue;
    if (toks.join('').length < PROVINCE_HINT_MIN_CHARS) continue;
    if (!toks.every((tk, i) => pw[i].startsWith(tk))) continue;
    const full = toks.length === pw.length && toks.every((tk, i) => pw[i] === tk);
    if (full) return 2;
    level = 1;
  }
  for (const pa of aliases) {
    if (toks.length === pa.length && toks.every((tk, i) => pa[i] === tk)) return 2;
  }
  return level;
}

/** nameTier: 0 nguyên tên, 1 bắt đầu bằng câu gõ, 2 mọi từ gõ là đầu từ của tên, 3 phần còn lại (tách «tên + tỉnh» chưa đủ). */
type How = 'name' | 'compact' | 'words' | 'split';
type FormMatch = { tier: number; how: How; full: boolean; form: Form };
const HOW_RANK: Record<How, number> = { name: 0, compact: 1, split: 2, words: 3 };

function isBetter(a: FormMatch, b: FormMatch | null): boolean {
  if (b === null || a.tier !== b.tier) return b === null || a.tier < b.tier;
  if (Boolean(a.form.subset) !== Boolean(b.form.subset)) return !a.form.subset;
  if (a.how !== b.how) return HOW_RANK[a.how] < HOW_RANK[b.how];
  return a.full && !b.full;
}

/**
 * Kiểm tra dấu thanh của toàn bộ từ gõ có khớp với một từ tương ứng trong `f.accents` (dùng để chặn tên CŨ / đảo từ
 * khác dấu thanh như "tĩnh gia" ≠ "Tịnh Giang", "Quảng Nam" ≠ "Nam Quang", "quan sơn" ≠ "Quận Sơn Trà").
 */
function formAccentsMatch(f: Form, toks: Tok[]): boolean {
  return toks.every((tok) =>
    f.accents.some((w) => w.base.startsWith(tok.base) && w.tone === tok.tone),
  );
}

/** Khớp theo thứ tự từ (cho phép từ đệm ở giữa cho điểm đặc biệt như "san bay noi bai" → "Sân bay quốc tế Nội Bài"). */
function hasInOrderWords(words: string[], folds: string[]): boolean {
  if (folds.length === 0 || words.length < folds.length) return false;
  let pos = 0;
  for (let i = 0; i < folds.length; i++) {
    const tok = folds[i];
    const isLast = i === folds.length - 1;
    let found = -1;
    for (let j = pos; j < words.length; j++) {
      if (isLast ? words[j].startsWith(tok) : words[j] === tok) {
        found = j;
        break;
      }
    }
    if (found === -1) return false;
    pos = found + 1;
  }
  return true;
}

/** Kiểm tra dấu thanh của cụm tên tỉnh gõ dở không mâu thuẫn với tên tỉnh (vd "quận 2" ≠ "Quảng Ninh"). */
function provincePrefixAccentsOk(t: SearchTarget, provToks: Tok[]): boolean {
  const nameAccents = t.provinceAccents;
  if (nameAccents.length === 0) return true;
  return provToks.every((tok) => {
    if (!tok.marked) return true;
    return nameAccents.some((a) => a.base.startsWith(tok.base) && a.tone === tok.tone);
  });
}

/** Khớp liên tiếp theo ĐÚNG thứ tự từ trong tên (cho phép gõ dở từ cuối: "da l" → "Đà Lạt" trong "Cam Ly - Đà Lạt"). */
function hasConsecutiveWordsPrefix(words: string[], folds: string[]): boolean {
  if (folds.length === 0 || words.length < folds.length) return false;
  for (let start = 0; start <= words.length - folds.length; start++) {
    let ok = true;
    for (let j = 0; j < folds.length; j++) {
      const target = words[start + j];
      const tok = folds[j];
      if (j < folds.length - 1 ? target !== tok : !target.startsWith(tok)) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * Đảo thứ tự từ: CHỈ chấp nhận trên tên hiện tại (`!f.subset`) khi mọi từ gõ khớp TRỌN VẸN các từ của tên (không
 * bỏ sót chữ chen giữa như "Phường Hoàng Liệt" cho "phương liệt", và không cắt đầu từ kiểu "gia" → "giang").
 */
function hasExactUnorderedWords(f: Form, folds: string[]): boolean {
  if (f.subset || folds.length < 2) return false;
  const formWords = f.norm.split(' ');
  if (formWords.length === folds.length) {
    const remaining = [...formWords];
    return folds.every((tok) => {
      const idx = remaining.indexOf(tok);
      if (idx === -1) return false;
      remaining.splice(idx, 1);
      return true;
    });
  }
  // Dạng có từ nối ("hleo ea" → "Ea H'leo", "mgar cu" → "Cư M'gar"): các từ nối nằm cuối `f.words`.
  return (
    f.accents.length - folds.length <= 1 &&
    folds.every((tok) => f.words.includes(tok)) &&
    folds.some((tok) => f.words.indexOf(tok) >= formWords.length)
  );
}

/**
 * Hạng khớp của một cách viết tên (nhỏ = tốt), lấy cách khớp TỐT NHẤT: 0 nguyên tên (kèm ĐỦ tên tỉnh nếu có gõ), 1 bắt
 * đầu bằng câu gõ, 2 mọi từ gõ khớp liên tiếp trong tên (hoặc đảo đúng trọn bộ từ của tên), 3 «tên + tỉnh gõ dở».
 */
function formMatch(f: Form, qr: Query, t: SearchTarget): FormMatch | null {
  const { q, compact, folds, compactOk } = qr;
  // Khi người dùng gõ có dấu, tên CŨ (`subset`) bị lệch dấu thanh (vd "quan sơn" ≠ "Cũ: Quận Sơn Trà", "tĩnh gia" ≠ "Cũ: Xã Tịnh Giang") bị loại ngay.
  if (f.subset && qr.marked && !formAccentsMatch(f, qr.toks)) return null;

  let best = null as FormMatch | null;
  const take = (m: Omit<FormMatch, 'form'>) => {
    if (isBetter({ ...m, form: f }, best)) best = { ...m, form: f };
  };

  if (f.norm === q) take({ tier: 0, how: 'name', full: true });
  if (compactOk && f.compact === compact) take({ tier: 0, how: 'compact', full: true });
  if (f.exactOnly) return best;

  if (f.norm.startsWith(q)) {
    // Khi gõ nhiều từ CÓ dấu, chặn tiền tố hành chính lệch dấu ở đầu ("quan sơn" không ăn nhầm đầu "Quận Sơn Trà").
    const adminHead =
      folds.length >= 2 &&
      folds.length < f.accents.length &&
      ['quan', 'huien', 'phuong', 'xa', 'tinh', 'thanh', 'thi'].includes(folds[0]);
    if (!adminHead || !qr.marked || f.accents[0]?.tone === qr.toks[0]?.tone) {
      // Chỉ là "gõ dở để tự hoàn thành" (mạnh) khi chữ CUỐI mới gõ dở một từ của tên («dai t» → «Đại Từ»). Gõ đủ các từ rồi
      // mà tên còn dài hơn («Phước Mỹ» → «Phước Mỹ Trung») có thể là tên CŨ/đã đổi của nơi khác: vẫn hiện nhưng không tự chọn.
      const nameWord = f.norm.split(' ')[folds.length - 1] ?? '';
      take({ tier: 1, how: nameWord.length > folds[folds.length - 1].length ? 'name' : 'words', full: true });
    }
  }
  if (compactOk && f.compact.startsWith(compact)) take({ tier: 1, how: 'compact', full: true });
  const consecutiveOk = hasConsecutiveWordsPrefix(f.words, folds);
  const zoneInOrderOk = t.kind === 'zone' && hasInOrderWords(f.words, folds);
  if (
    (consecutiveOk || zoneInOrderOk) &&
    (!qr.marked ||
      !f.words.length ||
      !(
        folds.length >= 2 &&
        ['quan', 'huien', 'phuong', 'xa', 'tinh', 'thanh', 'thi'].includes(folds[0]) &&
        f.accents[0]?.tone !== qr.toks[0]?.tone
      ))
  ) {
    take({ tier: 2, how: 'words', full: true });
  } else if (hasExactUnorderedWords(f, folds) && (!qr.marked || formAccentsMatch(f, qr.toks))) {
    take({ tier: 2, how: 'words', full: true });
  }
  if (compactOk && folds.length === 1 && compact.length >= 4 && f.starts.some((s) => s > 0 && f.compact.startsWith(compact, s))) {
    take({ tier: 2, how: 'compact', full: true });
  }

  if (folds.length >= 2 && (t.provinceWords.length > 0 || t.provinceAliases.length > 0)) {
    for (let k = 1; k < folds.length; k++) {
      const left = folds.slice(0, k);
      const right = folds.slice(k);
      const leftToks = qr.toks.slice(0, k);
      const rightToks = qr.toks.slice(k);
      // «<xã> <tỉnh>» hoặc «<tỉnh> <xã>»
      for (const [nameToks, provToks, provRawToks] of [
        [left, right, rightToks],
        [right, left, leftToks],
      ] as const) {
        const level = provinceLevel(t.provinceWords, t.provinceAliases, provToks);
        if (level === 0) continue;
        const full = level === 2;
        const nameStr = nameToks.join(' ');
        if (!full) {
          if (f.subset || !provincePrefixAccentsOk(t, provRawToks)) continue;
          const partialMatch =
            f.norm === nameStr ||
            (nameToks.length === 1 && /^\d+$/.test(nameStr) && hasConsecutiveWordsPrefix(f.words, nameToks));
          if (!partialMatch) continue;
        } else {
          const wordsOk =
            f.norm === nameStr ||
            (!f.subset && f.norm.startsWith(nameStr)) ||
            hasConsecutiveWordsPrefix(f.words, nameToks) ||
            hasExactUnorderedWords(f, nameToks);
          if (!wordsOk) continue;
        }
        // Tên tỉnh chưa gõ ĐỦ chỉ để thu hẹp (hạng 3), không bao giờ mạnh.
        take({ tier: !full ? 3 : f.norm === nameStr ? 0 : f.norm.startsWith(nameStr) ? 1 : 3, how: 'split', full });
      }
    }
  }
  return best;
}

/**
 * Độ lệch DẤU so với cái đã gõ: chỉ tính khi phần tên của câu gõ có dấu ở BẤT KỲ chữ nào (đã gõ có dấu thì chữ không
 * dấu cũng là chủ ý: «Thanh Xuân» ≠ «Thạnh Xuân»). Mỗi từ gõ mà không từ nào của TÊN khớp (đầu từ + đúng dấu thanh)
 * tính 1. Dấu của tên TỈNH chỉ được xét khi khớp nhờ tách «tên + tỉnh»: nếu không, «my» khớp «Minh» của Hồ Chí Minh
 * và «cứu» dấu thiếu của «Phú My» cho riêng xã ở tỉnh đó.
 */
function accentMisses(t: SearchTarget, qr: Query, matched: FormMatch): number {
  if (!qr.marked) return 0;
  // Chỉ dấu của cách viết ĐÃ KHỚP (không phải mọi cách viết): «bai» không dấu mà khớp «bay» (y≡i) trong «Sân bay Nội Bài»
  // sẽ "cứu" dấu thiếu của «Nội bai» riêng cho điểm đặc biệt.
  const pools = [matched.form.accents];
  if (matched.how === 'split') pools.push(t.provinceAccents);
  let miss = 0;
  for (const tok of qr.toks) {
    if (!pools.some((pool) => pool.some((w) => w.base.startsWith(tok.base) && w.tone === tok.tone))) miss += 1;
  }
  return miss;
}

/** Hoà thì cái HẸP hơn lên trước (↓ đầu tiên không rơi vào «Cả tỉnh»): điểm đặc biệt, quận/huyện cũ, xã/phường, rồi cả tỉnh. */
const KIND_ORDER: Record<SearchTargetKind, number> = { zone: 0, legacy_district: 1, ward: 2, province: 3 };

type Ranked = {
  t: SearchTarget;
  tier: number;
  subset: number;
  how: How;
  full: boolean;
  miss: number;
  spell: number;
  legacySpread: number;
  note?: string;
};

function rank(
  index: SearchTarget[],
  qr: Query,
  only: SearchTargetKind[] | null,
  includeLegacyDistricts: boolean,
): Ranked[] {
  const hits: Ranked[] = [];
  for (const t of index) {
    if (!includeLegacyDistricts && t.kind === 'legacy_district') continue;
    if (only && !only.includes(t.kind)) continue;
    let best = null as FormMatch | null;
    for (const f of t.forms) {
      const m = formMatch(f, qr, t);
      if (m && isBetter(m, best)) best = m;
    }
    if (best === null) continue;
    // Chỉ để XẾP THỨ TỰ khi hoà (không ảnh hưởng `confident`): chính tả đúng như đã gõ lên trước.
    const spell = t.forms.some((f) => f.typed === qr.spelled) ? 0 : t.forms.some((f) => f.typed.startsWith(qr.spelled)) ? 1 : 2;
    const subset = best.form.subset ? 1 : 0;
    hits.push({
      t,
      tier: best.tier,
      subset,
      how: best.how,
      full: best.full,
      miss: accentMisses(t, qr, best),
      spell,
      legacySpread: best.form.legacySpread ?? 0,
      note: best.form.legacyNote,
    });
  }
  hits.sort(
    (a, b) =>
      a.tier - b.tier ||
      a.subset - b.subset ||
      a.miss - b.miss ||
      a.spell - b.spell ||
      KIND_ORDER[a.t.kind] - KIND_ORDER[b.t.kind] ||
      a.legacySpread - b.legacySpread ||
      (a.t.sortName < b.t.sortName ? -1 : a.t.sortName > b.t.sortName ? 1 : 0) ||
      (a.t.sortProvince < b.t.sortProvince ? -1 : a.t.sortProvince > b.t.sortProvince ? 1 : 0),
  );
  // Nếu nguyên câu khớp ĐÚNG tên một tỉnh/tỉnh cũ (vd "hà nam", "quảng nam", "hà nội"), loại bỏ các gợi ý tách chữ kiểu
  // "<xã ngắn> + <đầu tên tỉnh>" (`split` chưa gõ đủ tên tỉnh) để tránh kéo hàng chục xã không liên quan.
  if (hits.some((h) => h.t.kind === 'province' && h.tier === 0 && (h.how === 'name' || h.how === 'compact'))) {
    return hits.filter((h) => !(h.how === 'split' && !h.full));
  }
  return hits;
}

/**
 * Khớp MẠNH (đủ tin để TỰ chọn): nguyên tên hoặc đầu tên; gõ liền nguyên tên; nguyên tên + ĐỦ tên tỉnh. Gõ liền nhiều
 * từ, tên tỉnh gõ dở, mọi từ rải rác trong tên… không bao giờ mạnh.
 */
function isStrong(h: Ranked): boolean {
  if (h.how === 'name') return h.tier <= 1;
  if (h.how === 'compact') return h.tier === 0;
  if (h.how === 'split') return h.tier === 0 && h.full;
  return false;
}

/**
 * Tìm trong chỉ mục.
 *
 * Tiền tố hành chính («xã Đại Từ», «tỉnh Thanh Hóa») được hiểu như BỘ LỌC LOẠI, trừ khi cách gõ nguyên văn đã khớp
 * TÊN trực tiếp, mạnh (nguyên tên hoặc đầu tên — vd «Tĩnh Túc», «Xà Phìn»: tên thật bắt đầu bằng chữ giống tiền tố).
 */
export function searchTargets(
  index: SearchTarget[],
  rawQuery: string,
  maxOrOpts: number | { max?: number; includeLegacyDistricts?: boolean } = WARD_SEARCH_MAX_RESULTS,
): SearchOutcome {
  const max = typeof maxOrOpts === 'number' ? maxOrOpts : (maxOrOpts?.max ?? WARD_SEARCH_MAX_RESULTS);
  const includeLegacyDistricts = typeof maxOrOpts === 'object' && Boolean(maxOrOpts?.includeLegacyDistricts);
  const runTokens = (toks: Tok[]): { hits: Ranked[]; filtered: boolean; prefix: ReturnType<typeof detectPrefix> } => {
    const prefix = detectPrefix(toks.map((t) => t.fold));
    // Dấu chỉ tính ở phần TÊN (sau tiền tố): «phường ba dinh» / «xã ba dinh» gõ «phường/xã» có dấu theo thói quen nhưng
    // tên không dấu vẫn là gõ không dấu — kẻo ép chọn «Ba Dinh» (Quảng Ngãi) thay vì «Ba Đình» (Hà Nội).
    const nameMarked = toks.slice(prefix?.rest ?? 0).some((t) => t.marked);
    const literal = makeQuery(toks, nameMarked);
    if (literal.compact.length < WARD_SEARCH_MIN_CHARS) {
      return { hits: [], filtered: false, prefix };
    }

    let hits = rank(index, literal, null, includeLegacyDistricts);
    let filtered = false;
    if (prefix && !(hits.length > 0 && hits[0].how === 'name' && isStrong(hits[0]) && hits[0].subset === 0)) {
      const stripped = makeQuery(toks.slice(prefix.rest), nameMarked);
      if (stripped.compact.length >= WARD_SEARCH_MIN_CHARS) {
        const byType = rank(index, stripped, prefix.only, includeLegacyDistricts);
        if (byType.length > 0) {
          hits = byType;
          filtered = true;
        }
      }
    }
    return { hits, filtered, prefix };
  };

  const rawToks = tokenize(rawQuery);
  const compactTotal = rawToks.reduce((sum, t) => sum + t.fold.length, 0);
  if (compactTotal < WARD_SEARCH_MIN_CHARS) {
    return { ...EMPTY, tooShort: rawQuery.trim() !== '' };
  }

  const lastTok = rawToks[rawToks.length - 1];
  const explicitLegacySuffix = rawToks.length >= 2 && lastTok.spelled === 'cũ';
  let legacySuffix = explicitLegacySuffix;
  let { hits, filtered, prefix } = runTokens(explicitLegacySuffix ? rawToks.slice(0, -1) : rawToks);

  // Fallback khi gõ không dấu "... cu" (vd "ha nam cu", "binh duong cu"):
  // trên dữ liệu 3.321 xã thật, tỉnh nào cũng có xã chứa chữ bắt đầu bằng "cư/cú/củ" ("Cúc Phương", "Củ Chi", "Hội Cư"...)
  // nên lượt literal ra hit yếu (split / tier >= 2). Chỉ bỏ "cu" khi KHÔNG có khớp tên trực tiếp mạnh (`tier <= 1 && how !== 'split'`),
  // nhờ vậy "lung cu" / "tra cu" / "hoi cu" / "an cu" vẫn giữ nguyên còn "ha nam cu" / "tien giang cu" ra đúng tỉnh cũ.
  if (
    !explicitLegacySuffix &&
    rawToks.length >= 2 &&
    lastTok.spelled === 'cu' &&
    (hits.length === 0 || hits[0].how === 'split' || hits[0].tier >= 2)
  ) {
    const fallback = runTokens(rawToks.slice(0, -1));
    if (fallback.hits.length > 0 && fallback.hits[0].tier <= 1) {
      hits = fallback.hits;
      filtered = fallback.filtered;
      prefix = fallback.prefix;
      legacySuffix = true;
    }
  }
  if (hits.length === 0) return EMPTY;

  // Nếu không có tiền tố xã/phường mà nguyên câu khớp NGUYÊN tên tỉnh/tỉnh cũ (vd "Bà Rịa - Vũng Tàu" = tỉnh cũ, đồng thời
  // tình cờ tách được thành xã "Bà Rịa" + "Vũng Tàu"), đưa Cả tỉnh lên trước và không cho tự chọn xã đơn lẻ.
  let wholeProvinceAmbiguous = false;
  if (!filtered && hits[0].how === 'split') {
    const wholeProvIdx = hits.findIndex((h) => h.t.kind === 'province' && h.tier === 0 && h.how === 'name');
    if (wholeProvIdx > 0) {
      const [provHit] = hits.splice(wholeProvIdx, 1);
      hits.unshift(provHit);
      wholeProvinceAmbiguous = true;
    }
  }

  const first = hits[0];
  let tied = 1;
  while (
    tied < hits.length &&
    hits[tied].tier === first.tier &&
    hits[tied].subset === first.subset &&
    hits[tied].miss === first.miss
  ) {
    tied += 1;
  }
  const tiedSameName = tied > 1 && hits.slice(0, tied).every((h) => h.t.sortName === first.t.sortName);

  // Tự chọn chỉ khi dòng đầu thắng RÕ, khớp MẠNH và dấu đã gõ khớp hoàn toàn. Một kết quả duy nhất nhưng yếu hay lệch
  // dấu («quan 1» ra «Móng Cái 1» chỉ vì "quan" là đầu từ của «Quảng Ninh») thì vẫn phải do người dùng chọn.
  let confident =
    !wholeProvinceAmbiguous &&
    tied === 1 &&
    isStrong(first) &&
    first.miss === 0 &&
    first.subset === 0;
  // Khi bộ chọn có cả quận/huyện cũ (`MacroPlacePicker`), một xã trùng tên ("Phường Cầu Giấy", "Phường Hải Dương", "Phường Vĩnh Phúc")
  // KHÔNG được tự chọn đè lên quận/tỉnh cũ khớp nguyên tên ở ngay bên dưới — để người dùng tự bấm chọn đúng cấp.
  if (
    confident &&
    includeLegacyDistricts &&
    !filtered &&
    first.t.kind === 'ward' &&
    hits.some(
      (h, idx) =>
        idx > 0 &&
        h.tier === 0 &&
        h.miss === 0 &&
        (h.t.kind === 'legacy_district' || h.t.kind === 'province'),
    )
  ) {
    confident = false;
  }
  // Gõ "... cũ" mà không tách "<xã> <tỉnh>" (vd "Hải Dương cũ" trùng xã "Hải Dương") thì cũng KHÔNG tự chọn bừa.
  if (legacySuffix && (first.t.kind === 'province' || first.how !== 'split')) confident = false;
  if (filtered && prefix) {
    // Qua bộ lọc tiền tố chỉ tự chọn khi khớp NGUYÊN tên («tp Vinh» KHÔNG được ra «Cả tỉnh Vĩnh Long» chỉ vì
    // "vinh" là đầu tên); «tp/thành phố X» của tỉnh không trực thuộc trung ương là thành phố CŨ, không phải cả tỉnh.
    if (first.tier !== 0) confident = false;
    if (prefix.city && first.t.kind === 'province' && !first.t.isCity) confident = false;
  }
  const topHits = hits.slice(0, max);
  const matchNotes: Record<string, string> = {};
  for (const h of topHits) {
    if (h.note && h.subset === 1) {
      matchNotes[h.t.key] = h.note;
    }
  }
  return {
    results: topHits.map((h) => h.t),
    ...(Object.keys(matchNotes).length > 0 ? { matchNotes } : {}),
    total: hits.length,
    tooShort: false,
    confident,
    tied,
    tiedSameName,
  };
}

/**
 * Chữ đã gõ ở ô «Tìm nhanh» mà chưa chọn kết quả nào: nó KHÔNG vào danh sách, nên bên đó có thể thành «MỌI NƠI»
 * mà admin không để ý. Trả câu mô tả (để ghép sau tên bên) hoặc null nếu ô trống. KHÔNG lặp lại chữ đã gõ: câu này
 * nằm trong vùng thông báo (aria-live), đổi theo từng phím sẽ làm trình đọc màn hình bị ngắt liên tục.
 */
export function pendingQuickSearch(query: string): string | null {
  return query.trim() ? 'đang gõ ở ô «Tìm nhanh» mà chưa chọn kết quả nào' : null;
}
