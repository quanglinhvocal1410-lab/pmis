/**
 * Mô hình dữ liệu của webapp — Star Schema PMIS VUDP-HCM.
 *
 * Hỗ trợ toàn bộ 13 Dim + 10 Fact theo chuẩn Star Schema mới,
 * đồng thời tương thích ngược với các tên cột có tiền tố/hậu tố khác.
 */
import { num, toDate, toISO, fold, groupBy, sortBy, uniq } from './core.js';

export const TABLE = {
  DuAn: 'Dim_DuAn',
  GoiThau: 'Dim_GoiThau',
  HopDong: 'Dim_HopDong',
  NhaThau: 'Dim_NhaThau',
  TuVan: 'Dim_TuVan',
  ThoiGian: 'Dim_ThoiGian',
  HoSo: 'Dim_HoSo',
  BOQ: 'Dim_BOQ',
  HoatDong: 'Dim_HoatDong',
  DieuKhoan: 'Dim_DieuKhoan',
  CongViec: 'Dim_CongViec',
  TrangThai: 'Dim_TrangThai',
  RuiRo: 'Dim_RuiRo',
  TienDo: 'Fact_TienDo',
  ThanhToan: 'Fact_ThanhToan',
  GiaiNgan: 'Fact_GiaiNgan',
  NganSach: 'Fact_NganSach',
  EVM: 'Fact_EVM',
  CongViecEvent: 'Fact_CongViec',
  HopDongEvent: 'Fact_HopDong_Event',
  PhatSinh: 'Fact_PhatSinh',
  RuiRoEvent: 'Fact_RuiRo',
  TrangThaiHoSo: 'Fact_TrangThai_HoSo'
};

export const state = {
  loaded: false,
  source: '',
  generatedAt: '',
  spreadsheetUrl: '',
  meta: [],
  tables: {},
  asOf: null,

  projects: [],
  packages: [],
  contracts: [],
  contractors: [],
  consultants: [],
  statuses: [],
  progress: [],
  payments: [],
  disbursement: [],
  evm: [],
  tasks: [],
  docs: [],
  boq: [],
  activities: [],
  clauses: [],
  risks: [],
  budget: [],
  variations: [],
  riskEvents: [],

  byId: {},
  extraTables: []
};

const rows = (data, name) => (data.tables && data.tables[name]) || [];

/** Nạp payload từ api.fetchBootstrap vào `state`. */
export function hydrate(data, config) {
  state.source = data.source || '';
  state.generatedAt = data.generatedAt || '';
  state.spreadsheetUrl = data.spreadsheetUrl || '';
  state.meta = data.meta || [];
  state.tables = data.tables || {};

  state.projects = rows(data, TABLE.DuAn).map(mapProject);
  state.packages = rows(data, TABLE.GoiThau).map(mapPackage);
  state.contracts = rows(data, TABLE.HopDong).map(mapContract);
  state.contractors = rows(data, TABLE.NhaThau).map(mapContractor);
  state.consultants = rows(data, TABLE.TuVan).map(mapConsultant);
  state.statuses = rows(data, TABLE.TrangThai).map(mapStatus);
  state.progress = rows(data, TABLE.TienDo).map(mapProgress);
  state.payments = rows(data, TABLE.ThanhToan).map(mapPayment);
  state.disbursement = rows(data, TABLE.GiaiNgan).map(mapDisb);
  state.evm = rows(data, TABLE.EVM).map(mapEvm);
  state.tasks = (rows(data, TABLE.CongViec).length ? rows(data, TABLE.CongViec) : rows(data, TABLE.CongViecEvent)).map(mapTask);
  state.docs = rows(data, TABLE.HoSo).map(mapDoc);
  state.boq = rows(data, TABLE.BOQ).map(mapBOQ);
  state.activities = rows(data, TABLE.HoatDong).map(mapActivity);
  state.clauses = rows(data, TABLE.DieuKhoan).map(mapClause);
  state.risks = rows(data, TABLE.RuiRo).map(mapRiskMaster);
  state.budget = rows(data, TABLE.NganSach).map(mapBudget);
  state.variations = rows(data, TABLE.PhatSinh).map(mapVariation);
  state.riskEvents = rows(data, TABLE.RuiRoEvent).map(mapRiskEvent);

  // Index 2 chiều (bằng cả ID khóa chính lẫn Mã rút gọn)
  const prjMap = {};
  for (const pr of state.projects) {
    if (pr.id) prjMap[pr.id] = pr;
    if (pr.code) prjMap[pr.code] = pr;
  }

  const pkgMap = {};
  for (const p of state.packages) {
    if (p.id) pkgMap[p.id] = p;
    if (p.code) pkgMap[p.code] = p;
  }

  const conMap = {};
  for (const c of state.contracts) {
    if (c.id) conMap[c.id] = c;
    if (c.no) conMap[c.no] = c;
  }

  const ntrMap = {};
  for (const n of state.contractors) {
    if (n.id) ntrMap[n.id] = n;
  }

  const tvMap = {};
  for (const t of state.consultants) {
    if (t.id) tvMap[t.id] = t;
  }

  state.byId = {
    project: prjMap,
    package: pkgMap,
    contract: conMap,
    contractor: ntrMap,
    consultant: tvMap
  };

  // Bảng lạ do người dùng thêm vào sheet — vẫn xem được ở trang Dữ liệu thô
  const known = new Set(Object.values(TABLE));
  state.extraTables = Object.keys(state.tables).filter((t) => !known.has(t) && !t.startsWith('0_'));

  state.asOf = resolveAsOf(config);
  linkUp();
  state.loaded = true;
  return state;
}

