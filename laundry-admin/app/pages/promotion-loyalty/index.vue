<script setup lang="ts">
import { useApi } from '~/composables/useApi'
import { usePromotionLoyaltyApi } from '~/composables/usePromotionLoyaltyApi'

type TabKey =
  | 'dashboard'
  | 'wallet'
  | 'vouchers'
  | 'campaigns'
  | 'tiers'
  | 'partners'
  | 'b2b-pricing'
  | 'rules'
  | 'happy-hour'
  | 'referral'
  | 'reports'

const api = useApi()
const loyaltyApi = usePromotionLoyaltyApi()
const toast = useToast()

const loading = ref(false)
const activeTab = ref<TabKey>('dashboard')
const search = ref('')
const statusFilter = ref('ALL')
const month = ref(new Date().toISOString().slice(0, 7))
const errorMessage = ref('')

const dashboard = ref<any>({
  dashboard: {},
  voucherByStatus: [],
  campaignLogs: [],
  walletLedgers: [],
  b2bPricingImpact: [],
})
const templates = ref<any[]>([])
const issuedVouchers = ref<any[]>([])
const redemptions = ref<any[]>([])
const campaigns = ref<any[]>([])
const campaignLogs = ref<any[]>([])
const retailTiers = ref<any[]>([])
const b2bTiers = ref<any[]>([])
const partners = ref<any[]>([])
const happyHourRules = ref<any[]>([])
const promotionRules = ref<any[]>([])
const referrals = ref<any[]>([])
const b2bSpecialPrices = ref<any[]>([])

const tabs: { key: TabKey; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Promo Dashboard', icon: 'i-heroicons-squares-2x2' },
  { key: 'wallet', label: 'Wallet Ledger', icon: 'i-heroicons-wallet' },
  { key: 'vouchers', label: 'Voucher Management', icon: 'i-heroicons-ticket' },
  { key: 'campaigns', label: 'Campaign Management', icon: 'i-heroicons-megaphone' },
  { key: 'tiers', label: 'Membership Tier', icon: 'i-heroicons-trophy' },
  { key: 'partners', label: 'B2B Partner', icon: 'i-heroicons-building-office-2' },
  { key: 'b2b-pricing', label: 'B2B Pricing', icon: 'i-heroicons-tag' },
  { key: 'rules', label: 'Loyalty Point Rule', icon: 'i-heroicons-adjustments-horizontal' },
  { key: 'happy-hour', label: 'Happy Hour', icon: 'i-heroicons-clock' },
  { key: 'referral', label: 'Referral Program', icon: 'i-heroicons-share' },
  { key: 'reports', label: 'Promo Report', icon: 'i-heroicons-chart-bar-square' },
]

const voucherTypes = [
  'FREE_WASH',
  'FREE_DRY',
  'FREE_WASH_DRY',
  'NOMINAL_DISCOUNT',
  'PERCENTAGE_DISCOUNT',
  'LOTTERY_TICKET',
  'TIER_EXCLUSIVE',
  'B2B_EXCLUSIVE',
].map(value => ({ label: value, value }))

const retailTierItems = ['SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'].map(value => ({ label: value, value }))
const b2bTierItems = ['BUSINESS_PARTNER', 'GOLD_PARTNER', 'PLATINUM_PARTNER', 'DIAMOND_PARTNER'].map(value => ({ label: value, value }))
const segmentItems = ['RETAIL', 'B2B'].map(value => ({ label: value, value }))
const campaignTypeItems = ['CASHBACK_TOPUP', 'LONG_TIME_NO_SEE', 'REFERRAL', 'BIRTHDAY_REWARD', 'ANNIVERSARY_REWARD', 'MONTHLY_TIER_BENEFIT'].map(value => ({ label: value, value }))
const adjustmentItems = ['PERCENTAGE_OFF', 'FIXED_OFF', 'FIXED_PRICE'].map(value => ({ label: value, value }))
const b2bPriceTypeItems = ['DISCOUNT_PERCENT', 'FIXED_DISCOUNT', 'FIXED_PRICE'].map(value => ({ label: value, value }))

const showVoucherModal = ref(false)
const showCampaignModal = ref(false)
const showRetailTierModal = ref(false)
const showB2BTierModal = ref(false)
const showB2BSpecialPriceModal = ref(false)
const showPartnerModal = ref(false)
const showHappyHourModal = ref(false)
const showRuleModal = ref(false)
const selectedCampaign = ref<any | null>(null)
const editingVoucher = ref<any | null>(null)
const editingPartner = ref<any | null>(null)
const editingB2BSpecialPrice = ref<any | null>(null)
const editingHappyHour = ref<any | null>(null)
const editingRule = ref<any | null>(null)

const voucherForm = reactive({
  code: '',
  name: '',
  description: '',
  segment: 'RETAIL',
  voucherType: 'NOMINAL_DISCOUNT',
  value: 0,
  quota: 100,
  validityDays: 30,
  startDate: '',
  endDate: '',
  minTransaction: 0,
  maxDiscount: 0,
  applicableOutlets: '',
  applicableServices: '',
  tierRestriction: '',
  b2bTierRestriction: '',
  isActive: true,
})

const campaignForm = reactive({
  type: 'BIRTHDAY_REWARD',
  name: '',
  description: '',
  segment: 'RETAIL',
  startDate: '',
  endDate: '',
  ruleKey: '',
  ruleValue: '',
  rewardType: 'VOUCHER',
  voucherTemplateId: '',
  rewardCashback: 0,
  targetParty: 'SELF',
})

const retailTierForm = reactive({
  tier: 'SILVER',
  name: 'Silver',
  level: 1,
  thresholdSpending: 0,
  thresholdTxnCount: 0,
  pointMultiplier: 1,
  cashbackRate: 0,
  benefitDescription: '',
  color: '#0360DA',
  isActive: true,
})

const b2bTierForm = reactive({
  tier: 'BUSINESS_PARTNER',
  name: 'Business Partner',
  level: 1,
  thresholdSpending: 0,
  thresholdTxnCount: 0,
  discountRate: 0,
  pointMultiplier: 1,
  cashbackRate: 0,
  benefitDescription: '',
  isActive: true,
})

const b2bSpecialPriceForm = reactive({
  name: '',
  partnerId: '',
  tier: '',
  outletId: '',
  serviceId: '',
  machineType: '',
  priceType: 'FIXED_PRICE',
  value: 0,
  startDate: '',
  endDate: '',
  priority: 0,
  isActive: true,
})

const partnerForm = reactive({
  companyName: '',
  picName: '',
  phone: '',
  email: '',
  address: '',
  tier: 'BUSINESS_PARTNER',
  status: 'ACTIVE',
})

const happyHourForm = reactive({
  name: '',
  outletId: '',
  serviceId: '',
  machineType: '',
  daysOfWeek: '1,2,3,4,5',
  startTime: '18:00',
  endTime: '21:00',
  adjustmentType: 'PERCENTAGE_OFF',
  value: 10,
  quota: 0,
  allowVoucherStack: true,
  priority: 0,
  startDate: '',
  endDate: '',
  isActive: true,
})

const ruleForm = reactive({
  name: '',
  segment: 'RETAIL',
  minTransaction: 0,
  maxDiscount: 0,
  applicableServices: '',
  applicableOutlets: '',
  tierRestriction: '',
  maxUsagePerUser: 1,
  isActive: true,
})

const filteredTemplates = computed(() => filterRows(templates.value, ['code', 'name', 'description', 'segment']))
const filteredIssued = computed(() => applyStatus(filterRows(issuedVouchers.value, ['code', 'sourceType', 'segment']), 'status'))
const filteredRedemptions = computed(() => filterRows(redemptions.value, ['status']))
const filteredCampaigns = computed(() => applyStatus(filterRows(campaigns.value, ['name', 'type', 'status']), 'status'))
const filteredPartners = computed(() => applyStatus(filterRows(partners.value, ['companyName', 'partnerCode', 'picName', 'status']), 'status'))
const filteredHappyHour = computed(() => filterRows(happyHourRules.value, ['name', 'adjustmentType', 'daysOfWeek']))
const filteredRules = computed(() => filterRows(promotionRules.value, ['name', 'segment', 'tierRestriction']))
const filteredB2BSpecialPrices = computed(() => filterRows(b2bSpecialPrices.value, ['name', 'partnerId', 'tier', 'outletId', 'serviceId', 'machineType', 'priceType']))

