export type UserRole = 'SUPER_ADMIN' | 'OWNER' | 'ADMIN_OUTLET' | 'CASHIER' | 'OPERATOR' | 'TECHNICIAN' | 'CUSTOMER'

export interface User {
  id: string
  name: string
  email: string
  phone: string
  role: UserRole
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface LoginResponse extends AuthTokens {
  user: User
}

export interface Outlet {
  id: string
  name: string
  code: string
  address: string
  phone: string
  latitude: number | null
  longitude: number | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Service {
  id: string
  name: string
  code: string
  description: string | null
  unit: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Order {
  id: string
  orderNumber: string
  customerId: string | null
  outletId: string
  sourcePlatform: string
  status: OrderStatus
  subtotal: number
  discountAmount: number
  deliveryFee: number
  totalAmount: number
  notes: string | null
  orderDate: string
  createdAt: string
  updatedAt: string
  outlet?: Outlet
  customer?: Customer | null
  items?: OrderItem[]
}

export type OrderStatus =
  | 'DRAFT'
  | 'WAITING_PAYMENT'
  | 'PAID'
  | 'RECEIVED'
  | 'WASHING'
  | 'DRYING'
  | 'IRONING'
  | 'PACKING'
  | 'READY_PICKUP'
  | 'OUT_FOR_DELIVERY'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED'

export interface OrderItem {
  id: string
  orderId: string
  serviceId: string
  serviceName: string
  quantity: number
  unit: string
  pricePerUnit: number
  subtotal: number
  notes: string | null
}

export interface Customer {
  id: string
  userId: string
  memberCode: string
  loyaltyPoints: number
  createdAt: string
  updatedAt: string
  user?: User
}

export interface Promo {
  id: string
  code: string
  name: string
  description: string | null
  promoType: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_DELIVERY'
  value: number
  startDate: string
  endDate: string
  quota: number
  usedCount: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Kiosk {
  id: string
  outletId: string
  kioskCode: string
  name: string
  location: string | null
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE'
  lastHeartbeat: string | null
  createdAt: string
  updatedAt: string
  outlet?: Outlet
}

export interface IotDevice {
  id: string
  outletId: string
  kioskId: string | null
  deviceCode: string
  deviceType: 'KIOSK' | 'DIGITAL_SCALE' | 'RECEIPT_PRINTER' | 'LABEL_PRINTER' | 'SMART_LOCKER' | 'WASHING_MACHINE' | 'DRYER_MACHINE' | 'QR_SCANNER'
  name: string
  manufacturer: string | null
  model: string | null
  firmwareVersion: string | null
  status: 'ONLINE' | 'OFFLINE' | 'ERROR' | 'MAINTENANCE'
  lastHeartbeatAt: string | null
  createdAt: string
  updatedAt: string
  outlet?: Outlet
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}