/**
 * Ngày chốt số liệu.
 */
function resolveAsOf(config) {
  if (config && !config.autoAsOf && config.asOf) {
    const d = toDate(config.asOf);
    if (d) return d;
  }
  const marks = [
    ...state.evm.map((r) => r.period),
    ...state.progress.map((r) => r.period),
    ...state.disbursement.map((r) => r.period),
    ...state.payments.map((r) => r.paidDate || r.requestDate)
  ].filter(Boolean);
  if (!marks.length) return new Date();
  return marks.reduce((a, b) => (a > b ? a : b));
}

/** Gắn tham chiếu 2 chiều giữa các thực thể sau khi đã có đủ index. */
function linkUp() {
  const byPkg = groupBy(state.progress, 'packageId');
  const payByPkg = groupBy(state.payments, 'packageId');
  const disbByPkg = groupBy(state.disbursement, 'packageId');
  const evmByPkg = groupBy(state.evm, 'packageId');
  const taskByPkg = groupBy(state.tasks, 'packageId');
  const docByPkg = groupBy(state.docs, 'packageId');
  const conByPkg = groupBy(state.contracts, 'packageId');
  const boqByPkg = groupBy(state.boq, 'packageId');
  const actByPkg = groupBy(state.activities, 'packageId');
  const varByPkg = groupBy(state.variations, 'packageId');
  const riskByPkg = groupBy(state.riskEvents, 'packageId');

  for (const p of state.packages) {
    p.project = state.byId.project[p.projectId] || null;
    p.contractor = state.byId.contractor[p.contractorId] || null;
    p.consultant = state.byId.consultant[p.consultantId] || null;
    
    const pkgCons = conByPkg.get(p.id) || conByPkg.get(p.code) || [];
    p.contracts = pkgCons;
    p.contract = pkgCons[0] || null;

    const pkgProg = byPkg.get(p.id) || byPkg.get(p.code) || [];
    p.progress = sortBy(pkgProg, (r) => r.activityId || r.period || 0);

    const pkgPay = payByPkg.get(p.id) || payByPkg.get(p.code) || [];
    p.payments = sortBy(pkgPay, (r) => r.requestDate || r.ipc || 0);

    const pkgDisb = disbByPkg.get(p.id) || disbByPkg.get(p.code) || [];
    p.disbursement = sortBy(pkgDisb, (r) => r.period || 0);

    const pkgEvm = evmByPkg.get(p.id) || evmByPkg.get(p.code) || [];
    p.evm = sortBy(pkgEvm, (r) => r.period || 0);

    p.tasks = taskByPkg.get(p.id) || taskByPkg.get(p.code) || [];
    p.docs = docByPkg.get(p.id) || docByPkg.get(p.code) || [];
    p.boq = boqByPkg.get(p.id) || boqByPkg.get(p.code) || [];
    p.activities = actByPkg.get(p.id) || actByPkg.get(p.code) || [];
    p.variations = varByPkg.get(p.id) || varByPkg.get(p.code) || [];
    p.risks = riskByPkg.get(p.id) || riskByPkg.get(p.code) || [];

    p.hasData = !!(p.evm.length || p.progress.length || p.payments.length);
  }

  for (const c of state.contracts) {
    c.package = state.byId.package[c.packageId] || null;
    c.contractor = state.byId.contractor[c.contractorId] || null;
  }
  for (const t of state.tasks) t.package = state.byId.package[t.packageId] || null;
  for (const d of state.docs) d.package = state.byId.package[d.packageId] || null;
  for (const p of state.payments) {
    p.package = state.byId.package[p.packageId] || null;
    p.contract = state.byId.contract[p.contractId] || null;
  }
  for (const pr of state.projects) {
    pr.packages = state.packages.filter((p) => p.projectId === pr.id || p.projectId === pr.code);
  }
}

