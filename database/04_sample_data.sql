-- =============================================================================
-- 04. Dữ liệu mẫu (demo) — mốc thời gian quanh ngày 03/11/2026
-- Chạy trên DB vừa khởi tạo (bảng staff rỗng): ./database/init.sh --sample
--
-- Dữ liệu nghiệp vụ đi qua đúng trigger/hàm của schema (đặt lịch, phiếu điều
-- trị, định mức vật tư, lập hóa đơn, giảm giá, thu tiền, chốt két, hủy hóa đơn)
-- nên tồn kho, công nợ, trạng thái, nhật ký tự nhất quán.
-- Mật khẩu mọi tài khoản mẫu: Clinic@123
-- =============================================================================
\set ON_ERROR_STOP on
SET TIME ZONE 'Asia/Ho_Chi_Minh';
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- băm mật khẩu mẫu bằng bcrypt

-- -----------------------------------------------------------------------------
-- Nhân viên
-- -----------------------------------------------------------------------------
INSERT INTO staff (role_id, staff_code, full_name, phone, email, username, password_hash,
                   must_change_password, is_part_time, created_at)
SELECT r.id, v.code, v.full_name, v.phone, v.username || '@nucuoiviet.local', v.username,
       crypt('Clinic@123', gen_salt('bf', 10)), false, v.part_time, '2026-01-02 08:00'
FROM (VALUES
  ('MANAGER',      'QL01', 'Trần Minh Quân', '0901000001', 'quan.tm', false),
  ('RECEPTIONIST', 'LT01', 'Nguyễn Thu Hà',  '0901000002', 'ha.nt',   false),
  ('RECEPTIONIST', 'LT02', 'Lê Thị Mai',     '0901000003', 'mai.lt',  false),
  ('DOCTOR',       'BS01', 'Phạm Văn Đức',   '0901000004', 'duc.pv',  false),
  ('DOCTOR',       'BS02', 'Hoàng Thị Lan',  '0901000005', 'lan.ht',  false),
  ('DOCTOR',       'BS03', 'Võ Quốc Bảo',    '0901000006', 'bao.vq',  false),
  ('DOCTOR',       'BS04', 'Đặng Ngọc Anh',  '0901000007', 'anh.dn',  true)
) AS v (role_code, code, full_name, phone, username, part_time)
JOIN roles r ON r.code = v.role_code
ORDER BY v.phone;

-- Tra cứu id theo mã (chỉ tồn tại trong phiên chạy script)
CREATE FUNCTION pg_temp.sid(p_code text) RETURNS bigint LANGUAGE sql STABLE AS
  $$ SELECT id FROM staff WHERE staff_code = p_code $$;
CREATE FUNCTION pg_temp.svc(p_code text) RETURNS bigint LANGUAGE sql STABLE AS
  $$ SELECT id FROM services WHERE code = p_code $$;
CREATE FUNCTION pg_temp.itm(p_code text) RETURNS bigint LANGUAGE sql STABLE AS
  $$ SELECT id FROM items WHERE code = p_code $$;
CREATE FUNCTION pg_temp.pid(p_name text) RETURNS bigint LANGUAGE sql STABLE AS
  $$ SELECT id FROM patients WHERE full_name = p_name $$;

-- -----------------------------------------------------------------------------
-- Danh mục dịch vụ, bảng giá (có lịch sử đổi giá + giá tương lai)
-- -----------------------------------------------------------------------------
INSERT INTO services (code, name, category, unit, tooth_scope, default_slots, description) VALUES
  ('KHAM',     'Khám và tư vấn',                          'Tổng quát',          'lần',        'JAW',   1, NULL),
  ('CHUPXQ',   'Chụp X-quang quanh chóp',                 'Chẩn đoán hình ảnh', 'phim',       'TOOTH', 1, NULL),
  ('CAOVOI',   'Cạo vôi, đánh bóng toàn hàm',             'Nha chu',            'lần',        'JAW',   1, NULL),
  ('TRAM',     'Trám răng composite',                     'Phục hồi',           'răng',       'TOOTH', 1, NULL),
  ('NHO',      'Nhổ răng thường / răng sữa',              'Phẫu thuật',         'răng',       'TOOTH', 1, NULL),
  ('NHOKHON',  'Nhổ răng khôn',                           'Phẫu thuật',         'răng',       'TOOTH', 2, NULL),
  ('LTUY',     'Điều trị tủy',                            'Nội nha',            'răng',       'TOOTH', 2, NULL),
  ('TAYTRANG', 'Tẩy trắng răng tại phòng khám',           'Thẩm mỹ',            'lần',        'JAW',   2, NULL),
  ('NIENG',    'Niềng răng mắc cài kim loại (trọn gói)',  'Chỉnh nha',          'liệu trình', 'JAW',   2, 'Gói 2 hàm, khoảng 24 buổi'),
  ('SIETMC',   'Tái khám chỉnh nha, siết mắc cài',        'Chỉnh nha',          'lần',        'JAW',   1, NULL),
  ('IMPLANT',  'Cấy ghép implant (trọn gói)',             'Implant',            'răng',       'TOOTH', 3, 'Gồm trụ, abutment, mão sứ; 3 buổi');

INSERT INTO service_prices (service_id, price, effective_from, note, created_by, created_at)
SELECT pg_temp.svc(v.code), v.price, v.effective_from::date, v.note, pg_temp.sid('QL01'),
       least(now(), v.effective_from::timestamptz - interval '10 days')
FROM (VALUES
  ('KHAM',       100000, '2026-01-01', 'Bảng giá 2026'),
  ('CHUPXQ',      50000, '2026-01-01', 'Bảng giá 2026'),
  ('CAOVOI',     300000, '2026-01-01', 'Bảng giá 2026'),
  ('CAOVOI',     350000, '2027-01-01', 'Điều chỉnh giá 2027'),
  ('TRAM',       300000, '2026-01-01', 'Bảng giá 2026'),
  ('TRAM',       350000, '2026-10-01', 'Tăng giá do vật liệu composite tăng'),
  ('NHO',        500000, '2026-01-01', 'Bảng giá 2026'),
  ('NHOKHON',   2000000, '2026-01-01', 'Bảng giá 2026'),
  ('LTUY',      1500000, '2026-01-01', 'Bảng giá 2026'),
  ('TAYTRANG',  2500000, '2026-01-01', 'Bảng giá 2026'),
  ('NIENG',    35000000, '2026-01-01', 'Bảng giá 2026'),
  ('SIETMC',     200000, '2026-01-01', 'Bảng giá 2026'),
  ('IMPLANT',  25000000, '2026-01-01', 'Bảng giá 2026')
) AS v (code, price, effective_from, note);

