/**
 * Trình sửa bản ghi dùng chung cho MỌI bảng.
 *
 * Biểu mẫu được dựng từ hàng tiêu đề thật của sheet chứ không từ schema
 * cứng, nên cột nào bạn thêm trên bảng tính cũng xuất hiện ở đây. Kiểu ô
 * (ngày / số / phần trăm / danh sách chọn / khoá ngoại) được suy ra từ tên
 * cột và từ chính dữ liệu đang có.
 */
import { el, num, hasNum, toISO, fmtDate, fmtMoney, fmtPct, uniq } from './core.js';
import { state, TABLE, statusesOf } from './store.js';
import { createRow, updateRow, deleteRow, isReadOnly } from './api.js';
import { drawer, closeDrawer, defList, btn, toast, badge, empty } from './ui.js';
import { refreshNow } from './sync.js';

/**
 * Sau mỗi lần ghi, kéo lại dữ liệu từ bảng tính rồi vẽ lại — để những gì
 * hiện trên màn hình luôn là thứ đang thật sự nằm trong sheet, kể cả khi
 * công thức trên sheet tính lại các cột khác.
 */
async function defaultAfterWrite() {
  try {
    await refreshNow();
  } catch (e) {
    toast('Đã ghi xong nhưng chưa tải lại được: ' + e.message, 'bad');
  }
}

// Cột trỏ sang bảng khác → hiện danh sách chọn thay vì gõ tay mã.
const REFS = {
  ID_Du_An: TABLE.DuAn,
  IDDuAn: TABLE.DuAn,
  ID_Goi_Thau: TABLE.GoiThau,
  IDGoiThau: TABLE.GoiThau,
  Hop_Dong_ID: TABLE.HopDong,
  IDHopDong: TABLE.HopDong,
  IDHopDongGoc: TABLE.HopDong,
  IDHopDongPhuLuc: TABLE.HopDong,
  NhaThau_ID: TABLE.NhaThau,
  IDNhaThau: TABLE.NhaThau,
  ID_Tu_Van: TABLE.TuVan,
  IDTuVan: TABLE.TuVan,
  IDTuVanGiamSat: TABLE.TuVan,
  IDTuVanThietKe: TABLE.TuVan,
  ID_Ho_So: TABLE.HoSo,
  IDHoSo: TABLE.HoSo,
  IDHoSoNguon: TABLE.HoSo,
  IDHoSoNghiemThu: TABLE.HoSo,
  IDHoSoThanhToan: TABLE.HoSo,
  IDHoSoLienQuan: TABLE.HoSo,
  ThanhToan_ID: TABLE.ThanhToan,
  IDThanhToan: TABLE.ThanhToan,
  IDThanhToanLienQuan: TABLE.ThanhToan,
  ID_Cong_Viec: TABLE.CongViec,
  IDCongViec: TABLE.CongViec,
  IDCongViec_TaoRa: TABLE.CongViec,
  IDCongViecLienQuan: TABLE.CongViec,
  ID_Trang_Thai: TABLE.TrangThai,
  IDTrangThai: TABLE.TrangThai,
  IDHangMucBOQ: TABLE.BOQ,
  IDHangMucBOQLienQuan: TABLE.BOQ,
  IDHoatDong: TABLE.HoatDong,
  IDHoatDongCha: TABLE.HoatDong,
  IDDieuKhoan: TABLE.DieuKhoan,
  IDDieuKhoanLienQuan: TABLE.DieuKhoan,
  IDRuiRo: TABLE.RuiRo
};

// Nhóm trạng thái dùng cho cột Trang_Thai / TrangThai của từng bảng
const STATUS_GROUP = {
  [TABLE.GoiThau]: 'Gói thầu',
  [TABLE.HopDong]: 'Hợp đồng',
  [TABLE.ThanhToan]: 'Thanh toán',
  [TABLE.CongViec]: 'Công việc',
  [TABLE.CongViecEvent]: 'Công việc',
  Fact_CongViec: 'Công việc',
  Fact_HoSo: 'Hồ sơ',
  [TABLE.HoSo]: 'Hồ sơ',
  [TABLE.DieuKhoan]: 'Hợp đồng',
  [TABLE.RuiRo]: 'Rủi ro',
  [TABLE.RuiRoEvent]: 'Rủi ro',
  [TABLE.PhatSinh]: 'Hợp đồng'
};