// ------------------------------------------------------------- MAPPERS

function mapProject(r) {
  return {
    row: r,
    id: r.IDDuAn || r.ID_Du_An,
    code: r.MaDuAn || r.Ma_Du_An,
    name: r.TenDuAn || r.Ten_Du_An,
    fund: r.NguonVon || r.Nguon_Von,
    owner: r.ChuDauTu || r.Chu_Dau_Tu,
    pmu: r.BanQLDA || r.Ban_QLDA,
    location: r.DiaDiem || r.Dia_Diem,
    donor: r.NhaTaiTro || r.Nha_Tai_Tro,
    tmdt: num(r.TongMucDauTu_VND || r.Tong_Muc_Dau_Tu),
    tmdtUSD: num(r.TongMucDauTu_USD),
    start: toDate(r.NgayKhoiCong || r.Ngay_Bat_Dau),
    finish: toDate(r.NgayHoanThanhKeHoach || r.Ngay_Ket_Thuc_DK),
    approvedDate: toDate(r.NgayPheDuyet),
    phase: r.GiaiDoan || r.Giai_Doan,
    status: r.TrangThai || r.Trang_Thai,
    note: r.GhiChu || r.Ghi_Chu
  };
}

function mapPackage(r) {
  const pId = r.IDGoiThau || r.ID_Goi_Thau;
  const pCode = r.MaGoiThau || r.Ma_Goi_Thau;
  const pName = r.TenGoiThau || r.Ten_Goi_Thau;
  return {
    row: r,
    id: pId,
    code: pCode,
    name: pName,
    shortName: String(pName || '').replace(/^[A-Z]{2}-\d+:\s*/, ''),
    projectId: r.IDDuAn || r.ID_Du_An,
    fund: r.NguonVon || r.Nguon_Von,
    procurement: r.HinhThucLuaChonNhaThau || r.Hinh_Thuc_Lua_Chon_NT,
    contractType: r.LoaiHopDong || r.Loai_Hop_Dong,
    contractorId: r.IDNhaThau || r.NhaThau_ID,
    consultantId: r.IDTuVanGiamSat || r.ID_Tu_Van,
    designerId: r.IDTuVanThietKe,
    start: toDate(r.NgayKhoiCongKeHoach || r.Ngay_Khoi_Cong),
    finish: toDate(r.NgayHoanThanhKeHoach || r.Ngay_Hoan_Thanh_HD),
    warrantyMonths: num(r.ThoiHanBaoHanh_Thang || r.Thoi_Gian_Bao_Hanh_Thang),
    budget: num(r.GiaGoiThau_VND || r.Du_Toan_Duyet || r.GiaTriHopDong_VND || r.Gia_Hop_Dong),
    packagePrice: num(r.GiaGoiThau_VND),
    bidPrice: num(r.GiaTrungThau_VND),
    contractValue: num(r.GiaTriHopDong_VND || r.Gia_Hop_Dong),
    contingency: num(r.Du_Phong || 0),
    currentValue: num(r.GiaTriHopDong_VND || r.Gia_Tri_HD_Hien_Tai || r.Gia_Hop_Dong),
    phase: r.GiaiDoanVongDoi || r.Giai_Doan_Vong_Doi,
    risk: r.Muc_Do_Rui_Ro || (r.TrangThai === 'Đang thi công' ? 'Trung bình' : 'Thấp'),
    status: r.TrangThai || r.Trang_Thai,
    manager: r.NguoiPhuTrach,
    driveFolderUrl: r.URLThuMucDrive,
    note: r.GhiChu
  };
}