-- -----------------------------------------------------------------------------
-- Vật tư & thuốc, giá thuốc, định mức vật tư theo dịch vụ
-- -----------------------------------------------------------------------------
INSERT INTO items (code, name, item_type, unit, min_stock, default_dosage) VALUES
  ('GANG',       'Găng tay y tế',                     'SUPPLY',   'đôi',  50,  NULL),
  ('KHAUTRANG',  'Khẩu trang y tế',                   'SUPPLY',   'cái',  50,  NULL),
  ('COMPOSITE',  'Composite trám răng',               'SUPPLY',   'ống',  2,   NULL),
  ('THUOCTE',    'Thuốc tê Lidocaine 2%',             'SUPPLY',   'ống',  20,  NULL),
  ('CHIKHAU',    'Chỉ khâu phẫu thuật',               'SUPPLY',   'sợi',  10,  NULL),
  ('FILMXQ',     'Phim X-quang quanh chóp',           'SUPPLY',   'tấm',  10,  NULL),
  ('MACCAI',     'Bộ mắc cài kim loại',               'SUPPLY',   'bộ',   1,   NULL),
  ('DAYCUNG',    'Dây cung chỉnh nha',                'SUPPLY',   'sợi',  5,   NULL),
  ('TRUIMPLANT', 'Trụ implant',                       'SUPPLY',   'trụ',  2,   NULL),
  ('AMOX',       'Amoxicillin 500mg',                 'MEDICINE', 'viên', 100, 'Uống 1 viên x 3 lần/ngày sau ăn'),
  ('PARA',       'Paracetamol 500mg',                 'MEDICINE', 'viên', 100, 'Uống 1 viên khi đau, cách nhau 4–6 giờ'),
  ('IBU',        'Ibuprofen 400mg',                   'MEDICINE', 'viên', 50,  'Uống 1 viên x 2 lần/ngày sau ăn'),
  ('METRO',      'Metronidazole 250mg',               'MEDICINE', 'viên', 50,  'Uống 1 viên x 2 lần/ngày sau ăn'),
  ('CHLORHEX',   'Nước súc miệng Chlorhexidine 0.12%', 'MEDICINE', 'chai', 5,   'Súc miệng 2 lần/ngày, mỗi lần 15ml');

INSERT INTO item_prices (item_id, price, effective_from, note, created_by, created_at)
SELECT pg_temp.itm(v.code), v.price, v.effective_from::date, v.note, pg_temp.sid('QL01'),
       least(now(), v.effective_from::timestamptz - interval '10 days')
FROM (VALUES
  ('AMOX',      2000, '2026-01-01', 'Bảng giá 2026'),
  ('AMOX',      2200, '2026-12-01', 'Nhà cung cấp tăng giá'),
  ('PARA',      1000, '2026-01-01', 'Bảng giá 2026'),
  ('IBU',       2500, '2026-01-01', 'Bảng giá 2026'),
  ('METRO',     1500, '2026-01-01', 'Bảng giá 2026'),
  ('CHLORHEX', 45000, '2026-01-01', 'Bảng giá 2026')
) AS v (code, price, effective_from, note);

INSERT INTO service_material_norms (service_id, item_id, quantity)
SELECT pg_temp.svc(v.service_code), pg_temp.itm(v.item_code), v.quantity
FROM (VALUES
  ('KHAM',     'GANG', 1), ('KHAM', 'KHAUTRANG', 1),
  ('CHUPXQ',   'FILMXQ', 1),
  ('CAOVOI',   'GANG', 1), ('CAOVOI', 'KHAUTRANG', 1),
  ('TRAM',     'GANG', 1), ('TRAM', 'COMPOSITE', 0.5),
  ('NHO',      'GANG', 1), ('NHO', 'THUOCTE', 1),
  ('NHOKHON',  'GANG', 2), ('NHOKHON', 'THUOCTE', 2), ('NHOKHON', 'CHIKHAU', 1),
  ('LTUY',     'GANG', 1), ('LTUY', 'THUOCTE', 1), ('LTUY', 'COMPOSITE', 0.5),
  ('TAYTRANG', 'GANG', 1),
  ('NIENG',    'GANG', 1), ('NIENG', 'MACCAI', 1), ('NIENG', 'DAYCUNG', 1),
  ('SIETMC',   'GANG', 1), ('SIETMC', 'DAYCUNG', 1),
  ('IMPLANT',  'GANG', 2), ('IMPLANT', 'THUOCTE', 2), ('IMPLANT', 'CHIKHAU', 1), ('IMPLANT', 'TRUIMPLANT', 1)
) AS v (service_code, item_code, quantity);

-- Nhập kho đầu kỳ, kiểm kê, điều chỉnh (tồn kho do trigger cộng dồn)
DO $$ BEGIN PERFORM set_config('app.staff_id', pg_temp.sid('QL01')::text, true); END $$;

INSERT INTO stock_movements (item_id, movement_type, quantity, unit_cost, supplier, batch_no, expiry_date,
                             note, created_by, created_at)
SELECT pg_temp.itm(v.code), v.movement_type, v.quantity, v.unit_cost, v.supplier, v.batch_no,
       v.expiry_date::date, v.note, pg_temp.sid('QL01'), v.created_at::timestamptz