function filterRows(rows: any[], fields: string[]) {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return rows
  return rows.filter(row => fields.some(field => String(row?.[field] ?? '').toLowerCase().includes(keyword)))
}

function applyStatus(rows: any[], field: string) {
  if (statusFilter.value === 'ALL') return rows
  return rows.filter(row => String(row?.[field] ?? '') === statusFilter.value)
}

function formatMoney(value: any) {
  return `Rp ${Number(value ?? 0).toLocaleString('id-ID')}`
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString('id-ID') : '-'
}

function badgeColor(value: string | boolean) {
  if (value === true || ['ACTIVE', 'APPLIED', 'USED', 'REWARDED'].includes(String(value))) return 'success'
  if (['DRAFT', 'PENDING'].includes(String(value))) return 'warning'
  if (['PAUSED', 'SUSPENDED', 'CANCELLED', 'EXPIRED'].includes(String(value))) return 'neutral'
  return 'info'
}

function clearError() {
  errorMessage.value = ''
}

async function safeLoad<T>(fn: () => Promise<T>, fallback: T) {
  try {
    return await fn()
  } catch (e: any) {
    errorMessage.value = e.message
    return fallback
  }
}

async function loadData() {
  loading.value = true
  clearError()
  try {
    const [
      d,
      vt,
      iv,
      vr,
      c,
      rt,
      bt,
      p,
      hh,
      pr,
      ref,
      sp,
    ] = await Promise.all([
      safeLoad(() => loyaltyApi.dashboard(month.value), dashboard.value),
      safeLoad(() => loyaltyApi.voucherTemplates(), []),
      safeLoad(() => loyaltyApi.issuedVouchers(), []),
      safeLoad(() => loyaltyApi.voucherRedemptions(), []),
      safeLoad(() => loyaltyApi.campaigns(), []),
      safeLoad(() => loyaltyApi.retailTiers(), []),
      safeLoad(() => loyaltyApi.b2bTiers(), []),
      safeLoad(() => loyaltyApi.partners(), []),
      safeLoad(() => loyaltyApi.happyHourRules(), []),
      safeLoad(() => loyaltyApi.promotionRules(), []),
      safeLoad(() => loyaltyApi.referrals(), []),
      safeLoad(() => loyaltyApi.b2bSpecialPrices(), []),
    ])
    dashboard.value = d
    templates.value = vt as any[]
    issuedVouchers.value = iv as any[]
    redemptions.value = vr as any[]
    campaigns.value = c as any[]
    retailTiers.value = rt as any[]
    b2bTiers.value = bt as any[]
    partners.value = p as any[]
    happyHourRules.value = hh as any[]
    promotionRules.value = pr as any[]
    referrals.value = ref as any[]
    b2bSpecialPrices.value = sp as any[]
  } finally {
    loading.value = false
  }
}

async function loadCampaignLogs(campaign: any) {
  selectedCampaign.value = campaign
  campaignLogs.value = []
  try {
    campaignLogs.value = await loyaltyApi.campaignLogs(campaign.id) as any[]
  } catch (e: any) {
    toast.add({ title: 'Gagal memuat log campaign', description: e.message, color: 'error' })
  }
}

function openVoucher(item?: any) {
  editingVoucher.value = item ?? null
  Object.assign(voucherForm, item ? {
    code: item.code,
    name: item.name,
    description: item.description || '',
    segment: item.segment,
    voucherType: item.voucherType,
    value: item.value,
    quota: item.quota ?? 100,
    validityDays: item.validityDays ?? 30,
    startDate: item.startDate?.slice(0, 10) || '',
    endDate: item.endDate?.slice(0, 10) || '',
    minTransaction: item.minTransaction ?? 0,
    maxDiscount: item.maxDiscount ?? 0,
    applicableOutlets: item.applicableOutlets || '',
    applicableServices: item.applicableServices || '',
    tierRestriction: item.tierRestriction || '',
    b2bTierRestriction: item.b2bTierRestriction || '',
    isActive: item.isActive,
  } : {
    code: '',
    name: '',
    description: '',
    segment: 'RETAIL',
    voucherType: 'NOMINAL_DISCOUNT',
    value: 0,
    quota: 100,
    validityDays: 30,
    startDate: '',
    endDate: '',
    minTransaction: 0,
    maxDiscount: 0,
    applicableOutlets: '',
    applicableServices: '',
    tierRestriction: '',
    b2bTierRestriction: '',
    isActive: true,
  })
  showVoucherModal.value = true
}

function voucherPayload() {
  return {
    ...voucherForm,
    value: Number(voucherForm.value),
    quota: voucherForm.quota ? Number(voucherForm.quota) : undefined,
    validityDays: voucherForm.validityDays ? Number(voucherForm.validityDays) : undefined,
    startDate: voucherForm.startDate || undefined,
    endDate: voucherForm.endDate || undefined,
    minTransaction: voucherForm.minTransaction ? Number(voucherForm.minTransaction) : undefined,
    maxDiscount: voucherForm.maxDiscount ? Number(voucherForm.maxDiscount) : undefined,
    applicableOutlets: voucherForm.applicableOutlets || undefined,
    applicableServices: voucherForm.applicableServices || undefined,
    tierRestriction: voucherForm.tierRestriction || undefined,
    b2bTierRestriction: voucherForm.b2bTierRestriction || undefined,
  }
}

async function saveVoucher() {
  if (!voucherForm.code || !voucherForm.name || Number(voucherForm.value) < 0) {
    toast.add({ title: 'Form voucher belum valid', description: 'Kode, nama, dan nilai wajib diisi.', color: 'error' })
    return
  }
  try {
    if (editingVoucher.value) {
      await api.patch(`/vouchers/templates/${editingVoucher.value.id}`, voucherPayload())
    } else {
      await api.post('/vouchers/templates', voucherPayload())
    }
    toast.add({ title: 'Voucher tersimpan', color: 'success' })
    showVoucherModal.value = false
    await loadData()
  } catch (e: any) {
    toast.add({ title: 'Gagal menyimpan voucher', description: e.message, color: 'error' })
  }
}

async function saveCampaign() {
  if (!campaignForm.name) {
    toast.add({ title: 'Nama campaign wajib diisi', color: 'error' })
    return
  }
  const rules = campaignForm.ruleKey ? [{ ruleKey: campaignForm.ruleKey, ruleValue: campaignForm.ruleValue }] : []
  const rewards = campaignForm.rewardType
    ? [{
        rewardType: campaignForm.rewardType,
        voucherTemplateId: campaignForm.rewardType === 'VOUCHER' ? campaignForm.voucherTemplateId || undefined : undefined,
        rewardCashback: campaignForm.rewardType === 'CASHBACK' ? Number(campaignForm.rewardCashback) : undefined,
        targetParty: campaignForm.targetParty,
      }]
    : []
  try {
    await api.post('/campaigns', {
      type: campaignForm.type,
      name: campaignForm.name,
      description: campaignForm.description || undefined,
      segment: campaignForm.segment,
      startDate: campaignForm.startDate || undefined,
      endDate: campaignForm.endDate || undefined,
      rules,
      rewards,
    })
    toast.add({ title: 'Campaign dibuat', color: 'success' })
    showCampaignModal.value = false
    await loadData()
  } catch (e: any) {
    toast.add({ title: 'Gagal menyimpan campaign', description: e.message, color: 'error' })
  }
}

async function toggleCampaign(campaign: any) {
  try {
    await api.post(`/campaigns/${campaign.id}/${campaign.isActive ? 'deactivate' : 'activate'}`, {})
    await loadData()
  } catch (e: any) {
    toast.add({ title: 'Gagal mengubah status campaign', description: e.message, color: 'error' })
  }
}

async function saveRetailTier() {
  try {
    await api.post('/memberships/tiers', { ...retailTierForm })
    toast.add({ title: 'Tier retail tersimpan', color: 'success' })
    showRetailTierModal.value = false
    await loadData()
  } catch (e: any) {
    toast.add({ title: 'Gagal menyimpan tier', description: e.message, color: 'error' })
  }
}