function mapContract(r) {
  return {
    row: r,
    id: r.IDHopDong || r.Hop_Dong_ID,
    no: r.SoHopDong || r.So_Hop_Dong,
    name: r.TenHopDong || r.Ten_Hop_Dong,
    packageId: r.IDGoiThau || r.ID_Goi_Thau,
    contractorId: r.IDNhaThau || r.NhaThau_ID,
    type: r.LoaiVanBan || r.Loai_Hop_Dong,
    parentContractId: r.IDHopDongGoc,
    value: num(r.GiaTri_VND || r.Gia_Hop_Dong),
    signed: toDate(r.NgayKy || r.Ngay_Ky),
    ntp: toDate(r.NgayHieuLuc || r.Ngay_Khoi_Cong_NTP),
    finish: toDate(r.NgayKetThuc || r.Ngay_Hoan_Thanh),
    extensionDays: num(r.Gia_Han_Ngay || 0),
    forecastFinish: toDate(r.NgayKetThuc || r.Ngay_Hoan_Thanh_Du_Bao),
    advancePct: num(r.TamUng_Percent || r.Tam_Ung_Pct),
    retentionPct: num(r.GiuLaiBaoHanh_Percent || r.Giu_Lai_Pct),
    perfBondPct: num(r.Bao_Lanh_Thuc_Hien_Pct || 0.05),
    perfBondExpiry: toDate(r.Ngay_HL_Bao_Lanh_TH),
    insuranceExpiry: toDate(r.Ngay_HL_Bao_Hiem),
    warrantyMonths: num(r.Thoi_Han_Bao_Hanh_Thang || 24),
    dnpMonths: num(r.DNP_Thang || 12),
    ldPctPerDay: num(r.Phat_Cham_TD_Pct_Ngay || 0.0005),
    status: r.TrangThai || r.Trang_Thai,
    baseDocId: r.IDHoSoNguon || r.ID_Ho_So_Goc,
    url: r.URLDrive || r.Google_Drive_URL,
    paymentTerms: r.DieuKienThanhToan,
    partyA: r.ChuTheKyA,
    partyB: r.ChuTheKyB,
    note: r.GhiChu
  };
}

function mapContractor(r) {
  return {
    row: r,
    id: r.IDNhaThau || r.NhaThau_ID,
    name: r.TenNhaThau || r.Ten_Nha_Thau,
    shortName: r.TenViet_Tat,
    type: r.LoaiNhaThau,
    taxCode: r.MaSoThue || r.Ma_So_Thue,
    country: r.QuocGia || r.Quoc_Gia,
    rep: r.NguoiDaiDien || r.Nguoi_Dai_Dien,
    phone: r.DienThoai || r.Dien_Thoai,
    email: r.Email,
    address: r.DiaChi || r.Dia_Chi,
    expertise: r.NangLuc_ChuyenMon,
    completedProjects: num(r.SoDuAnDaLam),
    note: r.GhiChu
  };
}

function mapConsultant(r) {
  return {
    row: r,
    id: r.IDTuVan || r.ID_Tu_Van,
    name: r.TenTuVan || r.Ten_Tu_Van,
    type: r.LoaiTuVan || r.Loai_Tu_Van,
    country: r.QuocGia,
    taxCode: r.MaSoThue,
    rep: r.NguoiDaiDien || r.Nguoi_Dai_Dien,
    teamLeader: r.TruongDoan,
    phone: r.DienThoai || r.Dien_Thoai,
    email: r.Email,
    address: r.DiaChi,
    expertise: r.ChuyenMon,
    note: r.GhiChu
  };
}