FROM (VALUES
  ('GANG',       'IMPORT',     500,    2500, 'Nhà cung cấp vật tư số 1', NULL,      NULL,         'Nhập kho đầu kỳ', '2026-03-01 08:00'),
  ('KHAUTRANG',  'IMPORT',     500,     800, 'Nhà cung cấp vật tư số 1', NULL,      NULL,         'Nhập kho đầu kỳ', '2026-03-01 08:00'),
  ('COMPOSITE',  'IMPORT',       3,  450000, 'Nhà cung cấp vật tư số 1', 'CP2603',  '2028-03-31', 'Nhập kho đầu kỳ', '2026-03-01 08:00'),
  ('THUOCTE',    'IMPORT',     100,   12000, 'Nhà cung cấp vật tư số 1', 'LD2603',  '2028-03-31', 'Nhập kho đầu kỳ', '2026-03-01 08:00'),
  ('CHIKHAU',    'IMPORT',      30,   25000, 'Nhà cung cấp vật tư số 1', NULL,      NULL,         'Nhập kho đầu kỳ', '2026-03-01 08:00'),
  ('FILMXQ',     'IMPORT',      50,   15000, 'Nhà cung cấp vật tư số 1', NULL,      NULL,         'Nhập kho đầu kỳ', '2026-03-01 08:00'),
  ('MACCAI',     'IMPORT',       3, 1800000, 'Nhà cung cấp vật tư số 2', NULL,      NULL,         'Nhập mắc cài',    '2026-08-01 09:00'),
  ('DAYCUNG',    'IMPORT',      20,   60000, 'Nhà cung cấp vật tư số 2', NULL,      NULL,         'Nhập dây cung',   '2026-08-01 09:00'),
  ('TRUIMPLANT', 'IMPORT',       2, 6500000, 'Nhà cung cấp vật tư số 2', 'IMP2609', NULL,         'Nhập trụ implant','2026-10-01 09:00'),
  ('AMOX',       'IMPORT',     300,     900, 'Nhà cung cấp dược số 1',   'AMX2608', '2028-08-31', 'Nhập thuốc',      '2026-03-01 08:00'),
  ('PARA',       'IMPORT',     500,     400, 'Nhà cung cấp dược số 1',   'PRC2607', '2029-07-31', 'Nhập thuốc',      '2026-03-01 08:00'),
  ('IBU',        'IMPORT',     200,    1200, 'Nhà cung cấp dược số 1',   'IBU2606', '2028-06-30', 'Nhập thuốc',      '2026-03-01 08:00'),
  ('METRO',      'IMPORT',     100,     700, 'Nhà cung cấp dược số 1',   'MTR2605', '2028-05-31', 'Nhập thuốc',      '2026-03-01 08:00'),
  ('CHLORHEX',   'IMPORT',      20,   28000, 'Nhà cung cấp dược số 1',   'CHX2604', '2028-04-30', 'Nhập thuốc',      '2026-03-01 08:00'),
  ('KHAUTRANG',  'ADJUSTMENT', -10,    NULL, NULL,                       NULL,      NULL,         'Hủy 10 cái hỏng do ẩm',              '2026-10-20 17:00'),
  ('GANG',       'STOCK_TAKE',  -3,    NULL, NULL,                       NULL,      NULL,         'Kiểm kê cuối tháng 10: thiếu 3 đôi', '2026-10-31 18:00')
) AS v (code, movement_type, quantity, unit_cost, supplier, batch_no, expiry_date, note, created_at);

-- -----------------------------------------------------------------------------
-- Ca trực: các ngày có lịch trong quá khứ + lịch trực tuần 02–08/11/2026
-- Ca sáng 8h–14h, ca chiều 14h–20h (Chủ nhật 14h–17h); BS04 bán thời gian 3 ngày/tuần
-- -----------------------------------------------------------------------------
INSERT INTO doctor_shifts (doctor_id, work_date, shift, start_time, end_time, created_by, created_at)
SELECT pg_temp.sid(v.doctor_code), v.work_date::date, v.shift,
       CASE v.shift WHEN 'MORNING' THEN time '08:00' ELSE time '14:00' END,
       CASE WHEN v.shift = 'MORNING' THEN time '14:00'
            WHEN extract(isodow FROM v.work_date::date) = 7 THEN time '17:00'
            ELSE time '20:00' END,
       pg_temp.sid('QL01'),
       least(now(), v.work_date::timestamptz - interval '7 days')
FROM (VALUES
  ('2026-03-14', 'BS02', 'MORNING'),
  ('2026-08-20', 'BS01', 'MORNING'),
  ('2026-09-17', 'BS01', 'MORNING'),
  ('2026-10-15', 'BS01', 'MORNING'), ('2026-10-15', 'BS04', 'MORNING'), ('2026-10-15', 'BS02', 'AFTERNOON'),
  ('2026-11-02', 'BS02', 'MORNING'), ('2026-11-02', 'BS03', 'MORNING'), ('2026-11-02', 'BS01', 'AFTERNOON'),
  ('2026-11-03', 'BS01', 'MORNING'), ('2026-11-03', 'BS02', 'MORNING'), ('2026-11-03', 'BS04', 'MORNING'),
  ('2026-11-03', 'BS01', 'AFTERNOON'), ('2026-11-03', 'BS03', 'AFTERNOON'),
  ('2026-11-04', 'BS03', 'MORNING'), ('2026-11-04', 'BS01', 'AFTERNOON'), ('2026-11-04', 'BS02', 'AFTERNOON'),
  ('2026-11-05', 'BS01', 'MORNING'), ('2026-11-05', 'BS04', 'MORNING'), ('2026-11-05', 'BS02', 'AFTERNOON'),
  ('2026-11-06', 'BS02', 'MORNING'), ('2026-11-06', 'BS01', 'AFTERNOON'), ('2026-11-06', 'BS03', 'AFTERNOON'),
  ('2026-11-07', 'BS03', 'MORNING'), ('2026-11-07', 'BS04', 'MORNING'), ('2026-11-07', 'BS02', 'AFTERNOON'),
  ('2026-11-08', 'BS03', 'AFTERNOON'),
  ('2026-11-12', 'BS01', 'MORNING')
) AS v (work_date, doctor_code, shift);

-- -----------------------------------------------------------------------------
-- Bệnh nhân, người giám hộ, tài liệu đính kèm
-- Hai bé Phạm Gia Huy / Phạm Gia An dùng chung SĐT của mẹ (mục 6.2)
-- -----------------------------------------------------------------------------
INSERT INTO patients (full_name, date_of_birth, gender, phone, email, address, medical_history, note,
                      is_legacy, legacy_record_no, last_visit_at, status, archived_at, created_by, created_at)