const DATE_RE = /(^Ngay|_Ngay$|^Ky$|KyBaoCao|Ky_Bao_Cao|BatDau|KetThuc|HanChot|_Han$|HoanThanh|CapNhat|HieuLuc|PhatHanh|^IDNgay)/i;
const PCT_RE = /(Percent|_Pct$|^Pct_|_Pct_)/i;
const MONEY_RE = /(GiaTri|_VND$|_USD$|GiaGoiThau|GiaTrungThau|GiaTriHopDong|TongMucDauTu|^Gia_|_Gia$|Du_Toan|DuToan|Du_Phong|DuPhong|Tong_Muc|TongMuc|^BAC|^PV|^EV|^AC|^KH_|^TT_|Thu_Hoi|ThuHoi|Giu_Lai|GiuLai|Ngan_Sach|NganSach|^Sai_Lech|^SaiLech|^Du_Bao|^DuBao|_Luy_Ke|_LuyKe|TamUng_KhauTru|GiuLai_BaoHanh|Thue_KhauTru|PhatLD)/i;
const LONG_RE = /(Mo_Ta|MoTa|Ghi_Chu|GhiChu|Noi_dung|NoiDung|Ten_|Ten[A-Z]|TieuDe|NguyenNhan|BienPhap|NghiaVu|HanhDong)/i;

const viMoneyFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

export function formatMoneyInput(value) {
  if (value === null || value === undefined || value === '') return '';
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  const n = parseInt(digits, 10);
  return viMoneyFmt.format(n);
}

/** Danh sách cột của một bảng, lấy từ meta của API hoặc từ dòng đầu tiên. */
export function headersOf(table) {
  let headers = [];
  const meta = (state.meta || []).find((m) => m.name === table);
  if (meta && meta.headers && meta.headers.length) {
    const valid = meta.headers.filter((h) => h && h !== 'PK' && h !== 'FK' && h !== 'PFK' && !h.startsWith('Col_'));
    if (valid.length >= 2) headers = valid;
  }
  if (!headers.length) {
    const rows = state.tables[table] || [];
    headers = rows.length
      ? Object.keys(rows[0]).filter((k) => k !== '__row' && k !== 'PK' && k !== 'FK' && k !== 'PFK' && !k.startsWith('Col_'))
      : [];
  }
  if (table === TABLE.GoiThau || table === 'Dim_GoiThau') {
    const excluded = ['Loai_Hop_Dong', 'LoaiHopDong', 'Muc_Do_Rui_Ro', 'MucDoRuiRo', 'Trang_Thai', 'TrangThai'];
    headers = headers.filter((h) => !excluded.includes(h));
  }
  return headers;
}

export function idFieldOf(table) {
  return headersOf(table)[0] || '';
}

/** Suy kiểu ô nhập cho một cột. */
export function fieldMeta(table, header) {
  const idField = idFieldOf(table);
  if (header === idField) return { type: 'id' };

  const base = header.replace(/_(LQ|Goc)$/, '');
  if (REFS[base] && REFS[base] !== table) {
    return { type: 'ref', table: REFS[base] };
  }
  if (REFS[header] && REFS[header] !== table) {
    return { type: 'ref', table: REFS[header] };
  }
  if ((header === 'Trang_Thai' || header === 'TrangThai') && STATUS_GROUP[table]) {
    return { type: 'select', options: statusOptions(table, header, STATUS_GROUP[table]) };
  }
  if (header === 'Muc_Nghiem_Trong' || header === 'MucDoNghiemTrong') {
    return { type: 'select', options: statusOptions(table, header, 'Tiến độ') };
  }
  if (header === 'MucDoUuTien' || header === 'Muc_Uu_Tien') {
    return { type: 'select', options: statusOptions(table, header, 'Công việc') };
  }
  if (header === 'Trang_Thai_Du_Lieu' || header === 'TrangThai_DuLieu') {
    return { type: 'select', options: statusOptions(table, header, 'Dữ liệu') };
  }
  if (/URL$/i.test(header) || /Drive$/i.test(header) || /DuongDan/i.test(header)) return { type: 'url' };
  if (DATE_RE.test(header)) return { type: 'date' };
  if (PCT_RE.test(header)) return { type: 'percent' };
  if (MONEY_RE.test(header)) return { type: 'money' };
  if (LONG_RE.test(header)) return { type: 'longtext', suggest: suggestions(table, header) };

  // Cột số thuần (Nam, Thang, Thoi_Gian_Bao_Hanh_Thang…)
  const sample = (state.tables[table] || []).map((r) => r[header]).filter((v) => v !== '');
  if (sample.length && sample.every((v) => typeof v === 'number')) return { type: 'number' };

  return { type: 'text', suggest: suggestions(table, header) };
}