function mapStatus(r) {
  return {
    row: r,
    id: r.IDTrangThai || r.ID_Trang_Thai,
    group: r.NhomTrangThai || r.Nhom,
    code: r.IDTrangThai || r.Ma_Trang_Thai,
    name: r.TenTrangThai || r.Ten_Trang_Thai,
    color: String(r.MauHex || r.Mau_Sac || '').toUpperCase(),
    order: num(r.ThuTuSapXep || r.Thu_Tu),
    desc: r.MoTa
  };
}

function mapProgress(r) {
  const plannedPct = num(r.TienDo_KeHoach_Percent !== undefined ? r.TienDo_KeHoach_Percent : r.Pct_Ke_Hoach);
  const actualPct = num(r.TienDo_ThucTe_Percent !== undefined ? r.TienDo_ThucTe_Percent : r.Pct_Thuc_Te);
  return {
    row: r,
    id: r.IDBanGhi || r.ID_Tien_Do,
    packageId: r.IDGoiThau || r.ID_Goi_Thau,
    activityId: r.IDHoatDong || r.ID_Hoat_Dong,
    boqId: r.IDHangMucBOQ,
    name: r.Ten_Hoat_Dong || r.IDHoatDong || r.IDHangMucBOQ || 'Hạng mục thi công',
    period: toDate(r.IDNgayBaoCao || r.KyBaoCao || r.Ky_Bao_Cao),
    periodLabel: r.KyBaoCao,
    planStart: toDate(r.KH_Bat_Dau),
    planFinish: toDate(r.KH_Ket_Thuc),
    actStart: toDate(r.TT_Bat_Dau),
    actFinish: toDate(r.TT_Ket_Thuc),
    forecastFinish: toDate(r.Du_Bao_Ket_Thuc),
    plannedPct,
    actualPct,
    variancePct: r.SaiLech_Percent !== undefined && r.SaiLech_Percent !== ''
      ? num(r.SaiLech_Percent)
      : (r.Sai_Lech_Pct !== undefined && r.Sai_Lech_Pct !== '' ? num(r.Sai_Lech_Pct) : actualPct - plannedPct),
    periodQty: num(r['KhoiLuong_ThucHien_Kỳ'] || r.KhoiLuong_ThucHien_Ky || 0),
    cumQty: num(r.KhoiLuong_LuyKe || 0),
    periodValue: num(r.GiaTri_ThucHien_KyVND || 0),
    cumValue: num(r.GiaTri_LuyKe_VND || 0),
    updated: toDate(r.NgayCapNhat),
    owner: r.NguoiCapNhat || r.Nguoi_Phu_Trach,
    docId: r.IDHoSoNguon || r.ID_Ho_So,
    note: r.GhiChu
  };
}

function mapPayment(r) {
  return {
    row: r,
    id: r.IDThanhToan || r.ThanhToan_ID,
    packageId: r.IDGoiThau || r.ID_Goi_Thau,
    contractId: r.IDHopDong || r.Hop_Dong_ID,
    contractorId: r.IDNhaThau || r.NhaThau_ID,
    ipc: r.SoDot !== undefined ? r.SoDot : r.Dot_Thanh_Toan,
    type: r.LoaiThanhToan || r.Loai_Thanh_Toan || 'Nghiệm thu khối lượng',
    requestDate: toDate(r.IDNgayTrinh || r.Ngay_De_Nghi),
    certDate: toDate(r.IDNgayDuyet || r.Ngay_Chung_Nhan),
    paidDate: toDate(r.IDNgayThanhToan || r.Ngay_Thanh_Toan),
    requested: num(r.GiaTri_DeNghi_VND || r.Gia_Tri_De_Nghi),
    certified: num(r.GiaTri_ChungNhan_VND || r.Gia_Tri_Chung_Nhan),
    approved: num(r.GiaTri_DuocDuyet_VND || r.Gia_Tri_Chung_Nhan),
    paid: num(r.GiaTri_ThanhToan_ThucVND || r.Gia_Tri_Thanh_Toan),
    advanceRecovery: num(r.TamUng_KhauTru_VND || r.Thu_Hoi_Tam_Ung),
    retention: num(r.GiuLai_BaoHanh_VND || r.Giu_Lai),
    taxDeduction: num(r.Thue_KhauTru_VND || 0),
    penalty: num(r.PhatLD_VND || 0),
    remaining: num(r.Gia_Tri_Con_Lai || 0),
    status: r.TrangThai || r.Trang_Thai,
    acceptanceDocId: r.IDHoSoNghiemThu,
    paymentDocId: r.IDHoSoThanhToan,
    docId: r.IDHoSoThanhToan || r.IDHoSoNghiemThu || r.ID_Ho_So,
    note: r.GhiChu
  };
}

