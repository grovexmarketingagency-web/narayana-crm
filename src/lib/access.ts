import type { Role, DB } from './types'
export const PAGES = [
  { path: '/', label: 'Dashboard', roles: ['owner', 'manager', 'cashier', 'accountant'] },
  { path: '/billing', label: 'Billing', roles: ['owner', 'manager', 'cashier'] },
  { path: '/bills', label: 'Bills', roles: ['owner', 'manager', 'cashier', 'accountant'] },
  { path: '/customers', label: 'Customers', roles: ['owner', 'manager', 'cashier'] },
  { path: '/credit', label: 'Credit & dues', roles: ['owner', 'manager', 'cashier', 'accountant'] },
  { path: '/alterations', label: 'Alterations', roles: ['owner', 'manager', 'cashier'] },
  { path: '/returns', label: 'Returns & vouchers', roles: ['owner', 'manager', 'cashier'] },
  { path: '/products', label: 'Products & stock', roles: ['owner', 'manager'] },
  { path: '/labels', label: 'Barcode labels', roles: ['owner', 'manager'] },
  { path: '/purchases', label: 'Purchases', roles: ['owner', 'manager', 'accountant'] },
  { path: '/stock-count', label: 'Stock count', roles: ['owner', 'manager'] },
  { path: '/suppliers', label: 'Suppliers', roles: ['owner', 'manager', 'accountant'] },
  { path: '/offers', label: 'Offers & coupons', roles: ['owner', 'manager'] },
  { path: '/salesmen', label: 'Salesmen', roles: ['owner', 'manager'] },
  { path: '/accounts', label: 'Accounts', roles: ['owner', 'manager', 'accountant'] },
  { path: '/reports', label: 'Reports', roles: ['owner', 'manager', 'accountant'] },
  { path: '/backup', label: 'Backup & export', roles: ['owner', 'manager', 'accountant'] },
  { path: '/settings', label: 'Settings & staff', roles: ['owner'] },
] as const satisfies readonly { path: string; label: string; roles: Role[] }[]
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