/**
 * Lựa chọn cho một cột trạng thái: hợp của những gì Dim_TrangThai khai báo
 * và những gì dữ liệu đang thực sự dùng — vì bảng danh mục có thể còn thiếu
 * (ví dụ "Chờ xử lý" có trong Fact_CongViec nhưng chưa khai ở Dim_TrangThai).
 */
function statusOptions(table, header, group) {
  const declared = statusesOf(group).map((s) => s.name);
  const used = uniq((state.tables[table] || []).map((r) => r[header]))
    .filter((v) => typeof v === 'string' && v);
  return [...declared, ...used.filter((v) => !declared.includes(v))];
}

/** Gợi ý các giá trị đã dùng, để gõ nhanh mà vẫn nhập tự do được. */
function suggestions(table, header) {
  const vals = uniq((state.tables[table] || []).map((r) => r[header]))
    .filter((v) => typeof v === 'string' && v.length <= 60);
  return vals.length && vals.length <= 25 ? vals.sort((a, b) => String(a).localeCompare(String(b), 'vi')) : null;
}

/** Nhãn hiển thị của một bản ghi thuộc bảng tham chiếu. */
function refLabel(table, id) {
  const rows = state.tables[table] || [];
  const idf = idFieldOf(table);
  const row = rows.find((r) => String(r[idf]) === String(id));
  if (!row) return id;
  const nameKey = Object.keys(row).find((k) => /^(Ten|SoHopDong|So_Hop_Dong|SoDot|Dot_Thanh_Toan|Noi_dung|NoiDung|TieuDe|Task_Title|MaWBS)/i.test(k));
  return nameKey ? `${id} — ${trim(row[nameKey], 48)}` : id;
}

