# Kiến trúc dự án — Hệ thống quản lý Nha khoa Nụ Cười Việt

Tài liệu liên quan: [use-case.md](../requirements/use-case.md) · [database.md](database.md) · [man-hinh-tong-quan.drawio](../ui-ux/man-hinh-tong-quan.drawio) (sơ đồ màn hình, luồng nghiệp vụ, wireframe — mở bằng draw.io / extension Draw.io Integration).

## 1. Tổng thể

```
Trình duyệt ──► Next.js 15 (frontend/, cổng 3000)
                 │  trang React (client components), middleware chặn khi chưa có cookie
                 │  rewrites: /api/*  ──►  http://localhost:4000/api/*
                 ▼
               Node.js Express 5 (backend/, cổng 4000)
                 │  JWT trong cookie httpOnly "clinic_token", phân quyền theo mã use case
                 │  pg Pool, timezone Asia/Ho_Chi_Minh, transaction gắn app.staff_id
                 ▼
               PostgreSQL 17 (Docker) — ClinicCybersoftDB
                 ràng buộc + trigger + hàm nghiệp vụ (chống trùng lịch, trừ kho, công nợ,
                 chụp giá, chốt két, audit log) — xem database.md
```

- Trình duyệt chỉ gọi `/api/*` cùng origin với Next.js → không cần CORS, cookie đăng nhập dùng chung.
- Luật nghiệp vụ quan trọng đặt ở **DB** (nguồn sự thật duy nhất); backend chỉ kiểm tra đầu vào, phân quyền, gọi hàm DB và trả lỗi tiếng Việt; frontend chỉ hiển thị.

## 2. Cấu trúc thư mục

```
buoi3_4/
├── .env                      # thông tin DB, JWT_SECRET, API_PORT (không commit)
├── docker-compose.yml        # postgres:17 + pgadmin
├── package.json              # npm run dev → chạy song song backend + frontend
├── database/                 # 00 tạo role/DB · 01 schema · 02 seed · 03 view báo cáo · 04 dữ liệu mẫu · init.sh
│   └── migrations/           # thay đổi áp cho DB đã tạo (01_schema.sql luôn là bản đầy đủ mới nhất)
├── backend/
│   ├── uploads/              # file đính kèm hồ sơ bệnh nhân (BN-06), không commit
│   └── src/
│       ├── index.ts          # khởi động server
│       ├── app.ts            # gắn middleware + router theo module
│       ├── config.ts         # đọc ../.env (biến shell được ưu tiên)
│       ├── db.ts             # pool, query/queryOne, withTx(staffId, fn, changeReason)
│       ├── auth.ts           # JWT, requireAuth, requirePerm('<mã UC>'), currentUser
│       ├── errors.ts         # HttpError + đổi lỗi PostgreSQL/zod thành thông báo tiếng Việt
│       ├── validate.ts       # schema zod dùng chung (ngày, giờ, tiền, id)
│       ├── services/smsGateway.ts   # cổng SMS/Zalo (stub giai đoạn 1)
│       └── routes/           # mỗi module một file (bảng mục 3)
└── frontend/
    └── src/
        ├── middleware.ts     # chưa đăng nhập → /login
        ├── app/
        │   ├── layout.tsx, globals.css (Tailwind 4)
        │   ├── login/        # UC-00
        │   └── (main)/       # khu vực đã đăng nhập: AuthProvider + AppShell (menu theo quyền)
        │       ├── page.tsx  # Tổng quan
        │       ├── patients/ appointments/ reception/ reminders/
        │       ├── queue/ treatments/ plans/
        │       ├── billing/ invoices/ debts/ cash-closing/
        │       ├── admin/{shifts,prices,catalog,inventory,accounts}/
        │       ├── reports/ notifications/ account/
        ├── components/
        │   ├── ui.tsx        # Button, Input, Field, Card, DataTable, Modal, Tabs, Badge, Alert...
        │   ├── toast.tsx, AppShell.tsx, PatientPicker.tsx (BN-01 dùng chung)
        │   └── <module>/     # component riêng từng module (appointments, treatments, billing...)
        └── lib/
            ├── api.ts        # fetch wrapper → /api, tự chuyển về /login khi 401
            ├── auth.tsx      # useAuth (user, can(), logout), useLookups, RequirePerm
            ├── hooks.ts      # useApi (GET + reload), useAction (ghi + toast), useDebounced
            ├── format.ts     # tiền VND, ngày giờ theo giờ phòng khám, todayStr/addDays
            ├── labels.ts     # nhãn + màu trạng thái
            ├── nav.ts        # menu + quyền cần có
            └── types.ts      # kiểu dùng chung (AuthUser, Lookups, PatientSummary)
```

## 3. Module (backend route ↔ màn hình ↔ use case)

