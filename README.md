# PMIS — Webapp trên Google Sheet `PMIS_Data_Demo`

Webapp quản lý dự án đầu tư xây dựng, đọc thẳng cấu trúc sao (star schema) của bảng tính
[`PMIS_Data_Demo`](https://docs.google.com/spreadsheets/d/1IgszZalQxQ2vS0JQqYnAii2BPhO2jIovqqupgpowSQY/edit).
Bảng tính vừa là cơ sở dữ liệu vừa là nơi khai báo logic (danh mục trạng thái, màu sắc);
webapp chỉ đọc – tính – trình bày, không giữ bản sao dữ liệu nào của riêng nó.

## Chạy nhanh

```bash
npm run web:data     # kết xuất snapshot.json từ Google Sheet (cần sheet mở quyền xem theo link)
npm run web          # http://localhost:5173
npm run web:test     # 117 phép tự kiểm tra, không cần trình duyệt
```

Không có bước build. Trình duyệt nạp thẳng ES module — nhưng vẫn phải chạy qua HTTP
(`npm run web`), mở `index.html` bằng `file://` sẽ bị chặn CORS.

## Hai chế độ dữ liệu

| Chế độ | Nguồn | Ghi được? | Khi nào dùng |
|---|---|---|---|
| **Offline** (mặc định) | `web/data/snapshot.json` | không | xem nhanh, trình chiếu, chạy không mạng |
| **Trực tiếp** | Apps Script Web App gắn với bảng tính | có | vận hành thật |

## Làm việc hai chiều

**Webapp → sheet.** Bấm vào bất kỳ dòng nào của bảng để mở bản ghi, rồi *Sửa*.
Biểu mẫu dựng từ hàng tiêu đề thật của sheet nên cột nào bạn thêm cũng có mặt; kiểu ô
(ngày / số / phần trăm / danh sách chọn / khoá ngoại) suy ra từ tên cột và dữ liệu đang có.
Các nút **+ Thêm** nằm ở đầu từng bảng. Ghi xong webapp tự đọc lại sheet để hiển thị đúng
những gì thật sự đã được lưu.

**Sheet → webapp.** Webapp hỏi Apps Script `action=rev` mỗi 15 giây — câu hỏi rất nhẹ vì
máy chủ không đọc ô nào, chỉ trả về dấu hiệu phiên bản. Dấu hiệu đổi thì mới tải lại toàn bộ
và vẽ lại, giữ nguyên vị trí cuộn; nếu bạn đang mở biểu mẫu thì dữ liệu mới được giữ ở dạng
"chờ" và chỉ áp khi bạn đóng biểu mẫu. Chỉ báo ở thanh trên cho biết trạng thái, bấm vào là
tải lại ngay.

Để bắt được cả những lần **sửa nội dung trong ô** (không đổi số dòng), bật trigger `onChange`:
menu **PMIS → Bật tự động đồng bộ sang webapp** trên bảng tính, hoặc nút trong trang
**Cấu hình → Đồng bộ tự động**. Chưa bật thì webapp vẫn tải lại toàn bộ mỗi 2 phút.

Ghi vào ô do công thức mảng / `IMPORTRANGE` sinh ra sẽ bị Google chặn. Gặp trường hợp đó,
API tự lùi về ghi từng ô, bỏ qua đúng những cột bị khoá và báo tên chúng lên giao diện thay
vì làm hỏng cả thao tác.

Bật chế độ trực tiếp: mở bảng tính → **Tiện ích mở rộng → Apps Script**, dán
`apps-script/Code.gs`, triển khai dạng **Ứng dụng web** (thực thi: *Tôi*, truy cập:
*Bất kỳ ai*), rồi dán URL `/exec` vào trang **Cấu hình** của webapp. URL lưu ở
`localStorage` nên mỗi máy tự cấu hình.

## Bản đồ dữ liệu

12 sheet được nạp nguyên trạng; cột đầu tiên của mỗi sheet là khoá chính.

| Sheet | Vai trò trong webapp |
|---|---|
| `Dim_DuAn` | Thanh thông tin dự án ở trang Tổng quan |
| `Dim_GoiThau` | Danh sách gói thầu, giá trị hợp đồng, giai đoạn, rủi ro |
| `Dim_HopDong` | Điều khoản tiền, mốc bảo lãnh / bảo hiểm, cảnh báo hết hiệu lực |
| `Dim_NhaThau`, `Dim_TuVan` | Trang Danh mục |
| `Dim_TrangThai` | **Nguồn màu cho toàn bộ nhãn trạng thái** và thứ tự cột Kanban |
| `Fact_TienDo` | Bảng WBS + sơ đồ Gantt |
| `Fact_EVM` | BAC/PV/EV/AC → mọi chỉ số phái sinh |
| `Fact_GiaiNgan` | Đường cong giải ngân kế hoạch/thực tế |
| `Fact_ThanhToan` | Các đợt IPC, thu hồi tạm ứng, giữ lại |
| `Fact_CongViec` | Kanban công việc |
| `Fact_HoSo` | Tra cứu hồ sơ, tình trạng OCR/AI |

Bạn thêm cột mới ở hàng 1 → API tự trả về cột đó và ngăn kéo "bản ghi gốc" hiển thị ngay,
không cần sửa code. Thêm cả sheet mới → xem được ở trang **Cấu hình → Xem dữ liệu thô**.

## Chỉ số được tính lại trong webapp

Cột `Ghi_Chu` của `Fact_EVM` ghi *"SV/CV/SPI/CPI/EAC tính bằng DAX trong Power BI"*.
Webapp tính lại ngay trong trình duyệt từ bốn đại lượng gốc, nên không cần Power BI:

```
SV = EV − PV          CV = EV − AC
SPI = EV / PV         CPI = EV / AC        CSI = SPI × CPI
EAC = BAC / CPI       ETC = EAC − AC       VAC = BAC − EAC
TCPI = (BAC − EV) / (BAC − AC)
```

Ngoài ra: tạm ứng còn phải thu hồi, phần bị cắt giảm khi thẩm tra IPC, số ngày trượt
tiến độ từng hạng mục, và danh sách cảnh báo gộp (hợp đồng, tiến độ, chi phí, công việc,
hồ sơ).

### Ngày chốt số liệu

Dữ liệu mẫu dừng ở kỳ **31/08/2026**. Nếu đo theo ngày hệ thống thật thì mọi mốc đều hiện
"quá hạn", nên mặc định webapp lấy kỳ báo cáo mới nhất tìm được trong dữ liệu làm mốc.
Ghim ngày khác ở trang **Cấu hình → Ngày chốt số liệu**.

## Cấu trúc thư mục

```
pmis/
├── apps-script/       Code.gs — API đọc/ghi, suy schema từ hàng tiêu đề
├── web/
│   ├── index.html
│   ├── css/styles.css
│   ├── data/snapshot.json      (sinh ra bởi build-snapshot.js)
│   └── js/
│       ├── core.js     định dạng số/ngày kiểu VN + helper DOM
│       ├── api.js      hai nguồn dữ liệu, cấu hình localStorage
│       ├── store.js    nơi DUY NHẤT biết tên cột tiếng Việt
│       ├── calc.js     EVM và các chỉ số phái sinh
│       ├── charts.js   biểu đồ SVG tự viết (đường, cột, gauge, donut, Gantt)
│       ├── ui.js       thẻ KPI, bảng sắp xếp được, bộ lọc, ngăn kéo
│       ├── editor.js   biểu mẫu sửa/thêm/xoá dùng chung cho mọi bảng
│       ├── sync.js     hỏi định kỳ `rev`, tải lại khi sheet đổi
│       ├── main.js     khung + định tuyến bằng hash
│       └── views/      12 màn hình
└── tools/
    ├── build-snapshot.js   tải sheet → snapshot.json
    ├── serve.js            máy chủ tĩnh
    └── selftest.mjs        render mọi màn hình bằng DOM giả trong Node
```

## Xoá dữ liệu và nhập lại từ đầu

Trên bảng tính: menu **PMIS → ⚠ Xoá sạch dữ liệu các bảng Fact_***. Lệnh này cố ý **không**
mở qua HTTP — chỉ chạy được từ bảng tính, nơi còn Ctrl+Z. Nó xoá dòng dữ liệu của 6 bảng
`Fact_*`, giữ nguyên hàng tiêu đề và toàn bộ `Dim_*`.

Bản offline: `node pmis/tools/build-snapshot.js --empty-facts`. Bộ dữ liệu demo được giữ ở
`web/data/snapshot.demo.json` để đối chiếu và để bộ tự kiểm tra còn số mà so.

Trang **Nhập liệu** bày các bảng theo đúng thứ tự phải nhập (bảng tính không có ràng buộc
khoá ngoại), kèm mục **Soát dữ liệu** liệt kê những chỗ đang trỏ sai hoặc còn thiếu.

## Báo cáo

Trang **Báo cáo** dàn sẵn khổ A4 gồm 8 phần: thông tin chung, tổng hợp khối lượng/chi phí,
đường cong chữ S, tiến độ kèm Gantt, giải ngân, dòng tiền, hồ sơ, cảnh báo và kiến nghị —
kết lại bằng ba ô ký. Chọn phạm vi toàn dự án hoặc một gói thầu, bấm **In / Lưu PDF**
(Ctrl+P) rồi chọn máy in "Lưu dưới dạng PDF". Không có con số nào gõ tay; tất cả tính lại
từ dữ liệu thô tại thời điểm mở trang.

## Ghi chú kỹ thuật

- **POST phải dùng `Content-Type: text/plain`** — Apps Script không trả lời preflight CORS.
- Ngày trong file XLSX Google xuất ra bị lệch múi giờ; `build-snapshot.js` lấy theo chuỗi
  hiển thị `dd/MM/yyyy` của ô nên không lùi một ngày.
- Xoá bản ghi qua API là **xoá nội dung dòng**, không `deleteRow`, để không phá vỡ các
  công thức tham chiếu theo dòng trên bảng tính.
- Giao diện có 3 chế độ sáng/tối/tự động; màu khai báo dạng token trên `:root`.