function mapDisb(r) {
  return {
    row: r,
    id: r.IDBanGhi || r.ID_Giai_Ngan,
    packageId: r.IDGoiThau || r.ID_Goi_Thau,
    projectId: r.IDDuAn || r.ID_Du_An,
    contractId: r.IDHopDong || r.Hop_Dong_ID,
    period: toDate(r.IDNgay || r.Ky || r.KyBaoCao),
    periodLabel: r.KyBaoCao,
    fund: r.NguonVon || r.Nguon_Von,
    planMonth: num(r.KeHoachThang_VND || r.KH_Thang),
    planCum: num(r.KeHoachLuyKe_VND || r.KH_Luy_Ke),
    actMonth: num(r.ThucTeThang_VND || r.TT_Thang),
    actCum: num(r.ThucTeLuyKe_VND || r.TT_Luy_Ke),
    variance: num(r.SaiLech_VND || r.Sai_Lech),
    rate: num(r.TyLeHoanThanh_KH),
    note: r.GhiChu
  };
}

function mapEvm(r) {
  return {
    row: r,
    id: r.IDBanGhi || r.ID_EVM,
    packageId: r.IDGoiThau || r.ID_Goi_Thau,
    period: toDate(r.IDNgay || r.Ky_Bao_Cao),
    periodLabel: r.KyBaoCao,
    bac: num(r.BAC_VND || r.BAC),
    pv: num(r.PV_VND || r.PV),
    ev: num(r.EV_VND || r.EV),
    ac: num(r.AC_VND || r.AC),
    sv: num(r.SV_VND || r.SV),
    cv: num(r.CV_VND || r.CV),
    spi: num(r.SPI),
    cpi: num(r.CPI),
    eac: num(r.EAC_VND || r.EAC),
    etc: num(r.ETC_VND || r.ETC),
    vac: num(r.VAC_VND || r.VAC),
    dataStatus: r.TrangThai_DuLieu || r.Trang_Thai_Du_Lieu,
    note: r.GhiChu || r.Ghi_Chu
  };
}

function mapTask(r) {
  return {
    row: r,
    id: r.IDCongViec || r.ID_Cong_Viec || r.IDSuKien,
    title: r.TieuDe || r.Task_Title || r.MoTa,
    packageId: r.IDGoiThau || r.ID_Goi_Thau,
    contractId: r.IDHopDong || r.Hop_Dong_ID_LQ,
    clauseId: r.IDDieuKhoanLienQuan || r.Clause_ID_LQ,
    docId: r.IDHoSoLienQuan || r.ID_Ho_So_LQ,
    paymentId: r.IDThanhToanLienQuan || r.ThanhToan_ID_LQ,
    priority: r.MucDoUuTien || r.Muc_Uu_Tien || 'Bình thường',
    status: r.TrangThai || r.Trang_Thai || r.TrangThai_Sau || 'Đang xử lý',
    start: toDate(r.NgayBatDau || r.Ngay_Bat_Dau),
    due: toDate(r.HanChot || r.Ngay_Han),
    owner: r.NguoiPhuTrach || r.Nguoi_Phu_Trach || r.Owner_Sau,
    desc: r.MoTa || r.Mo_Ta,
    created: toDate(r.NgayTao || r.Ngay_Tao || r.IDNgaySuKien),
    done: toDate(r.NgayHoanThanh || r.Ngay_Hoan_Thanh),
    source: r.NguonTao,
    note: r.GhiChu
  };
}

