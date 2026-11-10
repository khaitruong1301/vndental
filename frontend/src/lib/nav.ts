import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bell,
  Boxes,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutDashboard,
  ListOrdered,
  PhoneCall,
  Receipt,
  Settings2,
  Tags,
  UserCog,
  UserRoundCheck,
  Users,
  Wallet,
  Stethoscope,
  Vault,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Hiện khi người dùng có ít nhất một quyền; rỗng = mọi nhân viên */
  perms: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: 'Chung',
    items: [
      { href: '/', label: 'Tổng quan', icon: LayoutDashboard, perms: [] },
      { href: '/notifications', label: 'Thông báo', icon: Bell, perms: [] },
    ],
  },
  {
    label: 'Bệnh nhân & lịch hẹn',
    items: [
      { href: '/patients', label: 'Bệnh nhân', icon: Users, perms: ['BN-01'] },
      { href: '/appointments', label: 'Lịch hẹn', icon: CalendarDays, perms: ['LH-01'] },
      { href: '/reception', label: 'Tiếp đón', icon: UserRoundCheck, perms: ['LH-08'] },
      { href: '/reminders', label: 'Nhắc lịch', icon: PhoneCall, perms: ['LH-05'] },
    ],
  },
  {
    label: 'Khám & điều trị',
    items: [
      { href: '/queue', label: 'Hàng chờ khám', icon: ListOrdered, perms: ['DT-01'] },
      { href: '/treatments', label: 'Phiếu điều trị', icon: Stethoscope, perms: ['DT-02', 'TT-01'] },
      { href: '/plans', label: 'Liệu trình', icon: ClipboardList, perms: ['DT-05'] },
    ],
  },
  {
    label: 'Thanh toán',
    items: [
      { href: '/billing', label: 'Lập hóa đơn', icon: FileText, perms: ['TT-01'] },
      { href: '/invoices', label: 'Hóa đơn & thu tiền', icon: Receipt, perms: ['TT-04', 'TT-06'] },
      { href: '/debts', label: 'Công nợ', icon: Wallet, perms: ['TT-06'] },
      { href: '/cash-closing', label: 'Chốt két', icon: Vault, perms: ['TT-07'] },
    ],
  },
  {
    label: 'Quản trị',
    items: [
      { href: '/admin/shifts', label: 'Ca trực bác sĩ', icon: CalendarClock, perms: ['QT-01'] },
      { href: '/admin/prices', label: 'Bảng giá', icon: Tags, perms: ['QT-02'] },
      { href: '/admin/catalog', label: 'Danh mục', icon: Settings2, perms: ['QT-03'] },
      { href: '/admin/inventory', label: 'Kho vật tư & thuốc', icon: Boxes, perms: ['QT-04'] },
      { href: '/admin/accounts', label: 'Tài khoản & phân quyền', icon: UserCog, perms: ['QT-05'] },
    ],
  },
  {
    label: 'Báo cáo',
    items: [
      {
        href: '/reports',
        label: 'Báo cáo',
        icon: BarChart3,
        perms: ['BC-01', 'BC-02', 'BC-03', 'BC-04', 'BC-05', 'BC-06', 'BC-07', 'BC-08'],
      },
    ],
  },
];
