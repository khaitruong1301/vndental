# Database — ClinicCybersoftDB

PostgreSQL 17 (container `postgres` trong `docker-compose.yml`). Thiết kế từ [use-case.md](../requirements/use-case.md).

| Mục | Giá trị |
|---|---|
| Database | `ClinicCybersoftDB` (tên có chữ hoa → khi viết SQL phải để trong ngoặc kép) |
| Owner / admin | `KhaiAdmin` (owner của DB, không phải superuser cluster). Mật khẩu: biến `CLINIC_DB_PASSWORD` trong `.env` |
| Collation | ICU `vi-VN` (sắp xếp tên tiếng Việt) |
| Timezone | `Asia/Ho_Chi_Minh` |
| Script | `database/00…03_*.sql`, chạy bằng `./database/init.sh` (idempotent) |
| Dữ liệu mẫu | `database/04_sample_data.sql`, nạp bằng `./database/init.sh --sample` (chỉ khi bảng `staff` rỗng). Mốc thời gian quanh 03/11/2026; mật khẩu mọi tài khoản mẫu: `Clinic@123` |

Connection string: `postgresql://KhaiAdmin:<CLINIC_DB_PASSWORD>@localhost:5432/ClinicCybersoftDB` — ký tự `%` trong mật khẩu phải mã hóa thành `%25`.

## Bảng theo nhóm use case

| Nhóm | Bảng | Use case |
|---|---|---|
| Tài khoản | `roles` (Quản lý kế thừa Lễ tân qua `parent_role_id`), `permissions` (mã = mã UC), `role_permissions`, `staff` | UC-00, QT-05 |
| Danh mục | `chairs`, `services`, `items` (vật tư + thuốc), `service_material_norms`, `cancel_reasons` | QT-03 |
| Bảng giá | `service_prices`, `item_prices` — theo `effective_from`, giá đã hiệu lực không sửa/xóa được | QT-02, TT-02 |
| Ca trực | `doctor_shifts` | QT-01 |
| Bệnh nhân | `patients` (SĐT không unique), `patient_guardians`, `patient_documents` | BN-01…06 |
| Lịch hẹn | `appointments` (1 bản ghi = 1 khung 30', nhóm bằng `booking_group_id`), `appointment_reminders` | LH-01…09 |
| Điều trị | `treatment_records`, `treatment_record_items` (số răng FDI + bác sĩ thực hiện), `prescription_items`, `treatment_record_materials` | DT-01…08 |
| Liệu trình | `treatment_plans`, `treatment_plan_installments` | DT-04, DT-05 |
| Kho | `stock_movements` (chỉ ghi thêm), `notifications` | QT-04, DT-06, DT-07 |
| Thanh toán | `invoices`, `invoice_items` (giá chụp + giảm giá cấp dòng), `payments`, `cash_closings`, `invoice_adjustments` | TT-01…08 |
| Nhật ký | `audit_logs` (trước/sau dạng jsonb) | DT-09 |

## Luật nghiệp vụ được DB tự đảm bảo

- **LH-07**: exclusion constraint chặn trùng ghế / trùng bác sĩ (bỏ qua lịch đã hủy); trigger chặn lịch ngoài ca trực; khung phải tròn :00/:30 và dài 30 phút.
- **DT-06/DT-07**: thêm/sửa/xóa `treatment_record_materials` và `prescription_items` (không mua ngoài) tự sinh `stock_movements` → cập nhật `items.current_stock`; vừa xuống dưới `min_stock` thì tạo `notifications` cho Quản lý.
- **TT-04**: `invoices.total_amount / paid_amount / balance_due / status` do trigger tính; không cho thu vượt số còn nợ, không thu trên hóa đơn đã hủy.
- **TT-07**: sau khi chốt két, mọi lần thu của ca đó bị khóa; không chốt được ca chưa bắt đầu.
- **TT-03/TT-08**: hóa đơn đã có lần thu thì chỉ Quản lý đổi được giảm giá, bắt buộc lý do, ghi `invoice_adjustments` loại `ADJUST`.
- **UC-00/QT-05**: `staff.token_version` tự tăng (trigger) khi đổi mật khẩu hoặc khóa tài khoản → JWT cũ hết hiệu lực.
- **Giả định 9**: không xóa `patients`, `appointments`, `treatment_records`, `invoices`, `cash_closings`, `invoice_adjustments`.
- **DT-09**: `audit_logs` ghi INSERT/UPDATE/DELETE các bảng điều trị, lịch hẹn, hóa đơn, thanh toán, giá.

## Hàm nghiệp vụ

| Hàm | UC |
|---|---|
| `fill_material_norms(record_id)` — điền vật tư theo định mức (giữ số thực dùng đã chỉnh) | DT-06 |
| `create_invoice_from_treatment_record(record_id, staff_id[, issued_at])` — phiếu phải ở `PENDING_PAYMENT`; giá lấy theo ngày `issued_at` (mặc định now) | TT-01, TT-02 |
| `create_invoice_for_treatment_plan(plan_id, staff_id[, issued_at])` | DT-05, TT-04 |
| `apply_invoice_discount(invoice_id, amount, reason, staff_id)` — phân bổ theo tỷ lệ, làm tròn đồng | TT-03 |
| `void_invoice(invoice_id, reason, manager_id)` — chỉ Quản lý | TT-08 |
| `close_cash_drawer(receptionist_id, work_date, shift, counted, note)` | TT-07 |
| `get_service_price(service_id, date)`, `get_item_price(item_id, date)` | TT-02 |
| `fmt_qty(numeric)` — số lượng dạng Việt Nam cho thông báo (`1.50` → `1,5`) | DT-07, QT-04 |

Migration cho DB đã tạo: `database/migrations/` (áp bằng `psql -f` cho cả DB chính và DB test).

## View báo cáo

`v_waiting_queue` (DT-01), `v_role_effective_permissions`, `rpt_doctor_revenue_monthly` (BC-01), `rpt_chair_utilization` (BC-02), `rpt_inactive_patients` (BC-03), `rpt_cancellation_stats` (BC-04), `rpt_patient_debts` (BC-05), `rpt_treatment_plans_in_progress` (BC-06), `rpt_low_stock_items` (BC-07), `rpt_monthly_revenue` (BC-08).

## Quy ước cho ứng dụng

- Đầu mỗi transaction: `SET LOCAL app.staff_id = '<id>'` (và `SET LOCAL app.change_reason = '...'` khi sửa phiếu/hóa đơn) để audit log và phát sinh kho ghi đúng người.
- Đặt lịch nhiều khung (implant…): insert nhiều dòng `appointments` cùng `booking_group_id`; check-in/hủy cập nhật cả nhóm.
- Lần thu tiền: `work_date`/`shift` để trống thì DB tự suy ra từ `paid_at` (trước 14:00 = ca sáng).
- Chưa seed tài khoản nhân viên — cần tạo Quản lý đầu tiên (hash mật khẩu ở tầng ứng dụng).
