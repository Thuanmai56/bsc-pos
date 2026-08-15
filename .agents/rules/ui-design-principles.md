# Triết Lý Thiết Kế Giao Diện (UI/UX Design Philosophy)

Khi thực hiện thiết kế, chỉnh sửa layout, CSS hoặc thêm tính năng mới trên giao diện web, luôn tuân thủ nghiêm ngặt thứ tự ưu tiên thiết bị sau:

### 1. Bảng Quản Lý Đơn Hàng (`orders.html` / `orders.css` / Dashboard POS)
- **Ưu tiên 1 (Chính - Tablet-first)**: 
  - Tối ưu trải nghiệm sử dụng trên **Tablet / iPad** (màn hình cảm ứng đặt tại quầy của quán).
  - Nút bấm, thao tác chạm to rõ, dễ bấm nhanh bằng ngón tay, modal/popup và layout dạng cột/lưới tối ưu cho tỷ lệ màn hình máy tính bảng ngang & dọc.
- **Ưu tiên 2**: Responsive hoàn chỉnh cho **Desktop / PC**.
- **Ưu tiên 3**: Responsive cho **Mobile**.
- **Nguyên tắc Đa Ngôn Ngữ (I18N Support)**:
  - `orders.html` hỗ trợ chuyển đổi đa ngôn ngữ (**繁體中文 `zh-TW`** và **Tiếng Việt `vi`**).
  - Mọi thành phần UI mới (nút bấm, tiêu đề, modal, thông báo alert, tooltip, placeholder) **BẮT BUỘC** phải khai báo đầy đủ key trong cả 2 từ điển `I18N["zh-TW"]` và `I18N["vi"]`, đồng thời ánh xạ trong hàm `applyLanguageToDOM()`.
  - **Tuyệt đối không pha trộn ngôn ngữ**: Từ điển `zh-TW` chỉ chứa tiếng Trung phồn thể thuần túy (không chèn thêm phụ đề/chú thích tiếng Việt như `(Mở quán)`), và từ điển `vi` chứa tiếng Việt chuẩn xác cho POS.

### 2. Trang Thực Đơn & Đặt Món Cho Khách (`index.html` / `index.css` / Menu LIFF)
- **Ưu tiên 1 (Chính - Mobile-first)**:
  - Tối ưu trải nghiệm sử dụng trên **Điện thoại di động (Mobile / LINE LIFF In-App Browser)**.
  - Thao tác 1 tay thuận tiện, cuộn mượt mà, layout dọc tinh gọn, giỏ hàng cố định dưới đáy màn hình, thời gian tải nhanh và giao diện thanh toán liền mạch.
- **Ưu tiên 2**: Responsive cho **Tablet & PC**.