async function saveB2BTier() {
  try {
    await api.post('/memberships/b2b-tiers', { ...b2bTierForm })
    toast.add({ title: 'Tier B2B tersimpan', color: 'success' })
    showB2BTierModal.value = false
    await loadData()
  } catch (e: any) {
    toast.add({ title: 'Gagal menyimpan pricing B2B', description: e.message, color: 'error' })
  }
}

function openB2BSpecialPrice(item?: any) {
  editingB2BSpecialPrice.value = item ?? null
  Object.assign(b2bSpecialPriceForm, item ? {
    name: item.name,
    partnerId: item.partnerId || '',
    tier: item.tier || '',
    outletId: item.outletId || '',
    serviceId: item.serviceId || '',
    machineType: item.machineType || '',
    priceType: item.priceType || 'FIXED_PRICE',
    value: item.value ?? 0,
    startDate: item.startDate?.slice(0, 10) || '',
    endDate: item.endDate?.slice(0, 10) || '',
    priority: item.priority ?? 0,
    isActive: item.isActive,
  } : {
    name: '',
    partnerId: '',
    tier: '',
    outletId: '',
    serviceId: '',
    machineType: '',
    priceType: 'FIXED_PRICE',
    value: 0,
    startDate: '',
    endDate: '',
    priority: 0,
    isActive: true,
  })
  showB2BSpecialPriceModal.value = true
}

function b2bSpecialPricePayload() {
  return {
    ...b2bSpecialPriceForm,
    partnerId: b2bSpecialPriceForm.partnerId || undefined,
    tier: b2bSpecialPriceForm.tier || undefined,
    outletId: b2bSpecialPriceForm.outletId || undefined,
    serviceId: b2bSpecialPriceForm.serviceId || undefined,
    machineType: b2bSpecialPriceForm.machineType || undefined,
    value: Number(b2bSpecialPriceForm.value),
    priority: Number(b2bSpecialPriceForm.priority),
    startDate: b2bSpecialPriceForm.startDate || undefined,
    endDate: b2bSpecialPriceForm.endDate || undefined,
  }
}

async function saveB2BSpecialPrice() {
  if (!b2bSpecialPriceForm.name || Number(b2bSpecialPriceForm.value) < 0) {
    toast.add({ title: 'Form special price belum valid', description: 'Nama dan nilai wajib diisi.', color: 'error' })
    return
  }
  if (!b2bSpecialPriceForm.partnerId && !b2bSpecialPriceForm.tier) {
    toast.add({ title: 'Target rule belum valid', description: 'Isi Partner ID atau Tier B2B.', color: 'error' })
    return
  }
  try {
    if (editingB2BSpecialPrice.value) {
      await api.patch(`/b2b-pricing/rules/${editingB2BSpecialPrice.value.id}`, b2bSpecialPricePayload())
    } else {
      await api.post('/b2b-pricing/rules', b2bSpecialPricePayload())
    }
    toast.add({ title: 'Special price B2B tersimpan', color: 'success' })
    showB2BSpecialPriceModal.value = false
    await loadData()
  } catch (e: any) {
    toast.add({ title: 'Gagal menyimpan special price', description: e.message, color: 'error' })
  }
}

function openPartner(item?: any) {
  editingPartner.value = item ?? null
  Object.assign(partnerForm, item ? {
    companyName: item.companyName,
    picName: item.picName,
    phone: item.phone,
    email: item.email || '',
    address: item.address || '',
    tier: item.tier || 'BUSINESS_PARTNER',
    status: item.status || 'ACTIVE',
  } : {
    companyName: '',
    picName: '',
    phone: '',
    email: '',
    address: '',
    tier: 'BUSINESS_PARTNER',
    status: 'ACTIVE',
  })
  showPartnerModal.value = true
}

async function savePartner() {
  if (!partnerForm.companyName || !partnerForm.picName || !partnerForm.phone) {
    toast.add({ title: 'Form partner belum valid', description: 'Perusahaan, PIC, dan nomor telepon wajib diisi.', color: 'error' })
    return
  }
  try {
    if (editingPartner.value) {
      await api.patch(`/partners/${editingPartner.value.id}`, partnerForm)
    } else {
      await api.post('/partners', partnerForm)
    }
    toast.add({ title: 'Partner tersimpan', color: 'success' })
    showPartnerModal.value = false
    await loadData()
  } catch (e: any) {
    toast.add({ title: 'Gagal menyimpan partner', description: e.message, color: 'error' })
  }
}

async function setPartnerStatus(partner: any, status: string) {
  try {
    await api.patch(`/partners/${partner.id}`, { status })
    await loadData()
  } catch (e: any) {
    toast.add({ title: 'Gagal mengubah status partner', description: e.message, color: 'error' })
  }
}

function openHappyHour(item?: any) {
  editingHappyHour.value = item ?? null
  Object.assign(happyHourForm, item ? {
    name: item.name,
    outletId: item.outletId || '',
    serviceId: item.serviceId || '',
    machineType: item.machineType || '',
    daysOfWeek: item.daysOfWeek,
    startTime: item.startTime,
    endTime: item.endTime,
    adjustmentType: item.adjustmentType,
    value: item.value,
    quota: item.quota ?? 0,
    allowVoucherStack: item.allowVoucherStack ?? true,
    priority: item.priority ?? 0,
    startDate: item.startDate?.slice(0, 10) || '',
    endDate: item.endDate?.slice(0, 10) || '',
    isActive: item.isActive,
  } : {
    name: '',
    outletId: '',
    serviceId: '',
    machineType: '',
    daysOfWeek: '1,2,3,4,5',
    startTime: '18:00',
    endTime: '21:00',
    adjustmentType: 'PERCENTAGE_OFF',
    value: 10,
    quota: 0,
    allowVoucherStack: true,
    priority: 0,
    startDate: '',
    endDate: '',
    isActive: true,
  })
  showHappyHourModal.value = true
}

async function saveHappyHour() {
  if (!happyHourForm.name || !happyHourForm.daysOfWeek || !happyHourForm.startTime || !happyHourForm.endTime) {
    toast.add({ title: 'Form happy hour belum valid', color: 'error' })
    return
  }
  const payload = {
    ...happyHourForm,
    outletId: happyHourForm.outletId || undefined,
    serviceId: happyHourForm.serviceId || undefined,
    machineType: happyHourForm.machineType || undefined,
    startDate: happyHourForm.startDate || undefined,
    endDate: happyHourForm.endDate || undefined,
    value: Number(happyHourForm.value),
    quota: happyHourForm.quota ? Number(happyHourForm.quota) : undefined,
    allowVoucherStack: happyHourForm.allowVoucherStack,
    priority: Number(happyHourForm.priority),
  }
  try {
    if (editingHappyHour.value) {
      await api.patch(`/happy-hour/rules/${editingHappyHour.value.id}`, payload)
    } else {
      await api.post('/happy-hour/rules', payload)
    }
    toast.add({ title: 'Happy hour tersimpan', color: 'success' })
    showHappyHourModal.value = false
    await loadData()
  } catch (e: any) {
    toast.add({ title: 'Gagal menyimpan happy hour', description: e.message, color: 'error' })
  }
}

function openRule(item?: any) {
  editingRule.value = item ?? null
  Object.assign(ruleForm, item ? {
    name: item.name,
    segment: item.segment || 'RETAIL',
    minTransaction: item.minTransaction ?? 0,
    maxDiscount: item.maxDiscount ?? 0,
    applicableServices: item.applicableServices || '',
    applicableOutlets: item.applicableOutlets || '',
    tierRestriction: item.tierRestriction || '',
    maxUsagePerUser: item.maxUsagePerUser ?? 1,
    isActive: item.isActive,
  } : {
    name: '',
    segment: 'RETAIL',
    minTransaction: 0,
    maxDiscount: 0,
    applicableServices: '',
    applicableOutlets: '',
    tierRestriction: '',
    maxUsagePerUser: 1,
    isActive: true,
  })
  showRuleModal.value = true
}