| Module | API (`/api/...`) | Màn hình | Use case |
|---|---|---|---|
| Xác thực | `auth` (login, logout, me, change-password) | `/login`, `/account` | UC-00 |
| Dùng chung | `lookups` (bác sĩ, ghế, dịch vụ + giá hiện hành, thuốc, lý do hủy), `dashboard`, `notifications` | `/`, `/notifications` | DT-07 |
| Bệnh nhân | `patients` | `/patients`, `/patients/new`, `/patients/[id]`, `/patients/[id]/edit` | BN-01…06 |
| Lịch hẹn | `appointments` | `/appointments`, `/appointments/new`, `/reception`, `/reminders` | LH-01…09 |
| Điều trị | `treatments`, `plans` | `/queue`, `/treatments`, `/treatments/[id]`, `/plans`, `/plans/new`, `/plans/[id]` | DT-01…09 |
| Thanh toán | `billing` | `/billing`, `/invoices`, `/invoices/[id]`, `/invoices/[id]/print`, `/debts`, `/cash-closing` | TT-01…08 |
| Quản trị | `admin` | `/admin/shifts`, `/admin/prices`, `/admin/catalog`, `/admin/inventory`, `/admin/accounts` | QT-01…05 |
| Báo cáo | `reports` | `/reports` (8 tab) | BC-01…08 |

## 4. Quy ước

**Xác thực & phân quyền**
- Đăng nhập cấp JWT (12 giờ, cookie httpOnly `clinic_token`) chỉ chứa `id` + `ver` (= `staff.token_version`). Mỗi request `requireAuth` đọc lại DB: tài khoản còn hoạt động, `token_version` khớp, vai trò và quyền hiện hành (view `v_role_effective_permissions`, Quản lý ⊃ Lễ tân). Vì vậy khóa tài khoản / đổi mật khẩu / đặt lại mật khẩu làm phiên cũ hết hiệu lực ngay (trigger tăng `token_version`), đổi ma trận quyền có hiệu lực từ request kế tiếp.
- `must_change_password = true` (tài khoản mới, vừa được đặt lại mật khẩu) → `requirePasswordChanged` chặn mọi API trừ `/auth/*`, `/lookups`, `/notifications/unread-count`; frontend tự chuyển tới `/account`.
- 401 luôn kèm xóa cookie (tránh vòng lặp `/` ↔ `/login`); tham số `?next=` sau đăng nhập chỉ chấp nhận đường dẫn cùng origin.
- Backend: mỗi endpoint `requirePerm('LH-02')`…; frontend: menu lọc theo `can()`, mỗi trang bọc `<RequirePerm perms={[...]}>`, nút/link sang chức năng khác chỉ hiện khi có quyền. Frontend chỉ để ẩn/hiện — backend mới là nơi chặn.

**Ghi dữ liệu**
- Mọi thao tác ghi đi qua `withTx(user.id, fn, changeReason?)` → `SET LOCAL app.staff_id / app.change_reason` để trigger ghi `audit_logs`, `stock_movements` đúng người, đúng lý do (DT-08/09).
- Ưu tiên gọi hàm DB thay vì tự tính: `create_invoice_from_treatment_record`, `create_invoice_for_treatment_plan`, `apply_invoice_discount`, `void_invoice`, `close_cash_drawer`, `fill_material_norms`.
- Lỗi ràng buộc DB (trùng lịch, ngoài ca, thu vượt nợ, ca đã chốt…) được `errors.ts` đổi thành HTTP 400/403/404/409 với thông báo tiếng Việt.

**Dữ liệu & thời gian**
- JSON trả về dùng **snake_case** như cột DB (riêng `/auth/me` dùng camelCase). `date` → chuỗi `YYYY-MM-DD`, `numeric`/`bigint` → number, `timestamptz` → ISO.
- Không tính ngày giờ bằng múi giờ máy: backend dựng thời điểm trong SQL (`($1::date + $2::time) AT TIME ZONE 'Asia/Ho_Chi_Minh'`, `clinic_local()`); frontend dùng `lib/format.ts` (`todayStr`, `addDays`, `fmtDateTime` với `timeZone: Asia/Ho_Chi_Minh`).

**Giao diện**
- Tailwind 4, màu chủ đạo teal; dùng component trong `components/ui.tsx`; toàn bộ chữ tiếng Việt có dấu; nhãn trạng thái lấy từ `lib/labels.ts`.
- Trang in (`/invoices/[id]/print`) dựa vào class `no-print` để ẩn khung ứng dụng.

## 5. Chạy dự án

```bash
docker compose up -d                 # PostgreSQL + pgAdmin
./database/init.sh --sample          # tạo DB, schema, dữ liệu mẫu (chỉ lần đầu)
npm install && npm run install:all   # cài thư viện gốc + backend + frontend
npm run dev                          # API :4000 + web :3000 → http://localhost:3000
```

- Tài khoản mẫu (mật khẩu `Clinic@123`): `quan.tm` (Quản lý), `ha.nt`, `mai.lt` (Lễ tân), `duc.pv`, `lan.ht`, `bao.vq`, `anh.dn` (Bác sĩ).
- Chạy API trên DB khác: `CLINIC_DB_NAME=ClinicCybersoftDB_test npm --prefix backend run dev` (DB test dùng khi phát triển, có cùng schema + dữ liệu mẫu).
- Kiểm tra kiểu: `npm --prefix backend run typecheck`, `npm --prefix frontend run typecheck`; build: `npm --prefix frontend run build`.