function mapDoc(r) {
  return {
    row: r,
    id: r.IDHoSo || r.ID_Ho_So,
    projectId: r.IDDuAn || r.ID_Du_An,
    packageId: r.IDGoiThau || r.ID_Goi_Thau,
    contractId: r.IDHopDong || r.Hop_Dong_ID,
    group: r.NhomHoSo || r.Nhom_Ho_So,
    type: r.LoaiHoSo || r.Loai_Ho_So,
    content: r.TieuDe || r.Noi_dung || r.SoHieu,
    title: r.TieuDe || r.Noi_dung,
    ref: r.SoHieu || r.So_Hieu,
    rev: r.PhienBan || r.Phien_Ban,
    issued: toDate(r.NgayPhatHanh || r.Ngay_Phat_Hanh),
    effective: toDate(r.NgayHieuLuc || r.Ngay_Hieu_Luc),
    status: r.TrangThai || r.Trang_Thai,
    party: r.DonViPhatHanh || r.Ben_Chiu_Trach_Nhiem,
    url: r.DuongDanDrive || r.Google_Drive_URL,
    fileId: r.MaFileDrive || r.File_ID,
    ocr: r.TrangThaiOCR || r.Trang_Thai_OCR,
    ai: r.TrangThaiTrichXuatAI || r.Trang_Thai_AI,
    updated: toDate(r.NgayCapNhat || r.Cap_Nhat_Cuoi)
  };
}

function mapBOQ(r) {
  return {
    row: r,
    id: r.IDHangMucBOQ,
    packageId: r.IDGoiThau,
    contractId: r.IDHopDong,
    chapter: r.MaChuong,
    itemCode: r.MaHangMuc,
    desc: r.MoTa,
    unit: r.DonVi,
    qty: num(r.KhoiLuong_HD),
    unitPrice: num(r.DonGia_HD),
    totalPrice: num(r.ThanhTien_HD),
    costGroup: r.NhomChiPhi,
    note: r.GhiChu
  };
}

function mapActivity(r) {
  return {
    row: r,
    id: r.IDHoatDong,
    packageId: r.IDGoiThau,
    wbs: r.MaWBS,
    name: r.TenHoatDong,
    parentId: r.IDHoatDongCha,
    level: num(r.CapDo),
    type: r.LoaiHoatDong,
    boqId: r.IDHangMucBOQLienQuan,
    planStart: toDate(r.NgayBatDauBaseline),
    planFinish: toDate(r.NgayKetThucBaseline),
    durationDays: num(r.ThoiLuong_Ngay),
    weightPct: num(r.TrongSo_Percent),
    pvValue: num(r.GiaTriKeHoach_PV),
    owner: r.NguoiPhuTrach,
    status: r.TrangThai
  };
}

function mapClause(r) {
  return {
    row: r,
    id: r.IDDieuKhoan,
    contractId: r.IDHopDong,
    packageId: r.IDGoiThau,
    clauseNo: r.SoDieu,
    title: r.TieuDe,
    type: r.LoaiDieuKhoan,
    obligationA: r.NghiaVuBenA,
    obligationB: r.NghiaVuBenB,
    deadline: toDate(r.HanChotThucHien),
    status: r.TrangThai,
    docId: r.IDHoSoNguon,
    page: r.TrangSoTrong_File,
    aiConfidence: num(r.DoTinCay_AI),
    aiSummary: r.PhienDich_AI,
    note: r.GhiChu
  };
}

function mapRiskMaster(r) {
  return {
    row: r,
    id: r.IDRuiRo,
    group: r.NhomRuiRo,
    name: r.TenRuiRo,
    desc: r.MoTa,
    impact: r.TacDongTiemAn,
    severityDefault: r.MucDoTacDong_MacDinh,
    probDefault: r.XacSuat_MacDinh,
    prevention: r.BienPhapPhongNgua,
    contingency: r.BienPhapUngPho,
    owner: r.NguoiPhuTrach_MacDinh
  };
}

function mapBudget(r) {
  return {
    row: r,
    id: r.IDBanGhi,
    packageId: r.IDGoiThau,
    contractId: r.IDHopDong,
    year: num(r.NamKeHoach),
    fund: r.NguonVon,
    type: r.LoaiNganSach,
    amount: num(r.GiaTri_VND),
    approvedDate: toDate(r.NgayPheDuyet),
    decisionNo: r.SoQuyetDinh,
    docId: r.IDHoSoNguon,
    note: r.GhiChu
  };
}

