/* =========================================================================
   All copy / imagery from the original static build, kept in one place so
   every screen renders from data instead of duplicated markup.
   ========================================================================= */

export const IMG = {
  concert: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1600&q=80',
  premiere: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=700&q=80',
  premiereLarge: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1400&q=80',
  journey: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=700&q=80',
  studio: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=700&q=80',
  konser: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=700&q=80',
  creator: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=900&q=80',
  authLogin: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=1000&q=80',
  authSignup: 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=1000&q=80',
  authReset: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=1000&q=80',
  avatarKonde: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80',
  avatarKondeLg: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=140&q=80',
  avatarZuchu: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=100&q=80',
  avatarZuchuLg: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=140&q=80',
  avatarMarioo: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100&q=80',
  avatarRayvanny: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80',
  avatarRayvannyLg: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=140&q=80',
}

/* ---------- HERO ---------- */
export const HERO_STATS = [
  { count: 12450, label: 'Active Users' },
  { count: 245, label: 'Creators' },
  { count: 1236, label: 'Videos' },
  { count: 142, label: 'Paid Out', prefix: 'TZS ', suffix: 'M+' },
]

export const HERO_FLOAT_CARDS = [
  { cls: 'fc1', icon: 'badge-check', title: 'Payment Successful', sub: 'TZS 500 · M-Pesa' },
  { cls: 'fc2', icon: 'wallet', title: 'TZS 2,345,000', sub: 'Available to withdraw' },
  { cls: 'fc3', icon: 'trending-up', title: '+45,230 paid views', sub: 'This month' },
]

/* ---------- MARQUEE ---------- */
export const MARQUEE_ITEMS = [
  'PPV FOREVER',
  'PAID PREMIERE',
  'M-PESA INSTANT UNLOCK',
  'AIRTEL MONEY',
  '70/30 CREATOR SPLIT',
  'AUTO SOCIAL PREVIEWS',
  'FREE WITH ADS',
]

/* ---------- TRENDING ---------- */
export const TRENDING_VIDEOS = [
  {
    id: 'behind-the-fame',
    tag: { label: 'PAID PREMIERE', cls: 'tag-prem' },
    thumb: IMG.premiere,
    time: '20:14',
    title: 'Harmonize — Behind The Fame',
    author: 'Konde Gang Official',
    avatar: IMG.avatarKonde,
    price: 'TZS 500',
    priceNote: '7 days left · then free',
    views: '25,430',
  },
  {
    id: 'the-journey',
    tag: { label: 'PPV FOREVER', cls: 'tag-ppv' },
    thumb: IMG.journey,
    time: '45:02',
    title: 'The Journey — Live From Dar',
    author: 'Zuchu Studio',
    avatar: IMG.avatarZuchu,
    price: 'TZS 1,000',
    priceNote: 'Own it forever',
    views: '35,120',
  },
  {
    id: 'studio-session',
    tag: { label: 'PPV FOREVER', cls: 'tag-ppv' },
    thumb: IMG.studio,
    time: '32:47',
    title: 'Studio Session Live Vol. 3',
    author: 'Marioo Music',
    avatar: IMG.avatarMarioo,
    price: 'TZS 800',
    priceNote: 'Own it forever',
    views: '21,490',
  },
  {
    id: 'konser-dar',
    tag: { label: 'FREE WITH ADS', cls: 'tag-free' },
    thumb: IMG.konser,
    time: '18:22',
    title: 'Konser Dar Live — Full Show',
    author: 'Rayvanny TV',
    avatar: IMG.avatarRayvanny,
    price: 'FREE',
    priceNote: 'Premiere ended · ads',
    priceColor: 'var(--green)',
    views: '18,230',
  },
]

/* ---------- HOW IT WORKS ---------- */
export const STEPS = [
  { icon: 'compass', title: 'Discover', text: 'See the 60s preview shared on Instagram, TikTok or WhatsApp.' },
  { icon: 'play-circle', title: 'Watch Preview', text: 'Get hooked with the free portion the creator chose.', delay: 1 },
  { icon: 'lock', title: 'Paywall Appears', text: 'Video pauses at the exact paywall point. No bypass possible.', tone: 'gold', delay: 2 },
  { icon: 'smartphone', title: 'Pay Mobile Money', text: 'Choose M-Pesa or Airtel Money. Approve on your phone.', tone: 'gold', delay: 3 },
  { icon: 'zap', title: 'Instant Unlock', text: 'Payment verified in seconds — video continues automatically.', tone: 'green', delay: 4 },
  { icon: 'infinity', title: 'Yours Forever', text: 'Purchases stay unlocked in your library. Even after logout.', tone: 'green', delay: 4 },
]

