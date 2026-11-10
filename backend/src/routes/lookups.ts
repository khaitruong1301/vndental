// Danh mục dùng chung cho mọi màn hình (dropdown bác sĩ, ghế, dịch vụ, thuốc, lý do hủy...)
import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (_req, res) => {
  const [doctors, staff, chairs, services, items, cancelReasons, roles] = await Promise.all([
    query(
      `SELECT s.id, s.staff_code, s.full_name, s.is_part_time
       FROM staff s JOIN roles r ON r.id = s.role_id
       WHERE r.code = 'DOCTOR' AND s.is_active ORDER BY s.staff_code`,
    ),
    query(
      `SELECT s.id, s.staff_code, s.full_name, r.code AS role
       FROM staff s JOIN roles r ON r.id = s.role_id
       WHERE s.is_active ORDER BY s.staff_code`,
    ),
    query('SELECT id, code, name FROM chairs WHERE is_active ORDER BY code'),
    query(
      `SELECT s.id, s.code, s.name, s.category, s.unit, s.tooth_scope, s.default_slots,
              (SELECT sp.price FROM service_prices sp
               WHERE sp.service_id = s.id AND sp.effective_from <= clinic_local(now())::date
               ORDER BY sp.effective_from DESC LIMIT 1) AS current_price
       FROM services s WHERE s.is_active ORDER BY s.category, s.name`,
    ),
    query(
      `SELECT i.id, i.code, i.name, i.item_type, i.unit, i.current_stock, i.min_stock, i.default_dosage,
              (SELECT ip.price FROM item_prices ip
               WHERE ip.item_id = i.id AND ip.effective_from <= clinic_local(now())::date
               ORDER BY ip.effective_from DESC LIMIT 1) AS current_price
       FROM items i WHERE i.is_active ORDER BY i.item_type, i.name`,
    ),
    query('SELECT id, code, name, is_no_show FROM cancel_reasons WHERE is_active ORDER BY sort_order, name'),
    query('SELECT id, code, name FROM roles ORDER BY id'),
  ]);
  res.json({ doctors, staff, chairs, services, items, cancel_reasons: cancelReasons, roles });
});

export default router;