**Thay đổi DB**
- Sửa `database/01_schema.sql` (để DB mới tạo đúng) **và** thêm file `database/migrations/<ngày>_<mô tả>.sql` (`CREATE OR REPLACE` / `ALTER ... IF NOT EXISTS`) rồi áp cho cả `ClinicCybersoftDB` và `ClinicCybersoftDB_test` (và DB production nếu đã triển khai).

**Production (DB online — Neon)**
- Backend đọc cấu hình theo thứ tự: biến môi trường của host > `.env.production` (khi `NODE_ENV=production`) > `.env`.
- Production bắt buộc `DATABASE_URL` (connection string, ưu tiên hơn `CLINIC_DB_*`) và `JWT_SECRET` ≥ 32 ký tự; cookie `secure`, `trust proxy` bật; cổng lấy từ `PORT`.
- Neon: dùng chuỗi **Direct connection** (pooler không nhận tham số khởi động `timezone`), `sslmode=verify-full`.
- Đưa DB local lên: điền `DATABASE_URL` vào `.env.production` → `./database/deploy-remote.sh` (tạo DB ICU vi-VN + timezone, `pg_dump` → `psql` qua container Postgres; `--force` để xóa và nạp lại).
- Chạy API trỏ DB online: `npm --prefix backend run start:prod`. Frontend trỏ API qua `BACKEND_URL`.
- File bệnh nhân lưu ở `UPLOAD_DIR` (mặc định `backend/uploads`) — host miễn phí thường xóa ổ đĩa khi khởi động lại, cần ổ bền vững hoặc object storage.

**Production trên Vercel** (region `sin1` cạnh Neon Singapore, khai báo trong `backend/vercel.json`, `frontend/vercel.json`)

| Project Vercel | Thư mục | Domain | Biến môi trường |
|---|---|---|---|
| `bevndental` | `backend/` | https://bevndental.vercel.app | `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`, `DB_POOL_MAX=3` |
| `vndental` | `frontend/` | https://vndental.vercel.app | `BACKEND_URL=https://bevndental.vercel.app` (mặc định production trong `next.config.ts`) |

- Deploy: `cd backend && vercel deploy --prod`, `cd frontend && vercel deploy --prod` (đã `vercel link`, `.vercel/` không commit).
- Backend chạy Express zero-config: Vercel lấy `src/app.ts` làm entrypoint (default export app); `src/index.ts` chỉ `listen` khi không có biến `VERCEL`.
- Import tương đối trong backend **phải có đuôi `.js`** (`./db.js`) — Vercel biên dịch từng file sang ESM, Node ESM không tự thêm đuôi.
- Trình duyệt chỉ gọi `vndental.vercel.app/api/*`; Next.js rewrite sang backend → cookie đăng nhập cùng origin.
- Giới hạn Vercel: body request tối đa 4,5 MB (upload file bệnh nhân lớn hơn sẽ lỗi); file upload ghi vào `/tmp` và mất khi function khởi động lại → cần object storage (Vercel Blob, S3...) nếu dùng thật.

## 6. Kiểm thử

- Mỗi module được kiểm thử API bằng curl trên `ClinicCybersoftDB_test` (kể cả trường hợp bị chặn và phân quyền).
- QA tích hợp 04/11/2026: workflow 8 luồng chạy trên trình duyệt thật (đăng nhập & phân quyền, bệnh nhân, lịch hẹn, điều trị, thanh toán, quản trị, báo cáo, rà hợp đồng giữa module) + xác minh độc lập từng lỗi → 44 lỗi xác nhận đã được sửa; migration tương ứng trong `database/migrations/2026-11-04_*`.

## 7. Phiên bản & ghi chú kỹ thuật

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| Node.js | 20.18 | Tailwind giữ ở 4.1.x vì 4.3 cần Node ≥ 20.19 |
| Next.js / React | 15.5 / 19.1 | `npm audit` báo PostCSS bên trong Next 15 (chỉ ảnh hưởng lúc build CSS của chính dự án); hết khi nâng Next 16. `experimental.middlewareClientMaxBodySize = 12mb` để upload 10MB qua proxy |
| Express | 5 | lỗi trong handler async tự chuyển tới `errorHandler` |
| pg / zod / bcryptjs / jsonwebtoken / multer | 8 / 4 / 3 / 9 / 2 | bcrypt tương thích hash `crypt()` của pgcrypto trong dữ liệu mẫu |

Ngoài phạm vi giai đoạn 1 (theo use-case.md): bệnh nhân tự đặt lịch, cổng thanh toán, bảo hiểm, đa chi nhánh. Cổng SMS/Zalo đang là stub ghi log — thay bằng nhà cung cấp thật trong `backend/src/services/smsGateway.ts`.