/* ---------- FEATURES ---------- */
export const FEATURES = [
  {
    icon: 'banknote',
    tone: 'gold',
    title: 'PPV Forever & Paid Premiere',
    text: 'Sell each video your way: keep it paid forever, or run a Paid Premiere that automatically becomes free-with-ads when its window expires — and keeps earning from ads.',
  },
  {
    icon: 'timer',
    title: 'You Set the Free Preview',
    text: 'Choose exactly how many minutes viewers watch free before the paywall. Hook them with 5 minutes, convert them at the perfect moment.',
    delay: 1,
  },
  {
    icon: 'smartphone-nfc',
    tone: 'green',
    title: 'M-Pesa & Airtel Money',
    text: "Built natively for Tanzanian mobile money. Payment verified in seconds and the video unlocks instantly — permanently tied to the customer's account.",
    delay: 2,
  },
  {
    icon: 'clapperboard',
    title: 'Auto Social Previews',
    text: 'Every upload automatically generates a 60-second promotional clip, ready to share to Instagram, TikTok, Facebook and WhatsApp with one tap.',
  },
  {
    icon: 'link-2',
    tone: 'gold',
    title: 'Smart Deep Links',
    text: 'Each video gets a unique link that opens customers directly on its watch & purchase page. Share anywhere — convert everywhere.',
    delay: 1,
  },
  {
    icon: 'shield-check',
    title: 'Bulletproof Protection',
    text: 'Signed, expiring stream URLs mean copied links die instantly. Adaptive streaming delivers smooth playback even on slow connections.',
    delay: 2,
  },
]

/* ---------- FOR CREATORS ---------- */
export const EARN_ITEMS = [
  {
    icon: 'hand-coins',
    title: 'Generous 70/30 revenue split',
    text: 'You keep the lion’s share of every sale, tracked transparently in your dashboard.',
  },
  {
    icon: 'bar-chart-3',
    title: 'Real-time earnings dashboard',
    text: 'Watch views, sales and revenue update live. Request withdrawals anytime.',
  },
  {
    icon: 'megaphone',
    title: 'Ads keep paying after the premiere',
    text: 'When your Paid Premiere goes free, pre-roll ads keep generating income forever.',
  },
]

/* ---------- TESTIMONIALS ---------- */
export const TESTIMONIALS = [
  {
    text: 'I premiered my documentary at TZS 500 and made more in one week than six months of free YouTube views. When it went free-with-ads, it kept earning. This platform understands us.',
    avatar: IMG.avatarKondeLg,
    name: 'Diamond P.',
    role: 'Music Creator · Dar es Salaam',
    amount: 'TZS 2.4M',
    amountNote: 'earned',
  },
  {
    text: 'The auto-generated preview clips are genius. I share to TikTok and WhatsApp, fans hit the paywall at the best part, and M-Pesa does the rest. Instant unlock means zero complaints.',
    avatar: IMG.avatarZuchuLg,
    name: 'Nandy S.',
    role: 'Filmmaker · Arusha',
    amount: 'TZS 1.8M',
    amountNote: 'earned',
    delay: 1,
  },
  {
    text: 'As a fan, I love it — I paid TZS 800 once with Airtel Money and the concert is in my library forever. Even after I changed phones, it was still there. That’s how it should work.',
    avatar: IMG.avatarRayvannyLg,
    name: 'Amina K.',
    role: 'Superfan · Mwanza',
    amount: '32',
    amountNote: 'videos owned',
    delay: 2,
  },
]

/* ---------- FOOTER ---------- */
export const FOOTER_LINKS = {
  platform: [
    { label: 'Trending Videos', hash: '#trending' },
    { label: 'How It Works', hash: '#how' },
    { label: 'Features', hash: '#features' },
    { label: 'For Creators', hash: '#creators' },
  ],
  account: [
    { label: 'Sign Up Free', to: '/signup' },
    { label: 'Log In', to: '/login' },
    { label: 'Reset Password', to: '/reset' },
    { label: 'My Dashboard', to: '/dashboard' },
  ],
  support: ['Help Center', 'Creator Guide', 'Terms of Service', 'Privacy Policy'],
}

/* ---------- DASHBOARD ---------- */
export const DASH_TITLES = {
  overview: ['Karibu, Juma 👋', "Here's how your content is performing today."],
  library: ['My Library', 'Every video you own — unlocked forever.'],
  upload: ['Upload New Video', 'From upload to published in under 5 minutes.'],
  videos: ['My Videos', 'Manage your published content and premieres.'],
  earnings: ['Earnings', 'Your money, transparent and withdrawable anytime.'],
}

