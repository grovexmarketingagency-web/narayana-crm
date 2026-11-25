import type { Role, DB } from './types'
export const PAGES = [
  { path: '/', group: 'Sales', label: 'Home', roles: ['owner', 'manager', 'cashier', 'accountant'] },
  { path: '/billing', group: 'Sales', label: 'Billing', roles: ['owner', 'manager', 'cashier'] },
  { path: '/bills', group: 'Sales', label: 'Bills', roles: ['owner', 'manager', 'cashier', 'accountant'] },
  { path: '/customers', group: 'Sales', label: 'Customers', roles: ['owner', 'manager', 'cashier'] },
  { path: '/credit', group: 'Sales', label: 'Credit & dues', roles: ['owner', 'manager', 'cashier', 'accountant'] },
  { path: '/alterations', group: 'Sales', label: 'Alterations', roles: ['owner', 'manager', 'cashier'] },
  { path: '/returns', group: 'Sales', label: 'Returns & vouchers', roles: ['owner', 'manager', 'cashier'] },
  { path: '/products', group: 'Stock', label: 'Products & stock', roles: ['owner', 'manager'] },
  { path: '/labels', group: 'Stock', label: 'Barcode labels', roles: ['owner', 'manager'] },
  { path: '/purchases', group: 'Stock', label: 'Purchases', roles: ['owner', 'manager', 'accountant'] },
  { path: '/stock-count', group: 'Stock', label: 'Stock count', roles: ['owner', 'manager'] },
  { path: '/suppliers', group: 'Stock', label: 'Suppliers', roles: ['owner', 'manager', 'accountant'] },
  { path: '/offers', group: 'Shop', label: 'Offers & coupons', roles: ['owner', 'manager'] },
  { path: '/salesmen', group: 'Shop', label: 'Salesmen', roles: ['owner', 'manager'] },
  { path: '/accounts', group: 'Money', label: 'Accounts', roles: ['owner', 'manager', 'accountant'] },
  { path: '/reports', group: 'Money', label: 'Reports', roles: ['owner', 'manager', 'accountant'] },
  { path: '/tools', group: 'Shop', label: 'Shop tools', roles: ['owner', 'manager', 'cashier', 'accountant'] },
  { path: '/backup', group: 'Shop', label: 'Backup & export', roles: ['owner', 'manager', 'accountant'] },
  { path: '/settings', group: 'Shop', label: 'Settings & staff', roles: ['owner'] },
] as const satisfies readonly { path: string; group: string; label: string; roles: Role[] }[]
/** menu headings, in order */
export const GROUPS = ['Sales', 'Stock', 'Money', 'Shop'] as const
export const ROLES: Role[] = ['owner', 'manager', 'cashier', 'accountant']
export const defaultPermissions = (): Record<Role, string[]> =>
  Object.fromEntries(ROLES.map(r => [r, PAGES.filter(p => (p.roles as readonly Role[]).includes(r)).map(p => p.path)])) as Record<Role, string[]>
const baseOf = (path: string) => '/' + path.split('?')[0].split('/')[1]
export const canSee = (db: DB, role: Role, path: string): boolean => {
  const base = baseOf(path)
  if (base === '/expenses') return canSee(db, role, '/accounts')
  if (role === 'owner') return PAGES.some(p => p.path === base)
  return (db.permissions?.[role] || defaultPermissions()[role]).includes(base)
}
export const readOnly = (role: Role) => role === 'accountant'