VALUES
  ('Đỗ Văn Hùng',    '1985-04-12', 'MALE',   '0903111222', NULL, '45 Lê Văn Sỹ, Q.3, TP.HCM', NULL, NULL,
   false, NULL, NULL, 'ACTIVE', NULL, pg_temp.sid('LT01'), '2026-03-14 08:50'),
  ('Nguyễn Văn Nam', '2008-06-20', 'MALE',   '0912333444', NULL, '12 Nguyễn Trãi, Q.5, TP.HCM', NULL, 'Học sinh lớp 12',
   false, NULL, NULL, 'ACTIVE', NULL, pg_temp.sid('LT01'), '2026-08-20 08:50'),
  ('Trần Thị Hoa',   '1992-11-02', 'FEMALE', '0938555666', 'hoa.tt@example.com', '88 Cách Mạng Tháng 8, Q.10, TP.HCM', 'Dị ứng Penicillin', NULL,
   false, NULL, NULL, 'ACTIVE', NULL, pg_temp.sid('LT01'), '2026-09-17 09:50'),
  ('Lê Quang Vinh',  '1970-01-15', 'MALE',   '0987777888', NULL, '230 Hai Bà Trưng, Q.1, TP.HCM', 'Tăng huyết áp, đang dùng Amlodipine 5mg', NULL,
   false, NULL, NULL, 'ACTIVE', NULL, pg_temp.sid('LT01'), '2026-10-01 10:00'),
  ('Phạm Gia Huy',   '2017-03-10', 'MALE',   '0909123456', NULL, '7 Trần Hưng Đạo, Q.1, TP.HCM', NULL, 'SĐT của mẹ',
   false, NULL, NULL, 'ACTIVE', NULL, pg_temp.sid('LT02'), '2026-10-15 14:45'),
  ('Phạm Gia An',    '2020-08-25', 'FEMALE', '0909123456', NULL, '7 Trần Hưng Đạo, Q.1, TP.HCM', NULL, 'SĐT của mẹ; em của Phạm Gia Huy',
   false, NULL, NULL, 'ACTIVE', NULL, pg_temp.sid('LT02'), '2026-10-15 14:46'),
  ('Bùi Thanh Tâm',  '1998-07-07', 'FEMALE', '0977222333', NULL, '19 Phan Xích Long, Q.Phú Nhuận, TP.HCM', NULL, 'Được khách Trần Thị Hoa giới thiệu',
   false, NULL, NULL, 'ACTIVE', NULL, pg_temp.sid('LT01'), '2026-10-30 16:00'),
  ('Ngô Minh Khoa',  '2001-12-01', 'MALE',   '0966888999', NULL, '5 Võ Văn Tần, Q.3, TP.HCM', NULL, 'Khách vãng lai',
   false, NULL, NULL, 'ACTIVE', NULL, pg_temp.sid('LT01'), '2026-11-03 08:25'),
  ('Vũ Thị Kim',     '1965-09-09', 'FEMALE', '0918000111', NULL, '102 Bà Hạt, Q.10, TP.HCM', 'Tiểu đường type 2', 'Số hóa từ hồ sơ giấy',
   true, 'HS-2019-0457', '2023-05-10 09:00', 'ACTIVE', NULL, pg_temp.sid('LT02'), '2026-06-10 15:00'),
  ('Trịnh Văn Long', '1950-02-02', 'MALE',   '0283000222', NULL, '33 Hùng Vương, Q.5, TP.HCM', NULL, 'Số hóa từ hồ sơ giấy; quá 5 năm không tái khám',
   true, 'HS-2019-0012', '2020-01-15 09:00', 'ARCHIVED', '2026-06-10 15:30', pg_temp.sid('LT02'), '2026-06-10 15:20');

INSERT INTO patient_guardians (patient_id, full_name, relationship, phone, is_primary, note, created_at) VALUES
  (pg_temp.pid('Phạm Gia Huy'), 'Phạm Thị Thu',  'Mẹ', '0909123456', true,  NULL,                   '2026-10-15 14:45'),
  (pg_temp.pid('Phạm Gia Huy'), 'Phạm Văn Toàn', 'Bố', '0909654321', false, 'Liên hệ khi mẹ bận', '2026-10-15 14:45'),
  (pg_temp.pid('Phạm Gia An'),  'Phạm Thị Thu',  'Mẹ', '0909123456', true,  NULL,                   '2026-10-15 14:46');

INSERT INTO patient_documents (patient_id, document_type, file_path, file_name, mime_type, file_size,
                               description, uploaded_by, uploaded_at)
SELECT p.id, v.document_type, 'patients/' || p.patient_code || '/' || v.file_name, v.file_name, v.mime_type,
       v.file_size, v.description, pg_temp.sid(v.uploaded_by), v.uploaded_at::timestamptz
FROM (VALUES
  ('Vũ Thị Kim',     'LEGACY_SCAN', 'hs-2019-0457-p1.jpg',  'image/jpeg', 845120,
   'Hồ sơ giấy 2019 — trang 1 (hành chính)',        'LT02', '2026-06-10 15:05'),
  ('Vũ Thị Kim',     'LEGACY_SCAN', 'hs-2019-0457-p2.jpg',  'image/jpeg', 912384,
   'Hồ sơ giấy 2019 — trang 2 (lịch sử điều trị)',  'LT02', '2026-06-10 15:06'),
  ('Trịnh Văn Long', 'LEGACY_SCAN', 'hs-2019-0012-p1.jpg',  'image/jpeg', 790002,
   'Hồ sơ giấy 2019 — trang 1',                     'LT02', '2026-06-10 15:22'),
  ('Lê Quang Vinh',  'XRAY',        'xray-46-20261015.png', 'image/png',  1530220,
   'Phim quanh chóp răng 46 trước cấy implant',     'BS04', '2026-10-15 08:50')
) AS v (patient_name, document_type, file_name, mime_type, file_size, description, uploaded_by, uploaded_at)
JOIN patients p ON p.full_name = v.patient_name;

-- -----------------------------------------------------------------------------
-- Hàm hỗ trợ cho luồng nghiệp vụ
-- -----------------------------------------------------------------------------

