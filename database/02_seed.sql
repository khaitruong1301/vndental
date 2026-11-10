-- =============================================================================
-- 02. Dữ liệu danh mục nền (chỉ những gì đã chốt trong use-case.md)
-- Dịch vụ, bảng giá, thuốc, vật tư, tài khoản nhân viên: nhập qua ứng dụng.
-- =============================================================================
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO roles (code, name, description) VALUES
  ('RECEPTIONIST', 'Lễ tân',  'Tiếp nhận BN, lịch hẹn, nhắc lịch, lập hóa đơn, thu tiền, chốt két'),
  ('DOCTOR',       'Bác sĩ',  'Xem lịch, lập/sửa phiếu điều trị, kê thuốc, quản lý liệu trình, hẹn tái khám'),
  ('MANAGER',      'Quản lý', 'Ca trực, bảng giá, danh mục, kho, tài khoản, báo cáo; kế thừa quyền Lễ tân');

UPDATE roles SET parent_role_id = (SELECT id FROM roles WHERE code = 'RECEPTIONIST')
WHERE code = 'MANAGER';

-- Use case hệ thống (LH-07, DT-06, DT-09, TT-02) do DB/ứng dụng tự chạy, không phân quyền
INSERT INTO permissions (code, module, name) VALUES
  ('UC-00', 'CHUNG',     'Đăng nhập / Đăng xuất / Đổi mật khẩu'),
  ('BN-01', 'BENH_NHAN', 'Tìm bệnh nhân'),
  ('BN-02', 'BENH_NHAN', 'Đăng ký bệnh nhân mới'),
  ('BN-03', 'BENH_NHAN', 'Gắn người giám hộ'),
  ('BN-04', 'BENH_NHAN', 'Cập nhật thông tin bệnh nhân'),
  ('BN-05', 'BENH_NHAN', 'Xem hồ sơ bệnh nhân'),
  ('BN-06', 'BENH_NHAN', 'Số hóa hồ sơ giấy cũ'),
  ('LH-01', 'LICH_HEN',  'Xem lịch và khung trống'),
  ('LH-02', 'LICH_HEN',  'Đặt lịch hẹn'),
  ('LH-03', 'LICH_HEN',  'Đổi lịch hẹn'),
  ('LH-04', 'LICH_HEN',  'Hủy lịch hẹn'),
  ('LH-05', 'LICH_HEN',  'Nhắc lịch hẹn'),
  ('LH-06', 'LICH_HEN',  'Gửi tin nhắn nhắc lịch'),
  ('LH-08', 'LICH_HEN',  'Tiếp đón bệnh nhân (check-in)'),
  ('LH-09', 'LICH_HEN',  'Tiếp nhận khách vãng lai'),
  ('DT-01', 'DIEU_TRI',  'Xem danh sách chờ khám'),
  ('DT-02', 'DIEU_TRI',  'Lập phiếu điều trị'),
  ('DT-03', 'DIEU_TRI',  'Kê đơn thuốc'),
  ('DT-04', 'DIEU_TRI',  'Gắn buổi vào liệu trình'),
  ('DT-05', 'DIEU_TRI',  'Quản lý liệu trình'),
  ('DT-07', 'DIEU_TRI',  'Nhận cảnh báo vật tư dưới ngưỡng'),
  ('DT-08', 'DIEU_TRI',  'Sửa phiếu điều trị'),
  ('TT-01', 'THANH_TOAN', 'Lập hóa đơn'),
  ('TT-03', 'THANH_TOAN', 'Áp dụng giảm giá'),
  ('TT-04', 'THANH_TOAN', 'Thu tiền'),
  ('TT-05', 'THANH_TOAN', 'In hóa đơn / biên lai'),
  ('TT-06', 'THANH_TOAN', 'Tra cứu công nợ'),
  ('TT-07', 'THANH_TOAN', 'Chốt két cuối ca'),
  ('TT-08', 'THANH_TOAN', 'Hủy / điều chỉnh hóa đơn'),
  ('QT-01', 'QUAN_TRI',  'Xếp ca trực bác sĩ'),
  ('QT-02', 'QUAN_TRI',  'Quản lý bảng giá'),
  ('QT-03', 'QUAN_TRI',  'Quản lý danh mục'),
  ('QT-04', 'QUAN_TRI',  'Quản lý kho vật tư & thuốc'),
  ('QT-05', 'QUAN_TRI',  'Quản lý tài khoản & phân quyền'),
  ('BC-01', 'BAO_CAO',   'Doanh thu theo bác sĩ'),
  ('BC-02', 'BAO_CAO',   'Công suất ghế theo khung giờ'),
  ('BC-03', 'BAO_CAO',   'Bệnh nhân lâu chưa quay lại'),
  ('BC-04', 'BAO_CAO',   'Thống kê hủy lịch'),
  ('BC-05', 'BAO_CAO',   'Công nợ theo bệnh nhân'),
  ('BC-06', 'BAO_CAO',   'Liệu trình đang dở'),
  ('BC-07', 'BAO_CAO',   'Vật tư / thuốc sắp hết'),
  ('BC-08', 'BAO_CAO',   'So sánh doanh thu theo tháng');

-- Quản lý nhận thêm quyền Lễ tân qua parent_role_id (xem v_role_effective_permissions)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('RECEPTIONIST', ARRAY['UC-00', 'BN-01', 'BN-02', 'BN-03', 'BN-04', 'BN-05', 'BN-06',
                         'LH-01', 'LH-02', 'LH-03', 'LH-04', 'LH-05', 'LH-06', 'LH-08', 'LH-09',
                         'TT-01', 'TT-03', 'TT-04', 'TT-05', 'TT-06', 'TT-07', 'BC-03']),
  ('DOCTOR',       ARRAY['UC-00', 'BN-01', 'BN-05', 'LH-01', 'LH-02',
                         'DT-01', 'DT-02', 'DT-03', 'DT-04', 'DT-05', 'DT-08', 'BC-06']),
  ('MANAGER',      ARRAY['UC-00', 'DT-07', 'TT-08', 'QT-01', 'QT-02', 'QT-03', 'QT-04', 'QT-05',
                         'BC-01', 'BC-02', 'BC-03', 'BC-04', 'BC-05', 'BC-06', 'BC-07', 'BC-08'])
) AS v (role_code, perms)
JOIN roles r ON r.code = v.role_code
JOIN permissions p ON p.code = ANY (v.perms);

INSERT INTO chairs (code, name) VALUES
  ('GHE-01', 'Ghế 1'),
  ('GHE-02', 'Ghế 2'),
  ('GHE-03', 'Ghế 3');

INSERT INTO cancel_reasons (code, name, is_no_show, sort_order) VALUES
  ('NO_SHOW',            'Không đến (không báo trước)', true, 1),
  ('PATIENT_BUSY',       'Khách bận việc riêng',        false, 2),
  ('PATIENT_SICK',       'Khách bị ốm',                 false, 3),
  ('PATIENT_FINANCIAL',  'Khách chưa sắp xếp được chi phí', false, 4),
  ('DOCTOR_UNAVAILABLE', 'Bác sĩ vắng / đổi ca',        false, 5),
  ('CLINIC_ISSUE',       'Sự cố phòng khám (thiết bị, mất điện...)', false, 6),
  ('OTHER',              'Lý do khác',                  false, 99);

COMMIT;