function mapVariation(r) {
  return {
    row: r,
    id: r.IDPhatSinh,
    packageId: r.IDGoiThau,
    contractId: r.IDHopDong,
    appendixContractId: r.IDHopDongPhuLuc,
    type: r.LoaiPhatSinh,
    cause: r.NguyenNhan,
    desc: r.MoTa,
    foundDate: toDate(r.IDNgayPhatHien),
    requestDate: toDate(r.IDNgayDeNghi),
    approvedDate: toDate(r.IDNgayDuyet),
    requestedAmount: num(r.GiaTri_DeNghi_VND),
    approvedAmount: num(r.GiaTri_DuyetVND),
    status: r.TrangThai,
    docId: r.IDHoSoNguon,
    note: r.GhiChu
  };
}

function mapRiskEvent(r) {
  return {
    row: r,
    id: r.IDSuKien,
    riskId: r.IDRuiRo,
    packageId: r.IDGoiThau,
    contractId: r.IDHopDong,
    foundDate: toDate(r.IDNgayPhatHien),
    desc: r.MoTa_SuKien,
    severity: r.MucDoNghiemTrong,
    impactScore: num(r.TacDong_Diem),
    probScore: num(r.XacSuat_Diem),
    riskScore: num(r.Diem_RuiRo),
    source: r.NguonCanhBao,
    status: r.TrangThai,
    owner: r.NguoiPhuTrach,
    action: r.HanhDong_KhuyenNghi,
    taskId: r.IDCongViec_TaoRa,
    docId: r.IDHoSoNguon,
    aiTag: r.PhanLoai_AI,
    note: r.GhiChu
  };
}

// ---------------------------------------------------------- TRẠNG THÁI

const TONE_BY_COLOR = { GREEN: 'ok', AMBER: 'warn', RED: 'bad', GREY: 'mute', GRAY: 'mute', BLUE: 'brand' };

function hexToTone(hex) {
  if (!hex) return null;
  const h = hex.toUpperCase();
  if (TONE_BY_COLOR[h]) return TONE_BY_COLOR[h];
  if (h.includes('10B981') || h.includes('0F9D58') || h.includes('22C55E') || h.includes('43C07F')) return 'ok';
  if (h.includes('EF4444') || h.includes('D83A3A') || h.includes('F2706E') || h.includes('DC2626')) return 'bad';
  if (h.includes('F59E0B') || h.includes('D98200') || h.includes('E6A343') || h.includes('EAB308')) return 'warn';
  if (h.includes('3B82F6') || h.includes('135BEC') || h.includes('5B8CFF')) return 'brand';
  return null;
}

/**
 * Sắc thái hiển thị của một trạng thái, tra từ bảng Dim_TrangThai để màu
 * sắc trên giao diện do chính bảng tính quyết định. Trạng thái chưa khai
 * báo thì suy đoán theo từ khoá.
 */
export function tone(statusText, group) {
  const key = fold(statusText);
  if (!key) return 'mute';
  const hit = state.statuses.find(
    (s) => fold(s.name) === key && (!group || fold(s.group) === fold(group))
  ) || state.statuses.find((s) => fold(s.name) === key);
  
  if (hit) {
    const fromHex = hexToTone(hit.color);
    if (fromHex) return fromHex;
  }

  if (/(qua han|canh bao|cham|can bo sung|chua ky|chua xu ly|chua ocr|nghiem trong|cao)/.test(key)) return 'bad';
  if (/(dang|cho|tham tra|thuong thao|trung binh|can theo doi)/.test(key)) return 'warn';
  if (/(hoan thanh|da |dat|hieu luc|nhanh|chap thuan|du du lieu|tot|thap)/.test(key)) return 'ok';
  return 'mute';
}

/** Danh sách trạng thái đã khai báo của một nhóm, theo đúng thứ tự trong sheet. */
export function statusesOf(group) {
  return sortBy(state.statuses.filter((s) => fold(s.group) === fold(group)), (s) => s.order);
}

export function packageOptions() {
  return sortBy(state.packages, (p) => p.code || p.id);
}

export function distinct(list, field) {
  return uniq(list.map((r) => r[field])).sort((a, b) =>
    String(a).localeCompare(String(b), 'vi')
  );
}

export function isoAsOf() {
  return toISO(state.asOf);
}
