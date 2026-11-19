# W-FreshTrack v0.8 — Hệ thống Quản lý & Xử lý Hàng Tươi Sống

## Cách chạy
1. Giải nén thư mục `W-FreshTrack-v0.8`, giữ nguyên cấu trúc thư mục và tên file.
2. Mở terminal trong thư mục chứa `index.html`.
3. Chạy `python -m http.server 8000` (hoặc `python3 -m http.server 8000`).
4. Mở `http://localhost:8000/index.html` (hoặc dùng VS Code + Live Server).

## Các nâng cấp chính trong phiên bản v0.8
1. **Không giới hạn số lượng hình ảnh & Lưu trữ IndexedDB:**
   - Gỡ bỏ giới hạn 3 ảnh. Nhân viên có thể chụp hoặc chọn hàng chục ảnh liên tiếp.
   - Tự động nén ảnh sang định dạng WebP/JPEG nhẹ (~150–220 KB/ảnh) và **tự động đóng dấu thời gian thực + mã chi nhánh + tên sản phẩm** lên góc ảnh (thay thế hoàn toàn việc gửi ảnh qua Zalo).
   - Lưu trữ hình ảnh trong `IndexedDB` trên trình duyệt (vượt qua trần 5 MB của `localStorage`).
2. **Ghi nhận Ngày duyệt & Đẩy đơn mới duyệt lên đầu danh sách:**
   - Hiển thị cột `Ngày duyệt / Cập nhật` song song với `Ngày ghi nhận`.
   - Các đơn vừa được Quản lý khu vực phê duyệt tự động nổi lên đầu danh sách kèm nhãn `Mới duyệt`.
3. **Đăng nhập linh hoạt & Hướng dẫn vận hành tích hợp:**
   - Cửa hàng trưởng được nhập tên tự do, chọn chi nhánh WinMart và nhập mật khẩu (mặc định demo: `123456`).
   - Tích hợp nút **Hướng dẫn sử dụng** mô tả chi tiết luồng phối hợp 3 vai trò.
4. **Cải tiến giao diện & Nhập liệu:**
   - Sửa lỗi tràn số tiền tệ tại mục `02. Tổng hợp cuối ngày`.
   - Đánh số thứ tự (`01.` – `04.`), Việt hóa 100% nhãn giao diện và giữ các mục menu trên 1 dòng.
   - Hạ tone màu vàng bên Quản lý khu vực sang vàng hổ phách trầm ấm, dịu mắt.
   - Ô lọc ngày chuẩn `dd/mm/yyyy` hỗ trợ gõ tay mượt mà kết hợp lịch chọn nhanh.
   - Thêm tùy chọn `Phương án khác (tự nhập)` cho Cửa hàng trưởng và tình trạng `Khác` (tách riêng trên biểu đồ để không làm lệch thống kê chuẩn).
   - Làm nổi bật khung cảnh báo `Quy tắc an toàn bắt buộc` cho nhân viên.
