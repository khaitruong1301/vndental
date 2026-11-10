# Nha khoa Nụ Cười Việt — hệ thống quản lý phòng khám

Next.js 15 (`frontend/`) → proxy `/api` → Node.js Express 5 (`backend/`) → PostgreSQL 17 `ClinicCybersoftDB` (Docker).

Đọc trước khi sửa code:
- Kiến trúc, cấu trúc thư mục, quy ước: `.claude/docs/architecture/overview.md`
- Database (bảng ↔ use case, trigger, hàm nghiệp vụ): `.claude/docs/architecture/database.md`
- Use case: `.claude/docs/requirements/use-case.md`
- Sơ đồ màn hình: `.claude/docs/ui-ux/man-hinh-tong-quan.drawio`

Quy tắc chính:
- Luật nghiệp vụ nằm trong DB (trigger/hàm); backend gọi hàm DB, không tính lại tiền/kho/lịch.
- Ghi dữ liệu luôn qua `withTx(user.id, ...)`; phân quyền bằng `requirePerm('<mã UC>')`.
- Ngày giờ theo `Asia/Ho_Chi_Minh` — dựng trong SQL hoặc `frontend/src/lib/format.ts`, không dùng múi giờ máy.
- JSON snake_case; giao diện tiếng Việt có dấu, dùng `frontend/src/components/ui.tsx`.
- Phát triển/kiểm thử trên `ClinicCybersoftDB_test` (`CLINIC_DB_NAME=ClinicCybersoftDB_test`), không làm bẩn DB chính.

Chạy: `docker compose up -d` · `npm run dev` · typecheck: `npm --prefix backend run typecheck` / `npm --prefix frontend run typecheck`.