export const OVERVIEW_STATS = [
  { icon: 'eye', label: 'Total Views', value: '125,430', trend: '+12.5% this month' },
  { icon: 'ticket', label: 'Paid Views', value: '45,230', trend: '+18.3% this month' },
  { icon: 'coins', tone: 'gold', label: 'Total Revenue', value: 'TZS 8,745,000', trend: '+22.7% this month' },
  { icon: 'wallet', tone: 'green', label: 'Available Balance', value: 'TZS 2,345,000', withdraw: true },
]

export const TRANSACTIONS = [
  { date: '31 May', type: 'Sale', video: 'Behind The Fame', method: 'M-Pesa', amount: '+ TZS 2,000', tone: 'green', status: 'Completed', pill: 'ok' },
  { date: '31 May', type: 'Ad Revenue', video: 'Free With Ads', method: '—', amount: '+ TZS 81,000', tone: 'green', status: 'Completed', pill: 'ok' },
  { date: '30 May', type: 'Sale', video: 'Studio Session Live', method: 'Airtel Money', amount: '+ TZS 1,000', tone: 'green', status: 'Completed', pill: 'ok' },
  { date: '30 May', type: 'Withdrawal', video: '—', method: 'M-Pesa', amount: '− TZS 500,000', tone: 'gold', status: 'Pending', pill: 'pend' },
  { date: '29 May', type: 'Sale', video: 'Konser Dar Live', method: 'M-Pesa', amount: '+ TZS 1,000', tone: 'green', status: 'Completed', pill: 'ok' },
]

export const LIBRARY_VIDEOS = [
  {
    id: 'the-journey',
    tag: { label: 'OWNED', cls: 'tag-ppv' },
    thumb: IMG.journey,
    time: '45:02',
    title: 'The Journey — Live From Dar',
    byline: 'Purchased 12 May · M-Pesa',
    price: 'UNLOCKED',
    priceNote: 'Watch anytime',
    priceColor: 'var(--green)',
    action: { icon: 'download', label: 'Save' },
  },
  {
    id: 'behind-the-fame',
    tag: { label: 'OWNED', cls: 'tag-ppv' },
    thumb: IMG.premiere,
    time: '20:14',
    title: 'Harmonize — Behind The Fame',
    byline: 'Purchased 28 May · Airtel Money',
    price: 'UNLOCKED',
    priceNote: 'Watch anytime',
    priceColor: 'var(--green)',
    action: { icon: 'download', label: 'Save' },
  },
  {
    id: 'konser-dar',
    tag: { label: 'FREE', cls: 'tag-free' },
    thumb: IMG.konser,
    time: '18:22',
    title: 'Konser Dar Live — Full Show',
    byline: 'Saved to library · Free with ads',
    price: 'FREE',
    priceNote: 'Includes ads',
    priceColor: 'var(--purple2)',
    action: { icon: 'eye', label: '18,230' },
  },
]

export const MY_VIDEOS = [
  { title: 'Behind The Fame', type: 'Premiere', price: 'TZS 500', views: '25,430', revenue: 'TZS 3,250,000', status: '7 days left', pill: 'pend' },
  { title: 'The Journey — Live', type: 'PPV Forever', price: 'TZS 1,000', views: '35,120', revenue: 'TZS 2,850,000', status: 'Selling', pill: 'ok' },
  { title: 'Studio Session Vol. 3', type: 'PPV Forever', price: 'TZS 800', views: '21,490', revenue: 'TZS 1,230,000', status: 'Selling', pill: 'ok' },
  { title: 'Konser Dar Live', type: 'Premiere → Free', price: '—', views: '18,230', revenue: 'TZS 980,000 + ads', status: 'Free with Ads', pill: 'free' },
]

export const EARNINGS_STATS = [
  { icon: 'coins', tone: 'gold', label: 'Lifetime Earnings', value: 'TZS 8,745,000' },
  { icon: 'wallet', tone: 'green', label: 'Available Now', value: 'TZS 2,345,000' },
  { icon: 'megaphone', label: 'Ad Revenue', value: 'TZS 640,000' },
  { icon: 'percent', label: 'Your Split', value: '70%' },
]

/* ---------- WATCH ---------- */
export const WATCH_VIDEO = {
  title: 'Harmonize — Behind The Fame',
  subtitle: 'Music · Documentary · Paid Premiere',
  poster: IMG.premiereLarge,
  price: 'TZS 500',
  views: '25,430 views',
  premiered: 'Premiered 24 May',
  window: '7 days left to buy · then free with ads',
  totalSeconds: 1200, // 20:00
  freePercent: 25, // paywall hits at 25% of the timeline
  creator: {
    name: 'Konde Gang Official',
    meta: '245K followers · 32 videos',
    avatar: IMG.avatarKondeLg,
  },
}