async function saveRule() {
  if (!ruleForm.name) {
    toast.add({ title: 'Nama rule wajib diisi', color: 'error' })
    return
  }
  const payload = {
    ...ruleForm,
    minTransaction: ruleForm.minTransaction ? Number(ruleForm.minTransaction) : undefined,
    maxDiscount: ruleForm.maxDiscount ? Number(ruleForm.maxDiscount) : undefined,
    applicableServices: ruleForm.applicableServices || undefined,
    applicableOutlets: ruleForm.applicableOutlets || undefined,
    tierRestriction: ruleForm.tierRestriction || undefined,
  }
  try {
    if (editingRule.value) {
      await api.patch(`/promotion-rules/${editingRule.value.id}`, payload)
    } else {
      await api.post('/promotion-rules', payload)
    }
    toast.add({ title: 'Rule tersimpan', color: 'success' })
    showRuleModal.value = false
    await loadData()
  } catch (e: any) {
    toast.add({ title: 'Gagal menyimpan rule', description: e.message, color: 'error' })
  }
}

watch(month, () => loadData())
onMounted(loadData)
</script>

<template>
  <div class="space-y-4">
    <div class="dc-page-card p-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">Promotion & Loyalty Engine</h2>
        <p class="text-sm text-[#6f809f]">Kelola voucher, campaign, wallet ledger, membership, B2B, dan laporan promo.</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UInput v-model="month" type="month" class="w-[160px] dc-input-like" />
        <UButton icon="i-heroicons-arrow-path" variant="outline" class="dc-btn-outline" :loading="loading" @click="loadData">Refresh</UButton>
      </div>
    </div>

    <div class="dc-page-card p-3">
      <div class="flex gap-2 overflow-x-auto pb-1">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="shrink-0 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
          :class="activeTab === tab.key ? 'bg-[#0360da] text-white' : 'text-[#5f7294] hover:bg-[#f2f6fc]'"
          @click="activeTab = tab.key"
        >
          <UIcon :name="tab.icon" class="text-lg" />
          <span>{{ tab.label }}</span>
        </button>
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <UInput v-model="search" icon="i-heroicons-magnifying-glass" placeholder="Cari data" class="w-full max-w-xs dc-input-like" />
      <USelect v-model="statusFilter" :items="['ALL', 'ACTIVE', 'DRAFT', 'PAUSED', 'USED', 'EXPIRED', 'SUSPENDED'].map(v => ({ label: v === 'ALL' ? 'Semua status' : v, value: v }))" class="w-48 dc-input-like" />
    </div>

    <UAlert v-if="errorMessage" color="error" variant="soft" title="Sebagian data gagal dimuat" :description="errorMessage" />
    <div v-if="loading" class="dc-page-card p-4 text-sm text-[#6f809f]">Memuat data promotion & loyalty...</div>

    <template v-else>
      <section v-if="activeTab === 'dashboard'" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="dc-page-card p-4">
            <p class="text-xs font-semibold text-[#6f809f]">VOUCHER ISSUED</p>
            <p class="text-3xl font-bold text-[#0360da] mt-2">{{ dashboard.dashboard?.totalVoucherIssued ?? 0 }}</p>
          </div>
          <div class="dc-page-card p-4">
            <p class="text-xs font-semibold text-[#6f809f]">VOUCHER USED</p>
            <p class="text-3xl font-bold text-[#19984d] mt-2">{{ dashboard.dashboard?.totalVoucherUsed ?? 0 }}</p>
          </div>
          <div class="dc-page-card p-4">
            <p class="text-xs font-semibold text-[#6f809f]">BURN RATE</p>
            <p class="text-3xl font-bold text-[#fd6a01] mt-2">{{ dashboard.dashboard?.voucherBurnRate ?? 0 }}%</p>
          </div>
          <div class="dc-page-card p-4">
            <p class="text-xs font-semibold text-[#6f809f]">OUTSTANDING POINT</p>
            <p class="text-3xl font-bold text-[#272526] mt-2">{{ (dashboard.dashboard?.totalOutstandingPoint ?? 0).toLocaleString('id-ID') }}</p>
          </div>
          <div class="dc-page-card p-4 md:col-span-2">
            <p class="text-xs font-semibold text-[#6f809f]">BONUS BALANCE ISSUED</p>
            <p class="text-3xl font-bold text-[#0360da] mt-2">{{ formatMoney(dashboard.dashboard?.totalBonusBalanceIssued) }}</p>
          </div>
          <div class="dc-page-card p-4">
            <p class="text-xs font-semibold text-[#6f809f]">B2B VOLUME</p>
            <p class="text-3xl font-bold text-[#19984d] mt-2">{{ formatMoney(dashboard.dashboard?.b2bTransactionVolume) }}</p>
          </div>
          <div class="dc-page-card p-4">
            <p class="text-xs font-semibold text-[#6f809f]">PROMO IMPACT</p>
            <p class="text-3xl font-bold text-[#da2d14] mt-2">{{ formatMoney(dashboard.dashboard?.promoRevenueImpact) }}</p>
          </div>
        </div>
      </section>

      <section v-if="activeTab === 'wallet'" class="dc-page-card p-4 overflow-x-auto">
        <h3 class="text-lg font-semibold mb-3">Wallet Ledger</h3>
        <table class="w-full min-w-[900px] text-sm">
          <thead class="bg-[#0349a8] text-white text-left">
            <tr><th class="p-2">Tanggal</th><th class="p-2">Owner</th><th class="p-2">Bucket</th><th class="p-2">Arah</th><th class="p-2">Nominal</th><th class="p-2">Reference</th><th class="p-2">Order</th></tr>
          </thead>
          <tbody>
            <tr v-if="(dashboard.walletLedgers || []).length === 0"><td colspan="7" class="p-4 text-center text-[#6f809f]">Belum ada wallet ledger.</td></tr>
            <tr v-for="row in dashboard.walletLedgers" :key="row.id" class="border-b border-[#e1e8f2]">
              <td class="p-2">{{ formatDate(row.createdAt) }}</td>
              <td class="p-2">{{ row.wallet?.partner?.companyName || row.wallet?.customer?.user?.name || '-' }}</td>
              <td class="p-2">{{ row.walletType }}</td>
              <td class="p-2"><UBadge :color="badgeColor(row.direction) as any" variant="soft" size="xs">{{ row.direction }}</UBadge></td>
              <td class="p-2">{{ formatMoney(row.amount) }}</td>
              <td class="p-2">{{ row.referenceType || '-' }}</td>
              <td class="p-2">{{ row.order?.orderNumber || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="activeTab === 'vouchers'" class="space-y-4">
        <div class="flex justify-end">
          <UButton icon="i-heroicons-plus" class="dc-btn-primary" @click="openVoucher()">Create Voucher</UButton>
        </div>
        <div class="dc-page-card p-4 overflow-x-auto">
          <h3 class="text-lg font-semibold mb-3">Voucher Template</h3>
          <table class="w-full min-w-[1000px] text-sm">
            <thead class="bg-[#0349a8] text-white text-left">
              <tr><th class="p-2">Kode</th><th class="p-2">Nama</th><th class="p-2">Segment</th><th class="p-2">Type</th><th class="p-2">Quota</th><th class="p-2">Issued</th><th class="p-2">Expiry</th><th class="p-2">Restriction</th><th class="p-2">Status</th><th class="p-2">Aksi</th></tr>
            </thead>
            <tbody>
              <tr v-if="filteredTemplates.length === 0"><td colspan="10" class="p-4"><CommonMascotEmptyState image="/mascot/06_app_flow_home_outlet_promo_history/08_promo_empty_waiting.png" title="Belum ada voucher" description="Voucher campaign akan muncul di sini setelah dibuat." /></td></tr>
              <tr v-for="item in filteredTemplates" :key="item.id" class="border-b border-[#e1e8f2]">
                <td class="p-2 font-semibold">{{ item.code }}</td>
                <td class="p-2">{{ item.name }}</td>
                <td class="p-2">{{ item.segment }}</td>
                <td class="p-2">{{ item.voucherType }}</td>
                <td class="p-2">{{ item.quota ?? 'Unlimited' }}</td>
                <td class="p-2">{{ item.issuedCount }}</td>
                <td class="p-2">{{ item.validityDays ? `${item.validityDays} hari` : formatDate(item.endDate) }}</td>
                <td class="p-2">{{ item.tierRestriction || item.b2bTierRestriction || item.applicableOutlets || '-' }}</td>
                <td class="p-2"><UBadge :color="badgeColor(item.isActive) as any" variant="soft" size="xs">{{ item.isActive ? 'ACTIVE' : 'INACTIVE' }}</UBadge></td>
                <td class="p-2"><UButton size="xs" variant="ghost" class="dc-btn-outline" @click="openVoucher(item)">Edit</UButton></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="dc-page-card p-4 overflow-x-auto">
          <h3 class="text-lg font-semibold mb-3">Usage / Redemption</h3>
          <table class="w-full min-w-[800px] text-sm">
            <thead class="bg-[#0349a8] text-white text-left">
              <tr><th class="p-2">Voucher</th><th class="p-2">Order</th><th class="p-2">Discount</th><th class="p-2">Status</th><th class="p-2">Tanggal</th></tr>
            </thead>
            <tbody>
              <tr v-if="filteredRedemptions.length === 0"><td colspan="5" class="p-4 text-center text-[#6f809f]">Belum ada redemption.</td></tr>
              <tr v-for="item in filteredRedemptions" :key="item.id" class="border-b border-[#e1e8f2]">
                <td class="p-2">{{ item.userVoucher?.code }}</td>
                <td class="p-2">{{ item.order?.orderNumber }}</td>
                <td class="p-2">{{ formatMoney(item.discountApplied) }}</td>
                <td class="p-2"><UBadge :color="badgeColor(item.status) as any" variant="soft" size="xs">{{ item.status }}</UBadge></td>
                <td class="p-2">{{ formatDate(item.redeemedAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="activeTab === 'campaigns'" class="space-y-4">
        <div class="flex justify-end"><UButton icon="i-heroicons-plus" class="dc-btn-primary" @click="showCampaignModal = true">Create Campaign</UButton></div>
        <div class="dc-page-card p-4 overflow-x-auto">
          <table class="w-full min-w-[900px] text-sm">
            <thead class="bg-[#0349a8] text-white text-left"><tr><th class="p-2">Nama</th><th class="p-2">Type</th><th class="p-2">Segment</th><th class="p-2">Reward</th><th class="p-2">Periode</th><th class="p-2">Status</th><th class="p-2">Aksi</th></tr></thead>
            <tbody>
              <tr v-if="filteredCampaigns.length === 0"><td colspan="7" class="p-4 text-center text-[#6f809f]">Belum ada campaign.</td></tr>
              <tr v-for="item in filteredCampaigns" :key="item.id" class="border-b border-[#e1e8f2]">
                <td class="p-2 font-semibold">{{ item.name }}</td>
                <td class="p-2">{{ item.type }}</td>
                <td class="p-2">{{ item.segment }}</td>
                <td class="p-2">{{ item.rewards?.map((r: any) => r.rewardType).join(', ') || '-' }}</td>
                <td class="p-2">{{ formatDate(item.startDate) }} - {{ formatDate(item.endDate) }}</td>
                <td class="p-2"><UBadge :color="badgeColor(item.status) as any" variant="soft" size="xs">{{ item.status }}</UBadge></td>
                <td class="p-2 flex gap-2"><UButton size="xs" variant="ghost" class="dc-btn-outline" @click="toggleCampaign(item)">{{ item.isActive ? 'Disable' : 'Enable' }}</UButton><UButton size="xs" variant="ghost" class="dc-btn-outline" @click="loadCampaignLogs(item)">Log</UButton></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="selectedCampaign" class="dc-page-card p-4 overflow-x-auto">
          <h3 class="text-lg font-semibold mb-3">Execution Log: {{ selectedCampaign.name }}</h3>
          <table class="w-full min-w-[700px] text-sm">
            <thead class="bg-[#0349a8] text-white text-left"><tr><th class="p-2">Run At</th><th class="p-2">Job</th><th class="p-2">Scanned</th><th class="p-2">Issued</th><th class="p-2">Status</th><th class="p-2">Message</th></tr></thead>
            <tbody>
              <tr v-if="campaignLogs.length === 0"><td colspan="6" class="p-4 text-center text-[#6f809f]">Belum ada log.</td></tr>
              <tr v-for="log in campaignLogs" :key="log.id" class="border-b border-[#e1e8f2]"><td class="p-2">{{ formatDate(log.runAt) }}</td><td class="p-2">{{ log.jobName }}</td><td class="p-2">{{ log.scannedCount }}</td><td class="p-2">{{ log.issuedCount }}</td><td class="p-2">{{ log.status }}</td><td class="p-2">{{ log.message || '-' }}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="activeTab === 'tiers'" class="space-y-4">
        <div class="flex justify-end"><UButton icon="i-heroicons-plus" class="dc-btn-primary" @click="showRetailTierModal = true">Set Retail Tier</UButton></div>
        <div class="dc-page-card p-4 overflow-x-auto">
          <table class="w-full min-w-[900px] text-sm">
            <thead class="bg-[#0349a8] text-white text-left"><tr><th class="p-2">Tier</th><th class="p-2">Level</th><th class="p-2">Spending</th><th class="p-2">Txn</th><th class="p-2">Point x</th><th class="p-2">Voucher Benefit</th><th class="p-2">Status</th></tr></thead>
            <tbody>
              <tr v-if="retailTiers.length === 0"><td colspan="7" class="p-4 text-center text-[#6f809f]">Belum ada konfigurasi tier retail.</td></tr>
              <tr v-for="item in retailTiers" :key="item.id" class="border-b border-[#e1e8f2]"><td class="p-2 font-semibold">{{ item.name }} ({{ item.tier }})</td><td class="p-2">{{ item.level }}</td><td class="p-2">{{ formatMoney(item.thresholdSpending) }}</td><td class="p-2">{{ item.thresholdTxnCount ?? '-' }}</td><td class="p-2">{{ item.pointMultiplier }}x</td><td class="p-2">{{ item.benefitDescription || 'TODO: link monthly voucher benefit API' }}</td><td class="p-2"><UBadge :color="badgeColor(item.isActive) as any" variant="soft" size="xs">{{ item.isActive ? 'ACTIVE' : 'INACTIVE' }}</UBadge></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="activeTab === 'partners'" class="space-y-4">
        <div class="flex justify-end"><UButton icon="i-heroicons-plus" class="dc-btn-primary" @click="openPartner()">Create Partner</UButton></div>
        <div class="dc-page-card p-4 overflow-x-auto">
          <table class="w-full min-w-[1000px] text-sm">
            <thead class="bg-[#0349a8] text-white text-left"><tr><th class="p-2">Partner</th><th class="p-2">PIC</th><th class="p-2">Tier</th><th class="p-2">Wallet</th><th class="p-2">Txn</th><th class="p-2">Status</th><th class="p-2">Aksi</th></tr></thead>
            <tbody>
              <tr v-if="filteredPartners.length === 0"><td colspan="7" class="p-4 text-center text-[#6f809f]">Belum ada partner B2B.</td></tr>
              <tr v-for="item in filteredPartners" :key="item.id" class="border-b border-[#e1e8f2]"><td class="p-2"><p class="font-semibold">{{ item.companyName }}</p><p class="text-xs text-[#6f809f]">{{ item.partnerCode }}</p></td><td class="p-2">{{ item.picName }}<br><span class="text-xs text-[#6f809f]">{{ item.phone }}</span></td><td class="p-2">{{ item.tier }}</td><td class="p-2">{{ formatMoney(item.wallet?.balance) }}</td><td class="p-2">{{ item.membershipStatus?.successfulTxnCount ?? 0 }}</td><td class="p-2"><UBadge :color="badgeColor(item.status) as any" variant="soft" size="xs">{{ item.status }}</UBadge></td><td class="p-2 flex gap-2"><UButton size="xs" variant="ghost" class="dc-btn-outline" @click="openPartner(item)">Edit</UButton><UButton size="xs" variant="ghost" class="dc-btn-outline" @click="setPartnerStatus(item, item.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')">{{ item.status === 'ACTIVE' ? 'Reject' : 'Approve' }}</UButton></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="activeTab === 'b2b-pricing'" class="space-y-4">
        <div class="flex flex-wrap justify-end gap-2">
          <UButton icon="i-heroicons-plus" class="dc-btn-primary" @click="showB2BTierModal = true">Set Discount by Tier</UButton>
          <UButton icon="i-heroicons-tag" variant="outline" class="dc-btn-outline" @click="openB2BSpecialPrice()">Create Special Price</UButton>
        </div>
        <div class="dc-page-card p-4 overflow-x-auto">
          <table class="w-full min-w-[900px] text-sm">
            <thead class="bg-[#0349a8] text-white text-left"><tr><th class="p-2">Tier</th><th class="p-2">Discount</th><th class="p-2">Spending</th><th class="p-2">Txn</th><th class="p-2">Rule</th><th class="p-2">Status</th></tr></thead>
            <tbody>
              <tr v-if="b2bTiers.length === 0"><td colspan="6" class="p-4 text-center text-[#6f809f]">Belum ada pricing tier B2B.</td></tr>
              <tr v-for="item in b2bTiers" :key="item.id" class="border-b border-[#e1e8f2]"><td class="p-2 font-semibold">{{ item.name }} ({{ item.tier }})</td><td class="p-2">{{ item.discountRate }}%</td><td class="p-2">{{ formatMoney(item.thresholdSpending) }}</td><td class="p-2">{{ item.thresholdTxnCount ?? '-' }}</td><td class="p-2">Fallback jika tidak ada special price</td><td class="p-2"><UBadge :color="badgeColor(item.isActive) as any" variant="soft" size="xs">{{ item.isActive ? 'ACTIVE' : 'INACTIVE' }}</UBadge></td></tr>
            </tbody>
          </table>
        </div>
        <div class="dc-page-card p-4 overflow-x-auto">
          <h3 class="text-lg font-semibold mb-3">Special Price by Partner/Tier/Outlet/Machine</h3>
          <table class="w-full min-w-[1100px] text-sm">
            <thead class="bg-[#0349a8] text-white text-left"><tr><th class="p-2">Nama</th><th class="p-2">Target</th><th class="p-2">Outlet/Service</th><th class="p-2">Machine</th><th class="p-2">Type</th><th class="p-2">Value</th><th class="p-2">Periode</th><th class="p-2">Priority</th><th class="p-2">Status</th><th class="p-2">Aksi</th></tr></thead>
            <tbody>
              <tr v-if="filteredB2BSpecialPrices.length === 0"><td colspan="10" class="p-4 text-center text-[#6f809f]">Belum ada data special price machine/outlet.</td></tr>
              <tr v-for="item in filteredB2BSpecialPrices" :key="item.id" class="border-b border-[#e1e8f2]"><td class="p-2 font-semibold">{{ item.name }}</td><td class="p-2">{{ item.partner?.companyName || item.partnerId || item.tier || '-' }}</td><td class="p-2">{{ item.outlet?.name || item.outletId || 'Semua outlet' }}<br><span class="text-xs text-[#6f809f]">{{ item.service?.name || item.serviceId || 'Semua layanan' }}</span></td><td class="p-2">{{ item.machineType || 'Semua mesin' }}</td><td class="p-2">{{ item.priceType }}</td><td class="p-2">{{ item.priceType === 'DISCOUNT_PERCENT' ? `${item.value}%` : formatMoney(item.value) }}</td><td class="p-2">{{ formatDate(item.startDate) }} - {{ formatDate(item.endDate) }}</td><td class="p-2">{{ item.priority ?? 0 }}</td><td class="p-2"><UBadge :color="badgeColor(item.isActive) as any" variant="soft" size="xs">{{ item.isActive ? 'ACTIVE' : 'INACTIVE' }}</UBadge></td><td class="p-2"><UButton size="xs" variant="ghost" class="dc-btn-outline" @click="openB2BSpecialPrice(item)">Edit</UButton></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="activeTab === 'rules'" class="space-y-4">
        <div class="flex justify-end"><UButton icon="i-heroicons-plus" class="dc-btn-primary" @click="openRule()">Create Rule</UButton></div>
        <div class="dc-page-card p-4 overflow-x-auto">
          <table class="w-full min-w-[900px] text-sm">
            <thead class="bg-[#0349a8] text-white text-left"><tr><th class="p-2">Nama</th><th class="p-2">Segment</th><th class="p-2">Min Txn</th><th class="p-2">Max Discount</th><th class="p-2">Tier</th><th class="p-2">Usage</th><th class="p-2">Status</th><th class="p-2">Aksi</th></tr></thead>
            <tbody>
              <tr v-if="filteredRules.length === 0"><td colspan="8" class="p-4 text-center text-[#6f809f]">Belum ada loyalty point rule.</td></tr>
              <tr v-for="item in filteredRules" :key="item.id" class="border-b border-[#e1e8f2]"><td class="p-2 font-semibold">{{ item.name }}</td><td class="p-2">{{ item.segment || 'ALL' }}</td><td class="p-2">{{ formatMoney(item.minTransaction) }}</td><td class="p-2">{{ formatMoney(item.maxDiscount) }}</td><td class="p-2">{{ item.tierRestriction || '-' }}</td><td class="p-2">{{ item.maxUsagePerUser || '-' }}</td><td class="p-2"><UBadge :color="badgeColor(item.isActive) as any" variant="soft" size="xs">{{ item.isActive ? 'ACTIVE' : 'INACTIVE' }}</UBadge></td><td class="p-2"><UButton size="xs" variant="ghost" class="dc-btn-outline" @click="openRule(item)">Edit</UButton></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="activeTab === 'happy-hour'" class="space-y-4">
        <div class="flex justify-end"><UButton icon="i-heroicons-plus" class="dc-btn-primary" @click="openHappyHour()">Create Happy Hour</UButton></div>
        <div class="dc-page-card p-4 overflow-x-auto">
          <table class="w-full min-w-[1000px] text-sm">
            <thead class="bg-[#0349a8] text-white text-left"><tr><th class="p-2">Nama</th><th class="p-2">Outlet</th><th class="p-2">Machine/Service</th><th class="p-2">Hari</th><th class="p-2">Jam</th><th class="p-2">Discount</th><th class="p-2">Quota</th><th class="p-2">Status</th><th class="p-2">Aksi</th></tr></thead>
            <tbody>
              <tr v-if="filteredHappyHour.length === 0"><td colspan="9" class="p-4 text-center text-[#6f809f]">Belum ada happy hour.</td></tr>
              <tr v-for="item in filteredHappyHour" :key="item.id" class="border-b border-[#e1e8f2]"><td class="p-2 font-semibold">{{ item.name }}</td><td class="p-2">{{ item.outlet?.name || 'Semua outlet' }}</td><td class="p-2">{{ item.service?.name || item.machineType || 'Semua mesin' }}</td><td class="p-2">{{ item.daysOfWeek }}</td><td class="p-2">{{ item.startTime }} - {{ item.endTime }}</td><td class="p-2">{{ item.adjustmentType }} {{ item.value }}</td><td class="p-2">{{ item.quota ? `${item.usedQuota ?? 0}/${item.quota}` : 'Unlimited' }}</td><td class="p-2"><UBadge :color="badgeColor(item.isActive) as any" variant="soft" size="xs">{{ item.isActive ? 'ACTIVE' : 'INACTIVE' }}</UBadge></td><td class="p-2"><UButton size="xs" variant="ghost" class="dc-btn-outline" @click="openHappyHour(item)">Edit</UButton></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="activeTab === 'referral'" class="space-y-4">
        <div class="dc-page-card p-4 overflow-x-auto">
          <table class="w-full min-w-[700px] text-sm">
            <thead class="bg-[#0349a8] text-white text-left"><tr><th class="p-2">Kode</th><th class="p-2">Referrer</th><th class="p-2">Referee</th><th class="p-2">Status</th><th class="p-2">Rewarded At</th></tr></thead>
            <tbody>
              <tr v-if="referrals.length === 0"><td colspan="5" class="p-4 text-center text-[#6f809f]">Belum ada data referral.</td></tr>
              <tr v-for="item in referrals" :key="item.id" class="border-b border-[#e1e8f2]">
                <td class="p-2 font-semibold">{{ item.referralCode }}</td>
                <td class="p-2">{{ item.referrer?.name || '-' }}<br><span class="text-xs text-[#6f809f]">{{ item.referrer?.phone || item.referrer?.memberCode || '-' }}</span></td>
                <td class="p-2">{{ item.referee?.name || '-' }}<br><span class="text-xs text-[#6f809f]">{{ item.referee?.phone || item.referee?.memberCode || '-' }}</span></td>
                <td class="p-2"><UBadge :color="badgeColor(item.status) as any" variant="soft" size="xs">{{ item.status }}</UBadge></td>
                <td class="p-2">{{ formatDate(item.rewardedAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="activeTab === 'reports'" class="space-y-4">
        <div class="dc-page-card p-4 overflow-x-auto">
          <h3 class="text-lg font-semibold mb-3">Voucher Funnel</h3>
          <table class="w-full min-w-[500px] text-sm">
            <thead class="bg-[#0349a8] text-white text-left"><tr><th class="p-2">Status</th><th class="p-2">Jumlah</th></tr></thead>
            <tbody>
              <tr v-if="(dashboard.voucherByStatus || []).length === 0"><td colspan="2" class="p-4 text-center text-[#6f809f]">Belum ada data funnel.</td></tr>
              <tr v-for="item in dashboard.voucherByStatus" :key="item.status" class="border-b border-[#e1e8f2]"><td class="p-2">{{ item.status }}</td><td class="p-2">{{ item.count }}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="dc-page-card p-4 overflow-x-auto">
          <h3 class="text-lg font-semibold mb-3">B2B Pricing Impact</h3>
          <table class="w-full min-w-[1000px] text-sm">
            <thead class="bg-[#0349a8] text-white text-left">
              <tr><th class="p-2">Rule</th><th class="p-2">Partner/Tier</th><th class="p-2">Outlet</th><th class="p-2">Service</th><th class="p-2">Machine</th><th class="p-2">Usage</th><th class="p-2">Discount Impact</th></tr>
            </thead>
            <tbody>
              <tr v-if="(dashboard.b2bPricingImpact || []).length === 0"><td colspan="7" class="p-4 text-center text-[#6f809f]">Belum ada impact special pricing B2B.</td></tr>
              <tr v-for="item in dashboard.b2bPricingImpact" :key="item.ruleId" class="border-b border-[#e1e8f2]">
                <td class="p-2 font-semibold">{{ item.ruleName }}</td>
                <td class="p-2">{{ item.partnerName || item.tier || '-' }}</td>
                <td class="p-2">{{ item.outletName || 'Semua outlet' }}</td>
                <td class="p-2">{{ item.serviceName || 'Semua layanan' }}</td>
                <td class="p-2">{{ item.machineType || 'Semua mesin' }}</td>
                <td class="p-2">{{ item.usageCount ?? 0 }}</td>
                <td class="p-2">{{ formatMoney(item.discountAmount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <UModal v-model:open="showVoucherModal" :title="editingVoucher ? 'Edit Voucher' : 'Create Voucher'" size="lg">
      <template #body>
        <form class="space-y-4" @submit.prevent="saveVoucher">
          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="Kode"><UInput v-model="voucherForm.code" class="w-full" required /></UFormField>
            <UFormField label="Nama"><UInput v-model="voucherForm.name" class="w-full" required /></UFormField>
            <UFormField label="Segment"><USelect v-model="voucherForm.segment" :items="segmentItems" class="w-full" /></UFormField>
            <UFormField label="Voucher Type"><USelect v-model="voucherForm.voucherType" :items="voucherTypes" class="w-full" /></UFormField>
            <UFormField label="Nilai"><UInput v-model.number="voucherForm.value" type="number" min="0" class="w-full" /></UFormField>
            <UFormField label="Quota"><UInput v-model.number="voucherForm.quota" type="number" min="1" class="w-full" /></UFormField>
            <UFormField label="Expiry Days"><UInput v-model.number="voucherForm.validityDays" type="number" min="1" class="w-full" /></UFormField>
            <UFormField label="Min Transaction"><UInput v-model.number="voucherForm.minTransaction" type="number" min="0" class="w-full" /></UFormField>
            <UFormField label="Start Date"><UInput v-model="voucherForm.startDate" type="date" class="w-full" /></UFormField>
            <UFormField label="End Date"><UInput v-model="voucherForm.endDate" type="date" class="w-full" /></UFormField>
            <UFormField label="Tier Restriction"><USelect v-model="voucherForm.tierRestriction" :items="[{ label: 'Tidak ada', value: '' }, ...retailTierItems]" class="w-full" /></UFormField>
            <UFormField label="B2B Tier Restriction"><USelect v-model="voucherForm.b2bTierRestriction" :items="[{ label: 'Tidak ada', value: '' }, ...b2bTierItems]" class="w-full" /></UFormField>
          </div>
          <UFormField label="Outlet Restriction CSV"><UInput v-model="voucherForm.applicableOutlets" class="w-full" /></UFormField>
          <UFormField label="Machine/Service Restriction CSV"><UInput v-model="voucherForm.applicableServices" class="w-full" /></UFormField>
          <UFormField label="Deskripsi"><UTextarea v-model="voucherForm.description" class="w-full" :rows="2" /></UFormField>
          <div class="flex justify-end"><UButton type="submit" class="dc-btn-primary">Simpan</UButton></div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="showCampaignModal" title="Create Campaign" size="lg">
      <template #body>
        <form class="space-y-4" @submit.prevent="saveCampaign">
          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="Nama"><UInput v-model="campaignForm.name" class="w-full" required /></UFormField>
            <UFormField label="Trigger"><USelect v-model="campaignForm.type" :items="campaignTypeItems" class="w-full" /></UFormField>
            <UFormField label="Segment"><USelect v-model="campaignForm.segment" :items="segmentItems" class="w-full" /></UFormField>
            <UFormField label="Reward"><USelect v-model="campaignForm.rewardType" :items="['VOUCHER', 'CASHBACK'].map(value => ({ label: value, value }))" class="w-full" /></UFormField>
            <UFormField label="Voucher Reward"><USelect v-model="campaignForm.voucherTemplateId" :items="templates.map(v => ({ label: `${v.code} - ${v.name}`, value: v.id }))" class="w-full" /></UFormField>
            <UFormField label="Cashback Reward"><UInput v-model.number="campaignForm.rewardCashback" type="number" min="0" class="w-full" /></UFormField>
            <UFormField label="Rule Key"><UInput v-model="campaignForm.ruleKey" placeholder="inactiveDays, minTopup, tier" class="w-full" /></UFormField>
            <UFormField label="Rule Value"><UInput v-model="campaignForm.ruleValue" class="w-full" /></UFormField>
          </div>
          <UFormField label="Deskripsi"><UTextarea v-model="campaignForm.description" class="w-full" :rows="2" /></UFormField>
          <div class="flex justify-end"><UButton type="submit" class="dc-btn-primary">Simpan</UButton></div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="showRetailTierModal" title="Set Retail Tier">
      <template #body>
        <form class="space-y-4" @submit.prevent="saveRetailTier">
          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="Tier"><USelect v-model="retailTierForm.tier" :items="retailTierItems" class="w-full" /></UFormField>
            <UFormField label="Nama"><UInput v-model="retailTierForm.name" class="w-full" /></UFormField>
            <UFormField label="Spending Threshold"><UInput v-model.number="retailTierForm.thresholdSpending" type="number" class="w-full" /></UFormField>
            <UFormField label="Transaction Threshold"><UInput v-model.number="retailTierForm.thresholdTxnCount" type="number" class="w-full" /></UFormField>
            <UFormField label="Point Multiplier"><UInput v-model.number="retailTierForm.pointMultiplier" type="number" step="0.1" class="w-full" /></UFormField>
            <UFormField label="Monthly Voucher Benefit"><UInput v-model="retailTierForm.benefitDescription" placeholder="TODO: link voucher benefit API" class="w-full" /></UFormField>
          </div>
          <div class="flex justify-end"><UButton type="submit" class="dc-btn-primary">Simpan</UButton></div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="showB2BTierModal" title="Set B2B Pricing">
      <template #body>
        <form class="space-y-4" @submit.prevent="saveB2BTier">
          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="Tier"><USelect v-model="b2bTierForm.tier" :items="b2bTierItems" class="w-full" /></UFormField>
            <UFormField label="Nama"><UInput v-model="b2bTierForm.name" class="w-full" /></UFormField>
            <UFormField label="Discount by Tier (%)"><UInput v-model.number="b2bTierForm.discountRate" type="number" class="w-full" /></UFormField>
            <UFormField label="Spending Threshold"><UInput v-model.number="b2bTierForm.thresholdSpending" type="number" class="w-full" /></UFormField>
            <UFormField label="Transaction Threshold"><UInput v-model.number="b2bTierForm.thresholdTxnCount" type="number" class="w-full" /></UFormField>
            <UFormField label="Active Period"><UInput placeholder="TODO: active period API" disabled class="w-full" /></UFormField>
          </div>
          <div class="flex justify-end"><UButton type="submit" class="dc-btn-primary">Simpan</UButton></div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="showB2BSpecialPriceModal" :title="editingB2BSpecialPrice ? 'Edit B2B Special Price' : 'Create B2B Special Price'" size="lg">
      <template #body>
        <form class="space-y-4" @submit.prevent="saveB2BSpecialPrice">
          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="Nama"><UInput v-model="b2bSpecialPriceForm.name" class="w-full" required /></UFormField>
            <UFormField label="Partner ID"><UInput v-model="b2bSpecialPriceForm.partnerId" placeholder="Kosong jika target tier" class="w-full" /></UFormField>
            <UFormField label="Tier"><USelect v-model="b2bSpecialPriceForm.tier" :items="[{ label: 'Tidak ada', value: '' }, ...b2bTierItems]" class="w-full" /></UFormField>
            <UFormField label="Outlet ID"><UInput v-model="b2bSpecialPriceForm.outletId" placeholder="Kosong = semua outlet" class="w-full" /></UFormField>
            <UFormField label="Service ID"><UInput v-model="b2bSpecialPriceForm.serviceId" placeholder="Kosong = semua layanan" class="w-full" /></UFormField>
            <UFormField label="Machine Type"><UInput v-model="b2bSpecialPriceForm.machineType" placeholder="WASHER / DRYER" class="w-full" /></UFormField>
            <UFormField label="Price Type"><USelect v-model="b2bSpecialPriceForm.priceType" :items="b2bPriceTypeItems" class="w-full" /></UFormField>
            <UFormField label="Value"><UInput v-model.number="b2bSpecialPriceForm.value" type="number" min="0" class="w-full" /></UFormField>
            <UFormField label="Start Date"><UInput v-model="b2bSpecialPriceForm.startDate" type="date" class="w-full" /></UFormField>
            <UFormField label="End Date"><UInput v-model="b2bSpecialPriceForm.endDate" type="date" class="w-full" /></UFormField>
            <UFormField label="Priority"><UInput v-model.number="b2bSpecialPriceForm.priority" type="number" min="0" class="w-full" /></UFormField>
            <UFormField label="Status"><USelect v-model="b2bSpecialPriceForm.isActive" :items="[{ label: 'ACTIVE', value: true }, { label: 'INACTIVE', value: false }]" class="w-full" /></UFormField>
          </div>
          <div class="flex justify-end"><UButton type="submit" class="dc-btn-primary">Simpan</UButton></div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="showPartnerModal" :title="editingPartner ? 'Edit Partner' : 'Create Partner'">
      <template #body>
        <form class="space-y-4" @submit.prevent="savePartner">
          <UFormField label="Company"><UInput v-model="partnerForm.companyName" class="w-full" required /></UFormField>
          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="PIC"><UInput v-model="partnerForm.picName" class="w-full" required /></UFormField>
            <UFormField label="Phone"><UInput v-model="partnerForm.phone" class="w-full" required /></UFormField>
            <UFormField label="Tier"><USelect v-model="partnerForm.tier" :items="b2bTierItems" class="w-full" /></UFormField>
            <UFormField label="Status"><USelect v-model="partnerForm.status" :items="['ACTIVE', 'SUSPENDED'].map(value => ({ label: value, value }))" class="w-full" /></UFormField>
          </div>
          <UFormField label="Email"><UInput v-model="partnerForm.email" class="w-full" /></UFormField>
          <UFormField label="Address"><UTextarea v-model="partnerForm.address" class="w-full" :rows="2" /></UFormField>
          <div class="flex justify-end"><UButton type="submit" class="dc-btn-primary">Simpan</UButton></div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="showHappyHourModal" :title="editingHappyHour ? 'Edit Happy Hour' : 'Create Happy Hour'">
      <template #body>
        <form class="space-y-4" @submit.prevent="saveHappyHour">
          <UFormField label="Nama"><UInput v-model="happyHourForm.name" class="w-full" required /></UFormField>
          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="Outlet ID"><UInput v-model="happyHourForm.outletId" placeholder="Kosong = semua outlet" class="w-full" /></UFormField>
            <UFormField label="Machine / Service ID"><UInput v-model="happyHourForm.serviceId" placeholder="Kosong = semua layanan" class="w-full" /></UFormField>
            <UFormField label="Hari"><UInput v-model="happyHourForm.daysOfWeek" class="w-full" /></UFormField>
            <UFormField label="Discount"><USelect v-model="happyHourForm.adjustmentType" :items="adjustmentItems" class="w-full" /></UFormField>
            <UFormField label="Start Time"><UInput v-model="happyHourForm.startTime" type="time" class="w-full" /></UFormField>
            <UFormField label="End Time"><UInput v-model="happyHourForm.endTime" type="time" class="w-full" /></UFormField>
            <UFormField label="Value"><UInput v-model.number="happyHourForm.value" type="number" min="0" class="w-full" /></UFormField>
            <UFormField label="Quota"><UInput v-model.number="happyHourForm.quota" type="number" min="0" placeholder="0 = unlimited" class="w-full" /></UFormField>
            <UFormField label="Stack Voucher"><USelect v-model="happyHourForm.allowVoucherStack" :items="[{ label: 'Boleh digabung', value: true }, { label: 'Tidak boleh', value: false }]" class="w-full" /></UFormField>
          </div>
          <div class="flex justify-end"><UButton type="submit" class="dc-btn-primary">Simpan</UButton></div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="showRuleModal" :title="editingRule ? 'Edit Rule' : 'Create Rule'">
      <template #body>
        <form class="space-y-4" @submit.prevent="saveRule">
          <UFormField label="Nama"><UInput v-model="ruleForm.name" class="w-full" required /></UFormField>
          <div class="grid md:grid-cols-2 gap-4">
            <UFormField label="Segment"><USelect v-model="ruleForm.segment" :items="segmentItems" class="w-full" /></UFormField>
            <UFormField label="Tier Restriction"><USelect v-model="ruleForm.tierRestriction" :items="[{ label: 'Tidak ada', value: '' }, ...retailTierItems]" class="w-full" /></UFormField>
            <UFormField label="Min Transaction"><UInput v-model.number="ruleForm.minTransaction" type="number" class="w-full" /></UFormField>
            <UFormField label="Max Discount"><UInput v-model.number="ruleForm.maxDiscount" type="number" class="w-full" /></UFormField>
            <UFormField label="Max Usage"><UInput v-model.number="ruleForm.maxUsagePerUser" type="number" class="w-full" /></UFormField>
          </div>
          <UFormField label="Outlet Restriction CSV"><UInput v-model="ruleForm.applicableOutlets" class="w-full" /></UFormField>
          <UFormField label="Service Restriction CSV"><UInput v-model="ruleForm.applicableServices" class="w-full" /></UFormField>
          <div class="flex justify-end"><UButton type="submit" class="dc-btn-primary">Simpan</UButton></div>
        </form>
      </template>
    </UModal>
  </div>
</template>
