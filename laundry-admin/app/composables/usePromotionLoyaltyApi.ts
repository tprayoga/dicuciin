import { useApi } from '~/composables/useApi'

export function usePromotionLoyaltyApi() {
  const api = useApi()

  return {
    dashboard: (month: string) => api.get(`/reports/promotion-loyalty?month=${month}`),
    voucherTemplates: () => api.get('/vouchers/templates'),
    issuedVouchers: () => api.get('/vouchers/issued'),
    voucherRedemptions: () => api.get('/vouchers/redemptions'),
    campaigns: () => api.get('/campaigns'),
    campaignLogs: (id: string) => api.get(`/campaigns/${id}/logs`),
    retailTiers: () => api.get('/memberships/tiers'),
    b2bTiers: () => api.get('/memberships/b2b-tiers'),
    partners: () => api.get('/partners'),
    happyHourRules: () => api.get('/happy-hour/rules'),
    promotionRules: () => api.get('/promotion-rules'),

    b2bSpecialPrices: () => api.get('/b2b-pricing/rules'),

    // TODO: Backend belum expose endpoint admin untuk daftar referral; saat ini hanya apply/code customer.
    referrals: () => Promise.resolve([]),
  }
}