function trim(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ------------------------------------------------------- XEM BẢN GHI

const LABEL_DICT = {
  IDDuAn: 'Mã dự án (IDDuAn)',
  MaDuAn: 'Mã hiệu dự án',
  TenDuAn: 'Tên dự án',
  ChuDauTu: 'Chủ đầu tư',
  BanQLDA: 'Ban QLDA',
  NguonVon: 'Nguồn vốn',
  NhaTaiTro: 'Nhà tài trợ',
  TongMucDauTu_VND: 'Tổng mức đầu tư (VNĐ)',
  TongMucDauTu_USD: 'Tổng mức đầu tư (USD)',
  NgayPheDuyet: 'Ngày phê duyệt',
  NgayKhoiCong: 'Ngày khởi công',
  NgayKhoiCongKeHoach: 'Ngày khởi công kế hoạch',
  NgayHoanThanhKeHoach: 'Ngày hoàn thành kế hoạch',
  GiaiDoan: 'Giai đoạn dự án',
  TrangThai: 'Trạng thái',
  IDGoiThau: 'Mã gói thầu (IDGoiThau)',
  MaGoiThau: 'Mã hiệu gói thầu (CW-..)',
  TenGoiThau: 'Tên gói thầu',
  LoaiHopDong: 'Loại hợp đồng',
  HinhThucLuaChonNhaThau: 'Hình thức lựa chọn NT',
  IDNhaThau: 'Nhà thầu phụ trách',
  IDTuVanGiamSat: 'Tư vấn giám sát',
  IDTuVanThietKe: 'Tư vấn thiết kế',
  GiaGoiThau_VND: 'Giá gói thầu (VNĐ)',
  GiaTrungThau_VND: 'Giá trúng thầu (VNĐ)',
  GiaTriHopDong_VND: 'Giá trị hợp đồng (VNĐ)',
  DuToanDuyet: 'Dự toán duyệt (VNĐ)',
  Du_Toan_Duyet: 'Dự toán duyệt (VNĐ)',
  GiaHopDong: 'Giá hợp đồng (VNĐ)',
  Gia_Hop_Dong: 'Giá hợp đồng (VNĐ)',
  DuPhong: 'Dự phòng (VNĐ)',
  Du_Phong: 'Dự phòng (VNĐ)',
  GiaTriHDHienTai: 'Giá trị HĐ hiện tại (VNĐ)',
  Gia_Tri_HD_Hien_Tai: 'Giá trị HĐ hiện tại (VNĐ)',
  ThoiHanBaoHanh_Thang: 'Thời hạn bảo hành (tháng)',
  GiaiDoanVongDoi: 'Giai đoạn vòng đời',
  NguoiPhuTrach: 'Người phụ trách',
  URLThuMucDrive: 'URL Thư mục Drive',
  IDHopDong: 'Mã hợp đồng (IDHopDong)',
  SoHopDong: 'Số hợp đồng',
  TenHopDong: 'Tên hợp đồng',
  LoaiVanBan: 'Loại văn bản',
  IDHopDongGoc: 'Hợp đồng gốc',
  NgayKy: 'Ngày ký hợp đồng',
  NgayHieuLuc: 'Ngày hiệu lực',
  NgayKetThuc: 'Ngày kết thúc',
  GiaTri_VND: 'Giá trị hợp đồng (VNĐ)',
  TamUng_Percent: 'Tỷ lệ tạm ứng (%)',
  GiuLaiBaoHanh_Percent: 'Giữ lại bảo hành (%)',
  DieuKienThanhToan: 'Điều kiện thanh toán',
  ChuTheKyA: 'Chủ thể ký bên A',
  ChuTheKyB: 'Chủ thể ký bên B',
  IDHoSoNguon: 'Hồ sơ nguồn gốc',
  URLDrive: 'Đường dẫn Google Drive',
  TenNhaThau: 'Tên nhà thầu',
  TenViet_Tat: 'Tên viết tắt',
  LoaiNhaThau: 'Loại nhà thầu',
  MaSoThue: 'Mã số thuế',
  NguoiDaiDien: 'Người đại diện',
  Email: 'Email liên hệ',
  DienThoai: 'Số điện thoại',
  DiaChi: 'Địa chỉ trụ sở',
  NangLuc_ChuyenMon: 'Năng lực chuyên môn',
  SoDuAnDaLam: 'Số dự án đã làm',
  TenTuVan: 'Tên đơn vị tư vấn',
  LoaiTuVan: 'Loại tư vấn',
  TruongDoan: 'Trưởng đoàn tư vấn',
  ChuyenMon: 'Chuyên môn',
  IDHangMucBOQ: 'Mã hạng mục BOQ',
  MaChuong: 'Mã chương BOQ',
  MaHangMuc: 'Mã hạng mục',
  MoTa: 'Mô tả chi tiết',
  DonVi: 'Đơn vị tính',
  KhoiLuong_HD: 'Khối lượng hợp đồng',
  DonGia_HD: 'Đơn giá hợp đồng (VNĐ)',
  ThanhTien_HD: 'Thành tiền hợp đồng (VNĐ)',
  NhomChiPhi: 'Nhóm chi phí',
  IDHoatDong: 'Mã hoạt động WBS',
  MaWBS: 'Mã phân cấp WBS',
  TenHoatDong: 'Tên hoạt động thi công',
  IDHoatDongCha: 'Mã hoạt động cha',
  CapDo: 'Cấp độ phân rã WBS',
  LoaiHoatDong: 'Loại hoạt động',
  IDHangMucBOQLienQuan: 'Hạng mục BOQ liên quan',
  NgayBatDauBaseline: 'Bắt đầu Baseline',
  NgayKetThucBaseline: 'Kết thúc Baseline',
  ThoiLuong_Ngay: 'Thời lượng (ngày)',
  TrongSo_Percent: 'Trọng số (%)',
  GiaTriKeHoach_PV: 'Giá trị kế hoạch PV (VNĐ)',
  IDDieuKhoan: 'Mã điều khoản',
  SoDieu: 'Số điều khoản',
  TieuDe: 'Tiêu đề',
  LoaiDieuKhoan: 'Loại điều khoản',
  NghiaVuBenA: 'Nghĩa vụ Bên A',
  NghiaVuBenB: 'Nghĩa vụ Bên B',
  HanChotThucHien: 'Hạn chót thực hiện',
  TrangSoTrong_File: 'Trang số trong tài liệu',
  DoTinCay_AI: 'Độ tin cậy AI (%)',
  PhienDich_AI: 'Tóm tắt / Phiên dịch AI',
  IDCongViec: 'Mã công việc',
  MucDoUuTien: 'Mức độ ưu tiên',
  NgayBatDau: 'Ngày bắt đầu',
  HanChot: 'Hạn chót hoàn thành',
  NgayTao: 'Ngày tạo',
  NgayHoanThanh: 'Ngày hoàn thành',
  NguonTao: 'Nguồn tạo',
  IDHoSoLienQuan: 'Hồ sơ liên quan',
  IDThanhToanLienQuan: 'Đợt thanh toán liên quan',
  IDDieuKhoanLienQuan: 'Điều khoản liên quan',
  IDTrangThai: 'Mã trạng thái',
  NhomTrangThai: 'Nhóm trạng thái',
  TenTrangThai: 'Tên trạng thái',
  MauHex: 'Mã màu HEX',
  ThuTuSapXep: 'Thứ tự sắp xếp',
  IDRuiRo: 'Mã rủi ro',
  NhomRuiRo: 'Nhóm rủi ro',
  TenRuiRo: 'Tên rủi ro',
  TacDongTiemAn: 'Tác động tiềm ẩn',
  MucDoTacDong_MacDinh: 'Mức tác động mặc định',
  XacSuat_MacDinh: 'Xác suất mặc định',
  BienPhapPhongNgua: 'Biện pháp phòng ngừa',
  BienPhapUngPho: 'Biện pháp ứng phó',
  IDBanGhi: 'Mã bản ghi',
  IDNgayBaoCao: 'Ngày báo cáo',
  KyBaoCao: 'Kỳ báo cáo',
  TienDo_KeHoach_Percent: 'Tiến độ kế hoạch (%)',
  TienDo_ThucTe_Percent: 'Tiến độ thực tế (%)',
  SaiLech_Percent: 'Sai lệch tiến độ (%)',
  KhoiLuong_ThucHien_Ky: 'Khối lượng thực hiện kỳ',
  KhoiLuong_LuyKe: 'Khối lượng luỹ kế',
  GiaTri_ThucHien_KyVND: 'Giá trị thực hiện kỳ (VNĐ)',
  GiaTri_LuyKe_VND: 'Giá trị luỹ kế (VNĐ)',
  NgayCapNhat: 'Ngày cập nhật',
  NguoiCapNhat: 'Người cập nhật',
  IDThanhToan: 'Mã đợt thanh toán',
  SoDot: 'Đợt thanh toán (IPC)',
  LoaiThanhToan: 'Loại thanh toán',
  IDNgayTrinh: 'Ngày trình hồ sơ',
  IDNgayDuyet: 'Ngày duyệt hồ sơ',
  IDNgayThanhToan: 'Ngày thanh toán thực tế',
  GiaTri_DeNghi_VND: 'Giá trị đề nghị (VNĐ)',
  GiaTri_ChungNhan_VND: 'Giá trị chứng nhận (VNĐ)',
  GiaTri_DuocDuyet_VND: 'Giá trị được duyệt (VNĐ)',
  TamUng_KhauTru_VND: 'Thu hồi tạm ứng (VNĐ)',
  GiuLai_BaoHanh_VND: 'Giữ lại bảo hành (VNĐ)',
  Thue_KhauTru_VND: 'Khấu trừ thuế (VNĐ)',
  PhatLD_VND: 'Phạt chậm tiến độ (VNĐ)',
  GiaTri_ThanhToan_ThucVND: 'Thực thanh toán (VNĐ)',
  IDHoSoNghiemThu: 'Hồ sơ nghiệm thu',
  IDHoSoThanhToan: 'Hồ sơ thanh toán',
  IDNgay: 'Mã ngày',
  KeHoachThang_VND: 'Kế hoạch tháng (VNĐ)',
  KeHoachLuyKe_VND: 'Kế hoạch luỹ kế (VNĐ)',
  ThucTeThang_VND: 'Thực tế tháng (VNĐ)',
  ThucTeLuyKe_VND: 'Thực tế luỹ kế (VNĐ)',
  SaiLech_VND: 'Sai lệch (VNĐ)',
  TyLeHoanThanh_KH: 'Tỷ lệ hoàn thành KH (%)',
  NamKeHoach: 'Năm kế hoạch',
  LoaiNganSach: 'Loại ngân sách',
  SoQuyetDinh: 'Số quyết định',
  BAC_VND: 'Tổng ngân sách BAC (VNĐ)',
  PV_VND: 'Giá trị kế hoạch PV (VNĐ)',
  EV_VND: 'Giá trị thu được EV (VNĐ)',
  AC_VND: 'Chi phí thực tế AC (VNĐ)',
  SV_VND: 'Độ lệch tiến độ SV (VNĐ)',
  CV_VND: 'Độ lệch chi phí CV (VNĐ)',
  SPI: 'Chỉ số hiệu suất tiến độ (SPI)',
  CPI: 'Chỉ số hiệu suất chi phí (CPI)',
  EAC_VND: 'Dự báo hoàn thành EAC (VNĐ)',
  ETC_VND: 'Dự báo còn lại ETC (VNĐ)',
  VAC_VND: 'Chênh lệch hoàn tất VAC (VNĐ)',
  TrangThai_DuLieu: 'Trạng thái dữ liệu EVM',
  IDHoSo: 'Mã hồ sơ',
  NhomHoSo: 'Nhóm hồ sơ',
  LoaiHoSo: 'Loại hồ sơ',
  SoHieu: 'Số hiệu văn bản',
  PhienBan: 'Phiên bản',
  NgayPhatHanh: 'Ngày phát hành',
  DonViPhatHanh: 'Đơn vị phát hành',
  DuongDanDrive: 'Đường dẫn Google Drive',
  MaFileDrive: 'Mã File Google Drive',
  TrangThaiOCR: 'Trạng thái OCR',
  TrangThaiTrichXuatAI: 'Trạng thái AI',
  IDPhatSinh: 'Mã phát sinh',
  IDHopDongPhuLuc: 'Hợp đồng phụ lục',
  LoaiPhatSinh: 'Loại phát sinh',
  NguyenNhan: 'Nguyên nhân phát sinh',
  IDNgayPhatHien: 'Ngày phát hiện',
  IDNgayDeNghi: 'Ngày đề nghị',
  IDNgayDuyet: 'Ngày duyệt',
  IDSuKien: 'Mã sự kiện',
  MoTa_SuKien: 'Mô tả sự kiện',
  MucDoNghiemTrong: 'Mức độ nghiêm trọng',
  TacDong_Diem: 'Điểm tác động (1-5)',
  XacSuat_Diem: 'Điểm xác suất (1-5)',
  Diem_RuiRo: 'Điểm rủi ro',
  NguonCanhBao: 'Nguồn cảnh báo',
  HanhDong_KhuyenNghi: 'Hành động khuyến nghị',
  IDCongViec_TaoRa: 'Công việc tạo ra',
  PhanLoai_AI: 'Phân loại AI',
  GhiChu: 'Ghi chú'
};

export function labelOf(h) {
  if (LABEL_DICT[h]) return LABEL_DICT[h];
  return h.replace(/_/g, ' ');
}

/**
 * Ngăn kéo xem một bản ghi, kèm nút Sửa/Xoá khi đang kết nối Apps Script.
 * Thay cho ui.rawRecord ở mọi chỗ có thể chỉnh sửa.
 */
export function openRecord(table, row, opts = {}) {
  const headers = headersOf(table);
  const idField = idFieldOf(table);
  const title = opts.title || String(row[headers[1]] || row[idField] || table);
  const subtitle = opts.subtitle || `${table} · ${row[idField]}`;

  const pairs = headers.map((h) => [labelOf(h), displayValue(table, h, row[h])]);

  const body = el('div', [
    defList(pairs),
    row.__row ? el('p.sub', `Dòng ${row.__row} trên bảng tính`) : null,
    isReadOnly()
      ? el('p.sub', 'Đang ở chế độ chỉ đọc — kết nối Apps Script ở trang Cấu hình để sửa trực tiếp.')
      : el('div.form-actions', [
        btn('Sửa bản ghi', () => openEditor(table, row, opts), 'primary'),
        btn('Xoá', () => confirmDelete(table, row, opts), 'danger')
      ])
  ]);

  drawer(title, body, subtitle);
}

function displayValue(table, header, value) {
  if (value === '' || value === null || value === undefined) return '—';
  const meta = fieldMeta(table, header);
  if (meta.type === 'date') return fmtDate(value);
  if (meta.type === 'percent') return fmtPct(value);
  if (meta.type === 'money') return fmtMoney(value);
  if (meta.type === 'url') {
    return el('a', { href: String(value), target: '_blank', rel: 'noopener' }, trim(value, 44));
  }
  if (meta.type === 'select') return badge(value, STATUS_GROUP[table]);
  if (meta.type === 'ref') return el('span', refLabel(meta.table, value));
  return String(value);
}

// -------------------------------------------------------- SỬA / THÊM

/**
 * Mở biểu mẫu. `row` rỗng nghĩa là tạo mới.
 * opts.defaults: giá trị điền sẵn (ví dụ gói thầu đang xem).
 */
export function openEditor(table, row, opts = {}) {
  if (isReadOnly()) {
    toast('Chế độ chỉ đọc — nhập URL Apps Script ở trang Cấu hình trước.', 'bad');
    return;
  }
  const headers = headersOf(table);
  if (!headers.length) {
    drawer('Không sửa được', empty(`Không đọc được cột của bảng ${table}.`));
    return;
  }
  const idField = headers[0];
  const isNew = !row || !row[idField];
  const data = { ...(opts.defaults || {}), ...(row || {}) };

  const inputs = {};
  const fields = headers.map((h) => buildField(table, h, data, isNew, inputs));
  const status = el('p.form-status');

  const save = async (e) => {
    const payload = {};
    for (const h of headers) {
      const v = readField(table, h, inputs[h]);
      if (v === undefined) continue;
      payload[h] = v;
    }
    if (!isNew) payload[idField] = data[idField];
    if (isNew && !payload[idField]) delete payload[idField]; // để máy chủ tự sinh mã

    e.target.disabled = true;
    status.className = 'form-status';
    status.textContent = 'Đang ghi vào bảng tính…';
    try {
      const res = isNew ? await createRow(table, payload) : await updateRow(table, payload);
      const skipped = (res && res.__skipped) || [];
      closeDrawer();
      toast(skipped.length
        ? `Đã lưu, nhưng bỏ qua cột khoá công thức: ${skipped.join(', ')}`
        : `Đã lưu ${res[idField] || payload[idField] || ''} vào ${table}`,
        skipped.length ? 'bad' : 'ok');
      await (opts.onSaved || defaultAfterWrite)(res);
    } catch (err) {
      status.className = 'form-status bad';
      status.textContent = err.message;
      e.target.disabled = false;
    }
  };

  drawer(
    isNew ? `Thêm bản ghi · ${table}` : `Sửa ${data[idField]}`,
    el('form.record-form', { onsubmit: (e) => e.preventDefault() }, [
      el('div.form-fields', fields),
      status,
      el('div.form-actions', [
        btn(isNew ? 'Thêm vào bảng tính' : 'Lưu thay đổi', save, 'primary'),
        btn('Huỷ', closeDrawer),
        !isNew ? btn('Xoá', () => confirmDelete(table, data, opts), 'danger') : null
      ])
    ]),
    isNew ? 'Mã sẽ được sinh tự động theo dãy sẵn có' : `${table} · dòng ${data.__row || '?'}`
  );
}

function buildField(table, header, data, isNew, inputs) {
  const meta = fieldMeta(table, header);
  const raw = data[header];
  let input;

  if (meta.type === 'id') {
    input = el('input', {
      type: 'text',
      value: raw || '',
      placeholder: isNew ? '(Mã tự sinh trên bảng tính Google Sheet)' : '',
      readonly: true,
      disabled: true
    });
  } else if (meta.type === 'date') {
    input = el('input', { type: 'date', value: toISO(raw) });
  } else if (meta.type === 'percent') {
    input = el('input', { type: 'number', step: '0.01', value: hasNum(raw) && raw !== '' ? num(raw) * 100 : '' });
  } else if (meta.type === 'money') {
    const initVal = hasNum(raw) ? formatMoneyInput(raw) : '';
    input = el('input', {
      type: 'text',
      inputmode: 'numeric',
      value: initVal,
      placeholder: '0 VNĐ',
      oninput: (e) => {
        const cursorPosition = e.target.selectionStart;
        const oldLength = e.target.value.length;
        const formatted = formatMoneyInput(e.target.value);
        e.target.value = formatted;
        const newLength = formatted.length;
        const newPos = Math.max(0, cursorPosition + (newLength - oldLength));
        try { e.target.setSelectionRange(newPos, newPos); } catch (_) {}
      }
    });
  } else if (meta.type === 'number') {
    input = el('input', { type: 'number', step: '1', value: raw === '' ? '' : num(raw) });
  } else if (meta.type === 'select') {
    input = el('select', [
      el('option', { value: '' }, '—'),
      ...meta.options.map((o) => el('option', { value: o, selected: o === raw }, o))
    ]);
  } else if (meta.type === 'ref') {
    const rows = state.tables[meta.table] || [];
    const idf = idFieldOf(meta.table);
    input = el('select', [
      el('option', { value: '' }, '—'),
      ...rows.map((r) => el('option', {
        value: r[idf], selected: String(r[idf]) === String(raw)
      }, refLabel(meta.table, r[idf])))
    ]);
  } else if (meta.type === 'longtext') {
    input = el('textarea', { rows: 3 }, String(raw ?? ''));
    input.value = String(raw ?? '');
  } else if (meta.type === 'url') {
    input = el('input', { type: 'url', value: raw || '', placeholder: 'https://…' });
  } else {
    const listId = `dl-${table}-${header}`.replace(/[^\w-]/g, '');
    input = el('input', { type: 'text', value: raw ?? '', list: meta.suggest ? listId : null });
    if (meta.suggest) {
      inputs['__list_' + header] = el('datalist', { id: listId },
        meta.suggest.map((s) => el('option', { value: s })));
    }
  }

  inputs[header] = input;
  return el('label.field', [
    el('span', labelOf(header) + (meta.type === 'percent' ? ' (%)' : '')),
    input,
    inputs['__list_' + header] || null
  ]);
}

/** Đọc giá trị khỏi ô nhập, trả về đúng kiểu để ghi xuống sheet. */
function readField(table, header, input) {
  if (!input) return undefined;
  const meta = fieldMeta(table, header);
  const v = input.value;

  if (meta.type === 'id') return v ? String(v).trim() : '';
  if (meta.type === 'date') return v ? v : '';
  if (meta.type === 'percent') return v === '' ? '' : Number(v) / 100;
  if (meta.type === 'money') {
    if (v === '' || v === null || v === undefined) return '';
    return num(v);
  }
  if (meta.type === 'number') return v === '' ? '' : Number(v);
  return typeof v === 'string' ? v.trim() : v;
}

function confirmDelete(table, row, opts) {
  const idField = idFieldOf(table);
  const id = row[idField];
  drawer('Xoá bản ghi', el('div', [
    el('p', [`Xoá `, el('strong', String(id)), ` khỏi bảng `, el('strong', table), '?']),
    el('p.sub', 'Nội dung dòng trên bảng tính sẽ bị xoá trắng (dòng vẫn giữ nguyên để không phá công thức tham chiếu). Không hoàn tác được từ webapp — dùng Ctrl+Z trên Google Sheets nếu cần.'),
    el('div.form-actions', [
      btn('Xoá hẳn', async (e) => {
        e.target.disabled = true;
        try {
          await deleteRow(table, id);
          closeDrawer();
          toast(`Đã xoá ${id}`);
          await (opts.onSaved || defaultAfterWrite)(null);
        } catch (err) {
          toast(err.message, 'bad');
          e.target.disabled = false;
        }
      }, 'danger'),
      btn('Không xoá nữa', closeDrawer)
    ])
  ]), `${table} · ${id}`);
}

/** Nút "Thêm" đặt ở đầu các bảng dữ liệu. */
export function addButton(table, opts = {}) {
  if (isReadOnly()) return null;
  return btn(opts.label || '+ Thêm', () => openEditor(table, null, opts));
}

/**
 * Trạng thái rỗng có lối đi tiếp: bảng chưa có dữ liệu thì mời nhập ngay
 * tại chỗ thay vì chỉ báo "không có gì".
 */
export function emptyWithAdd(table, msg, opts = {}) {
  return empty(msg, isReadOnly()
    ? el('span', [
      'Đang ở chế độ chỉ đọc — mở ',
      el('a', { href: '#/cau-hinh' }, 'trang Cấu hình'),
      ' để kết nối Apps Script rồi nhập trực tiếp.'
    ])
    : el('span.empty-actions', [
      addButton(table, opts),
      el('a.btn', { href: '#/nhap-lieu' }, 'Trang nhập liệu')
    ]));
}