-- Đặt lịch p_slots khung 30 phút liên tiếp cùng nhóm; trả về id khung đầu
CREATE FUNCTION pg_temp.book(p_patient bigint, p_doctor bigint, p_chair_code text, p_service bigint,
                             p_start timestamptz, p_slots int, p_status text, p_source text, p_by bigint,
                             p_checked_in timestamptz DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  v_group uuid := gen_random_uuid();
  v_first bigint;
  v_id    bigint;
BEGIN
  PERFORM set_config('app.staff_id', p_by::text, true);
  FOR i IN 0 .. p_slots - 1 LOOP
    INSERT INTO appointments (booking_group_id, patient_id, doctor_id, chair_id, service_id, start_at, end_at,
                              status, source, checked_in_at, note, created_by, created_at)
    VALUES (v_group, p_patient, p_doctor, (SELECT id FROM chairs WHERE code = p_chair_code), p_service,
            p_start + i * interval '30 minutes', p_start + (i + 1) * interval '30 minutes',
            p_status, p_source, p_checked_in, p_note, p_by,
            CASE WHEN p_source = 'WALK_IN' THEN coalesce(p_checked_in, now())
                 ELSE least(now(), p_start - interval '2 days') END)
    RETURNING id INTO v_id;
    v_first := coalesce(v_first, v_id);
  END LOOP;
  RETURN v_first;
END $$;

-- Lập phiếu điều trị từ lịch hẹn; p_lines: [{svc, tooth, doctor?, pkg?, note?}]
CREATE FUNCTION pg_temp.make_record(p_appt bigint, p_visit timestamptz, p_diagnosis text, p_lines jsonb,
                                    p_plan bigint DEFAULT NULL, p_session int DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  v_rec bigint;
  v_doc bigint;
BEGIN
  SELECT doctor_id INTO v_doc FROM appointments WHERE id = p_appt;
  PERFORM set_config('app.staff_id', v_doc::text, true);

  INSERT INTO treatment_records (patient_id, appointment_id, primary_doctor_id, chair_id, visit_at,
                                 treatment_plan_id, plan_session_no, diagnosis, created_by, created_at)
  SELECT patient_id, id, doctor_id, chair_id, p_visit, p_plan, p_session, p_diagnosis, doctor_id, p_visit
  FROM appointments WHERE id = p_appt
  RETURNING id INTO v_rec;

  INSERT INTO treatment_record_items (treatment_record_id, line_no, service_id, tooth_code,
                                      performing_doctor_id, is_plan_package, note, created_at)
  SELECT v_rec, l.ord, pg_temp.svc(l.svc), l.tooth, coalesce(pg_temp.sid(l.doctor), v_doc),
         coalesce(l.pkg, false), l.note, p_visit
  FROM ROWS FROM (jsonb_to_recordset(p_lines) AS (svc text, tooth text, doctor text, pkg boolean, note text))
       WITH ORDINALITY AS l (svc, tooth, doctor, pkg, note, ord);
  RETURN v_rec;
END $$;

CREATE FUNCTION pg_temp.prescribe(p_record bigint, p_item_code text, p_quantity numeric, p_dosage text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO prescription_items (treatment_record_id, item_id, medicine_name, dosage, quantity, unit)
  SELECT p_record, i.id, i.name, coalesce(p_dosage, i.default_dosage), p_quantity, i.unit
  FROM items i WHERE i.code = p_item_code;
$$;

-- Bác sĩ lưu phiếu: trừ vật tư theo định mức (DT-06), chuyển "Chờ thanh toán"
CREATE FUNCTION pg_temp.finish_record(p_record bigint) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.staff_id', (SELECT primary_doctor_id FROM treatment_records WHERE id = p_record)::text, true);
  PERFORM fill_material_norms(p_record);
  UPDATE treatment_records SET status = 'PENDING_PAYMENT' WHERE id = p_record;
END $$;

CREATE FUNCTION pg_temp.pay(p_invoice bigint, p_amount numeric, p_method text, p_at timestamptz, p_by bigint,
                            p_ref text DEFAULT NULL, p_installment_no int DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_id bigint;
BEGIN
  PERFORM set_config('app.staff_id', p_by::text, true);
  INSERT INTO payments (invoice_id, installment_id, amount, method, transaction_ref, paid_at, received_by, note, created_at)
  SELECT p_invoice, tpi.id, p_amount, p_method, p_ref, p_at, p_by, p_note, p_at
  FROM invoices i
  LEFT JOIN treatment_plan_installments tpi
         ON tpi.treatment_plan_id = i.treatment_plan_id AND tpi.installment_no = p_installment_no
  WHERE i.id = p_invoice
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- -----------------------------------------------------------------------------
-- Luồng nghiệp vụ theo thời gian
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  ql  bigint := pg_temp.sid('QL01');
  lt1 bigint := pg_temp.sid('LT01');
  lt2 bigint := pg_temp.sid('LT02');
  bs1 bigint := pg_temp.sid('BS01');
  bs2 bigint := pg_temp.sid('BS02');
  bs3 bigint := pg_temp.sid('BS03');
  bs4 bigint := pg_temp.sid('BS04');
  p_hung bigint := pg_temp.pid('Đỗ Văn Hùng');
  p_nam  bigint := pg_temp.pid('Nguyễn Văn Nam');
  p_hoa  bigint := pg_temp.pid('Trần Thị Hoa');
  p_vinh bigint := pg_temp.pid('Lê Quang Vinh');
  p_huy  bigint := pg_temp.pid('Phạm Gia Huy');
  p_an   bigint := pg_temp.pid('Phạm Gia An');
  p_tam  bigint := pg_temp.pid('Bùi Thanh Tâm');
  p_khoa bigint := pg_temp.pid('Ngô Minh Khoa');
  p_kim  bigint := pg_temp.pid('Vũ Thị Kim');
  a bigint;
  r bigint;
  inv bigint;
  inv_huy bigint;
  plan_nam bigint;
  plan_vinh bigint;
  inv_plan_nam bigint;
  inv_plan_vinh bigint;
  s record;
BEGIN
  -- ===== 14/03/2026: Hùng cạo vôi (sau đó không quay lại → BC-03) =====
  a := pg_temp.book(p_hung, bs2, 'GHE-01', pg_temp.svc('CAOVOI'), '2026-03-14 09:00', 1,
                    'COMPLETED', 'RECEPTION', lt1, '2026-03-14 08:52');
  r := pg_temp.make_record(a, '2026-03-14 09:05', 'Vôi răng độ 2, viêm nướu nhẹ',
                           '[{"svc":"CAOVOI","tooth":"FULL"}]');
  PERFORM pg_temp.finish_record(r);
  PERFORM set_config('app.staff_id', lt1::text, true);
  inv := create_invoice_from_treatment_record(r, lt1, '2026-03-14 09:40');
  PERFORM pg_temp.pay(inv, 300000, 'CASH', '2026-03-14 09:45', lt1);

  -- ===== 20/08/2026: Nam bắt đầu liệu trình niềng răng (buổi 1) =====
  PERFORM set_config('app.staff_id', bs1::text, true);
  INSERT INTO treatment_plans (patient_id, primary_doctor_id, service_id, name, plan_type, total_price,
                               expected_sessions, started_on, note, created_by, created_at)
  VALUES (p_nam, bs1, pg_temp.svc('NIENG'), 'Niềng răng mắc cài kim loại 2 hàm', 'ORTHODONTIC', 35000000,
          24, '2026-08-20', 'Răng chen chúc, khớp cắn sâu', bs1, '2026-08-20 09:50')
  RETURNING id INTO plan_nam;
  INSERT INTO treatment_plan_installments (treatment_plan_id, installment_no, due_date, amount, note) VALUES
    (plan_nam, 1, '2026-08-20', 15000000, 'Đặt cọc khi gắn mắc cài'),
    (plan_nam, 2, '2026-10-15', 10000000, NULL),
    (plan_nam, 3, '2026-12-15', 10000000, 'Tất toán');

  a := pg_temp.book(p_nam, bs1, 'GHE-01', pg_temp.svc('NIENG'), '2026-08-20 09:00', 2,
                    'COMPLETED', 'RECEPTION', lt1, '2026-08-20 08:55');
  r := pg_temp.make_record(a, '2026-08-20 09:05', 'Răng chen chúc 2 hàm, khớp cắn sâu',
                           '[{"svc":"KHAM","tooth":"FULL"},
                             {"svc":"NIENG","tooth":"FULL","pkg":true,"note":"Gắn mắc cài 2 hàm"}]',
                           plan_nam, 1);
  PERFORM pg_temp.finish_record(r);
  PERFORM set_config('app.staff_id', lt1::text, true);
  inv := create_invoice_from_treatment_record(r, lt1, '2026-08-20 10:10');
  PERFORM pg_temp.pay(inv, 100000, 'CASH', '2026-08-20 10:12', lt1);
  inv_plan_nam := create_invoice_for_treatment_plan(plan_nam, lt1, '2026-08-20 10:15');
  PERFORM pg_temp.pay(inv_plan_nam, 15000000, 'BANK_TRANSFER', '2026-08-20 10:20', lt1, 'FT26232100001', 1);

  -- ===== 17/09/2026: Nam buổi 2; Hoa trám 2 răng (giá trám cũ 300.000) =====
  a := pg_temp.book(p_nam, bs1, 'GHE-01', pg_temp.svc('SIETMC'), '2026-09-17 09:00', 1,
                    'COMPLETED', 'DOCTOR_FOLLOW_UP', bs1, '2026-09-17 08:50');
  r := pg_temp.make_record(a, '2026-09-17 09:05', 'Tái khám chỉnh nha, thay dây cung',
                           '[{"svc":"SIETMC","tooth":"FULL","pkg":true}]', plan_nam, 2);
  PERFORM pg_temp.finish_record(r);
  PERFORM set_config('app.staff_id', lt1::text, true);
  PERFORM create_invoice_from_treatment_record(r, lt1, '2026-09-17 09:40');  -- dòng trọn gói → 0đ

  a := pg_temp.book(p_hoa, bs1, 'GHE-02', pg_temp.svc('TRAM'), '2026-09-17 10:00', 1,
                    'COMPLETED', 'RECEPTION', lt1, '2026-09-17 09:55');
  r := pg_temp.make_record(a, '2026-09-17 10:05', 'Sâu răng 16, 26 mặt nhai',
                           '[{"svc":"TRAM","tooth":"16"},{"svc":"TRAM","tooth":"26"}]');
  PERFORM pg_temp.prescribe(r, 'PARA', 10);
  PERFORM pg_temp.finish_record(r);
  PERFORM set_config('app.staff_id', lt1::text, true);
  inv := create_invoice_from_treatment_record(r, lt1, '2026-09-17 10:40');
  PERFORM pg_temp.pay(inv, 610000, 'CASH', '2026-09-17 10:42', lt1);

  -- ===== 15/10/2026: Vinh bắt đầu implant; Nam buổi 3 + đóng đợt 2; bé Huy nhổ răng sữa =====
  PERFORM set_config('app.staff_id', bs4::text, true);
  INSERT INTO treatment_plans (patient_id, primary_doctor_id, service_id, name, plan_type, total_price,
                               expected_sessions, started_on, note, created_by, created_at)
  VALUES (p_vinh, bs4, pg_temp.svc('IMPLANT'), 'Cấy ghép implant răng 46', 'IMPLANT', 25000000,
          3, '2026-10-15', 'Bệnh nhân tăng huyết áp — đo huyết áp trước mỗi buổi', bs4, '2026-10-15 08:40')
  RETURNING id INTO plan_vinh;
  INSERT INTO treatment_plan_installments (treatment_plan_id, installment_no, due_date, amount, note) VALUES
    (plan_vinh, 1, '2026-10-15', 10000000, 'Buổi đặt trụ'),
    (plan_vinh, 2, '2026-11-05',  8000000, 'Buổi gắn abutment'),
    (plan_vinh, 3, '2027-01-15',  7000000, 'Buổi gắn mão sứ');

  a := pg_temp.book(p_vinh, bs4, 'GHE-02', pg_temp.svc('IMPLANT'), '2026-10-15 08:30', 3,
                    'COMPLETED', 'RECEPTION', lt1, '2026-10-15 08:20');
  r := pg_temp.make_record(a, '2026-10-15 08:35', 'Mất răng 46, xương đủ điều kiện cấy ghép',
                           '[{"svc":"CHUPXQ","tooth":"46"},
                             {"svc":"IMPLANT","tooth":"46","pkg":true,"note":"Đặt trụ implant"}]',
                           plan_vinh, 1);
  PERFORM pg_temp.prescribe(r, 'AMOX', 15);
  PERFORM pg_temp.prescribe(r, 'IBU', 10);
  PERFORM pg_temp.finish_record(r);  -- trụ implant xuống dưới ngưỡng → cảnh báo Quản lý
  PERFORM set_config('app.staff_id', lt1::text, true);
  inv := create_invoice_from_treatment_record(r, lt1, '2026-10-15 10:10');
  PERFORM pg_temp.pay(inv, 105000, 'CASH', '2026-10-15 10:12', lt1);
  inv_plan_vinh := create_invoice_for_treatment_plan(plan_vinh, lt1, '2026-10-15 10:15');
  PERFORM pg_temp.pay(inv_plan_vinh, 10000000, 'BANK_TRANSFER', '2026-10-15 10:20', lt1, 'FT26288100002', 1);

  a := pg_temp.book(p_nam, bs1, 'GHE-01', pg_temp.svc('SIETMC'), '2026-10-15 09:00', 1,
                    'COMPLETED', 'DOCTOR_FOLLOW_UP', bs1, '2026-10-15 08:58');
  r := pg_temp.make_record(a, '2026-10-15 09:05', 'Tái khám chỉnh nha, răng đang dịch chuyển tốt',
                           '[{"svc":"SIETMC","tooth":"FULL","pkg":true}]', plan_nam, 3);
  PERFORM pg_temp.finish_record(r);
  PERFORM set_config('app.staff_id', lt1::text, true);
  PERFORM create_invoice_from_treatment_record(r, lt1, '2026-10-15 09:35');
  PERFORM pg_temp.pay(inv_plan_nam, 10000000, 'BANK_TRANSFER', '2026-10-15 09:40', lt1, 'FT26288100001', 2);

  a := pg_temp.book(p_huy, bs2, 'GHE-01', pg_temp.svc('NHO'), '2026-10-15 15:00', 1,
                    'COMPLETED', 'RECEPTION', lt2, '2026-10-15 14:50');
  r := pg_temp.make_record(a, '2026-10-15 15:05', 'Răng 85 lung lay độ 3, răng vĩnh viễn đang mọc',
                           '[{"svc":"KHAM","tooth":"FULL"},{"svc":"NHO","tooth":"85"}]');
  PERFORM pg_temp.prescribe(r, 'PARA', 5, 'Uống 1/2 viên khi đau, tối đa 3 lần/ngày');
  PERFORM pg_temp.finish_record(r);
  PERFORM set_config('app.staff_id', lt2::text, true);
  inv_huy := create_invoice_from_treatment_record(r, lt2, '2026-10-15 15:40');
  PERFORM pg_temp.pay(inv_huy, 300000, 'CASH', '2026-10-15 15:42', lt2, NULL, NULL, 'Mẹ bé hẹn trả phần còn lại');

  -- ===== 02/11/2026: Tâm điều trị tủy (giảm 10%, còn nợ); Hùng không đến; mẹ bé Huy trả bớt nợ =====
  a := pg_temp.book(p_tam, bs3, 'GHE-01', pg_temp.svc('LTUY'), '2026-11-02 09:00', 2,
                    'COMPLETED', 'RECEPTION', lt1, '2026-11-02 08:50');
  r := pg_temp.make_record(a, '2026-11-02 09:05', 'Viêm tủy không hồi phục răng 36',
                           '[{"svc":"CHUPXQ","tooth":"36"},{"svc":"LTUY","tooth":"36","note":"Lấy tủy, đặt thuốc"}]');
  PERFORM pg_temp.prescribe(r, 'IBU', 10);
  PERFORM pg_temp.finish_record(r);  -- composite xuống dưới ngưỡng → cảnh báo Quản lý
  PERFORM set_config('app.staff_id', lt1::text, true);
  inv := create_invoice_from_treatment_record(r, lt1, '2026-11-02 10:30');
  PERFORM apply_invoice_discount(inv, 157500, 'Giảm 10% cho khách được giới thiệu', lt1);
  PERFORM pg_temp.pay(inv, 1000000, 'CASH', '2026-11-02 10:35', lt1, NULL, NULL,
                      'Hẹn thanh toán phần còn lại ở buổi tái khám');

  a := pg_temp.book(p_hung, bs2, 'GHE-02', pg_temp.svc('CAOVOI'), '2026-11-02 10:00', 1,
                    'BOOKED', 'RECEPTION', lt1);
  UPDATE appointments
  SET status = 'CANCELLED', cancel_reason_id = (SELECT id FROM cancel_reasons WHERE code = 'NO_SHOW'),
      cancel_note = 'Gọi 2 lần không nghe máy', cancelled_by = lt1, cancelled_at = '2026-11-02 10:45', updated_by = lt1
  WHERE booking_group_id = (SELECT booking_group_id FROM appointments WHERE id = a);

  PERFORM pg_temp.pay(inv_huy, 100000, 'CASH', '2026-11-02 15:30', lt2);

  -- Tâm được bác sĩ hẹn tái khám 04/11 9h, khi thanh toán xin dời sang 10h (LH-03)
  a := pg_temp.book(p_tam, bs3, 'GHE-01', pg_temp.svc('LTUY'), '2026-11-04 09:00', 1,
                    'BOOKED', 'DOCTOR_FOLLOW_UP', bs3, NULL, 'Tái khám tủy, trám bít ống tủy răng 36');
  PERFORM set_config('app.staff_id', lt1::text, true);
  UPDATE appointments
  SET start_at = '2026-11-04 10:00', end_at = '2026-11-04 10:30', updated_by = lt1,
      note = note || ' — khách xin dời sang 10h'
  WHERE id = a;
  INSERT INTO appointment_reminders (appointment_id, channel, result, recipient_phone, message_content,
                                     provider_message_id, note, performed_by, performed_at) VALUES
    (a, 'CALL', 'NO_ANSWER', '0977222333', NULL, NULL, 'Gọi 2 lần không bắt máy', lt1, '2026-11-03 10:15'),
    (a, 'SMS',  'SENT',      '0977222333',
     'Nha khoa Nu Cuoi Viet nhac lich: Ban co hen 10:00 ngay 04/11/2026 voi BS Vo Quoc Bao. Lien he quay le tan neu can doi lich.',
     'SMS-20261103-0001', NULL, lt1, '2026-11-03 10:16');

  -- Chốt két 02/11: ca sáng khớp, ca chiều lệch; các ca cũ chốt khớp
  PERFORM close_cash_drawer(lt1, '2026-11-02', 'MORNING', 1000000);
  PERFORM close_cash_drawer(lt2, '2026-11-02', 'AFTERNOON', 90000, 'Thiếu 10.000đ so với phiếu thu, đã báo Quản lý');
  FOR s IN SELECT received_by, work_date, shift,
                  coalesce(sum(amount) FILTER (WHERE method = 'CASH'), 0) AS cash
           FROM payments
           WHERE cash_closing_id IS NULL AND work_date < '2026-11-02'
           GROUP BY received_by, work_date, shift
  LOOP
    PERFORM close_cash_drawer(s.received_by, s.work_date, s.shift, s.cash);
  END LOOP;
  UPDATE cash_closings
  SET closed_at = work_date + CASE shift WHEN 'MORNING' THEN time '14:05' ELSE time '20:05' END;

  -- ===== 03/11/2026 (hôm nay) =====
  -- Khách vãng lai Khoa nhổ răng khôn (LH-09). Phiếu ghi nhầm răng 48 → hóa đơn bị Quản lý hủy,
  -- bác sĩ sửa phiếu thành 38 (DT-08, có nhật ký), lễ tân lập lại hóa đơn và thu chuyển khoản.
  a := pg_temp.book(p_khoa, bs1, 'GHE-01', pg_temp.svc('NHOKHON'), '2026-11-03 08:30', 2,
                    'COMPLETED', 'WALK_IN', lt1, '2026-11-03 08:25', 'Đau răng khôn, đến không hẹn');
  r := pg_temp.make_record(a, '2026-11-03 08:35', 'Răng khôn hàm dưới mọc lệch, viêm lợi trùm',
                           '[{"svc":"CHUPXQ","tooth":"48"},{"svc":"NHOKHON","tooth":"48"}]');
  PERFORM pg_temp.prescribe(r, 'AMOX', 15);
  PERFORM pg_temp.prescribe(r, 'PARA', 10);
  INSERT INTO prescription_items (treatment_record_id, item_id, medicine_name, dosage, quantity, unit, is_external)
  VALUES (r, NULL, 'Nước súc miệng Kin Gingival', 'Súc miệng 2 lần/ngày sau đánh răng', 1, 'chai', true);
  PERFORM pg_temp.finish_record(r);
  UPDATE treatment_record_materials SET actual_quantity = 3, note = 'Thay găng do rách'
  WHERE treatment_record_id = r AND item_id = pg_temp.itm('GANG');

  PERFORM set_config('app.staff_id', lt1::text, true);
  inv := create_invoice_from_treatment_record(r, lt1, '2026-11-03 09:40');
  PERFORM set_config('app.staff_id', ql::text, true);
  PERFORM void_invoice(inv, 'Phiếu ghi sai số răng 48, đúng là 38 — lập lại hóa đơn', ql);
  UPDATE invoices SET voided_at = '2026-11-03 09:48' WHERE id = inv;
  UPDATE invoice_adjustments SET performed_at = '2026-11-03 09:48' WHERE invoice_id = inv;

  PERFORM set_config('app.staff_id', bs1::text, true);
  PERFORM set_config('app.change_reason', 'Sửa số răng 48 → 38 theo phim X-quang', true);
  UPDATE treatment_record_items SET tooth_code = '38' WHERE treatment_record_id = r;
  PERFORM set_config('app.change_reason', '', true);

  PERFORM set_config('app.staff_id', lt1::text, true);
  inv := create_invoice_from_treatment_record(r, lt1, '2026-11-03 09:55');
  PERFORM pg_temp.pay(inv, 2090000, 'BANK_TRANSFER', '2026-11-03 10:00', lt1, 'FT26307100003');

  -- Hoa cạo vôi buổi chiều: phiếu "Chờ thanh toán", lễ tân chưa lập hóa đơn
  a := pg_temp.book(p_hoa, bs1, 'GHE-01', pg_temp.svc('CAOVOI'), '2026-11-03 14:00', 1,
                    'COMPLETED', 'RECEPTION', lt2, '2026-11-03 13:55');
  r := pg_temp.make_record(a, '2026-11-03 14:05', 'Vôi răng độ 1', '[{"svc":"CAOVOI","tooth":"FULL"}]');
  PERFORM pg_temp.finish_record(r);

  -- Bé An đã check-in, đang trong hàng chờ khám (DT-01)
  PERFORM pg_temp.book(p_an, bs1, 'GHE-02', pg_temp.svc('KHAM'), '2026-11-03 19:30', 1,
                       'ARRIVED', 'RECEPTION', lt2, '2026-11-03 19:20', 'Khám răng sữa định kỳ');

  -- ===== Lịch tương lai =====
  a := pg_temp.book(p_vinh, bs4, 'GHE-03', pg_temp.svc('IMPLANT'), '2026-11-05 08:30', 2,
                    'BOOKED', 'DOCTOR_FOLLOW_UP', bs4, NULL, 'Buổi 2 liệu trình implant: gắn abutment');
  INSERT INTO appointment_reminders (appointment_id, channel, result, recipient_phone, note, performed_by, performed_at)
  VALUES (a, 'CALL', 'CONFIRMED', '0987777888', 'Khách xác nhận, nhắc mang theo phim X-quang', lt2, '2026-11-03 16:30');

  a := pg_temp.book(p_hoa, bs1, 'GHE-02', pg_temp.svc('TRAM'), '2026-11-06 15:00', 1,
                    'BOOKED', 'RECEPTION', lt2);
  PERFORM set_config('app.staff_id', lt2::text, true);
  UPDATE appointments
  SET status = 'CANCELLED', cancel_reason_id = (SELECT id FROM cancel_reasons WHERE code = 'PATIENT_BUSY'),
      cancel_note = 'Khách đi công tác, sẽ gọi lại đặt lịch', cancelled_by = lt2,
      cancelled_at = '2026-11-03 17:00', updated_by = lt2
  WHERE id = a;

  PERFORM pg_temp.book(p_kim, bs3, 'GHE-02', pg_temp.svc('KHAM'), '2026-11-07 09:00', 1,
                       'BOOKED', 'RECEPTION', lt1, NULL, 'Bệnh nhân cũ (hồ sơ giấy 2019) quay lại khám');
  PERFORM pg_temp.book(p_nam, bs1, 'GHE-01', pg_temp.svc('SIETMC'), '2026-11-12 09:00', 1,
                       'BOOKED', 'DOCTOR_FOLLOW_UP', bs1, NULL, 'Buổi 4 liệu trình niềng');

  -- Cảnh báo tồn kho: đưa thời điểm về lúc phát sinh, Quản lý đã xem cảnh báo trụ implant
  UPDATE notifications SET created_at = '2026-10-15 10:00', is_read = true, read_by = ql, read_at = '2026-10-15 17:30'
  WHERE ref_table = 'items' AND ref_id = pg_temp.itm('TRUIMPLANT');
  UPDATE notifications SET created_at = '2026-11-02 10:20'
  WHERE ref_table = 'items' AND ref_id = pg_temp.itm('COMPOSITE');
END $$;

-- Phát sinh kho tự động mang giờ chạy script → đưa về giờ khám của phiếu (chỉ cho dữ liệu mẫu)
ALTER TABLE stock_movements DISABLE TRIGGER immutable;
UPDATE stock_movements sm SET created_at = tr.visit_at
FROM treatment_records tr
WHERE tr.id = sm.treatment_record_id;
ALTER TABLE stock_movements ENABLE TRIGGER immutable;

COMMIT;
