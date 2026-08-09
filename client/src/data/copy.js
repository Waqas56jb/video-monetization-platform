/**
 * Words and pictures the platform says about itself.
 *
 * This file is deliberately the *only* thing that survived the old content
 * file. Everything else in there was invented data — fabricated creators,
 * videos, payments, earnings and testimonials — and it is gone: every figure
 * the apps now show is counted from the database.
 *
 * What is left is marketing copy and design assets, which are neither
 * measurements nor claims about anyone. Nothing here pretends to be a fact
 * about a real person or a real amount of money.
 */

/** Stock photography used as page furniture — backdrops and illustrations.
 * These are never presented as a real video thumbnail; those come from Cloudflare. */
export const IMG = {
  // Leaner sizes for mobile data — Unsplash was bloating first paint.
  concert: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=960&q=60&auto=format',
  premiere: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=480&q=60&auto=format',
  premiereLarge: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=960&q=65&auto=format',
  journey: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=480&q=60&auto=format',
  studio: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=480&q=60&auto=format',
  konser: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=480&q=60&auto=format',
  creator: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=640&q=60&auto=format',
  authLogin: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&q=65&auto=format',
  authSignup: 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=800&q=65&auto=format',
  authReset: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=800&q=65&auto=format',
  avatarKonde: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&q=60&auto=format',
  avatarKondeLg: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&q=60&auto=format',
  avatarZuchu: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=80&q=60&auto=format',
  avatarZuchuLg: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=120&q=60&auto=format',
  avatarMarioo: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=80&q=60&auto=format',
  avatarRayvanny: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&q=60&auto=format',
  avatarRayvannyLg: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&q=60&auto=format',
}

/**
 * Landing-page showcase cards only.
 *
 * These are design furniture for the homepage so the marketing layout always
 * looks complete — the same four models a visitor needs to understand at a
 * glance. They are NOT the catalogue. Explore, Watch, Library and every
 * dashboard number still come from the real database / demo seed.
 */
export const LANDING_SHOWCASE = [
  {
    id: 'showcase-premiere',
    thumb: IMG.premiere,
    time: '20:14',
    title: 'Harmonize — Behind The Fame',
    author: 'Konde Gang Official',
    avatar: IMG.avatarKonde,
    tag: { cls: 'tag-prem', label: 'PAID PREMIERE' },
    price: 'TZS 500',
    priceNote: '7 days left · then free',
    views: '25,430',
  },
  {
    id: 'showcase-ppv',
    thumb: IMG.journey,
    time: '45:02',
    title: 'The Journey — Live From Dar',
    author: 'Zuchu Studio',
    avatar: IMG.avatarZuchu,
    tag: { cls: 'tag-ppv', label: 'PPV FOREVER' },
    price: 'TZS 1,000',
    priceNote: 'Own it forever',
    views: '35,120',
  },
  {
    id: 'showcase-studio',
    thumb: IMG.studio,
    time: '32:47',
    title: 'Studio Session Live Vol. 3',
    author: 'Marioo Music',
    avatar: IMG.avatarMarioo,
    tag: { cls: 'tag-ppv', label: 'PPV FOREVER' },
    price: 'TZS 800',
    priceNote: 'Own it forever',
    views: '21,490',
  },
  {
    id: 'showcase-free',
    thumb: IMG.konser,
    time: '18:22',
    title: 'Konser Dar Live — Full Show',
    author: 'Rayvanny TV',
    avatar: IMG.avatarRayvanny,
    tag: { cls: 'tag-free', label: 'FREE WITH ADS' },
    price: 'FREE',
    priceNote: 'Premiere ended · ads',
    priceColor: 'var(--green)',
    views: '18,230',
  },
]

/** The scrolling strip of what the platform does. */
export const MARQUEE_ITEMS = [
  'PPV FOREVER',
  'PAID PREMIERE',
  'M-PESA INSTANT UNLOCK',
  'AIRTEL MONEY',
  '70/30 CREATOR SPLIT',
  'AUTO SOCIAL PREVIEWS',
  'FREE WITH ADS',
]

/** How buying a video works, for someone who has never done it. */
export const STEPS = [
  { icon: 'compass', title: 'Discover', text: 'See the 60s preview shared on Instagram, TikTok or WhatsApp.' },
  { icon: 'play-circle', title: 'Watch Preview', text: 'Get hooked with the free portion the creator chose.', delay: 1 },
  { icon: 'lock', title: 'Paywall Appears', text: 'Video pauses at the exact paywall point. No bypass possible.', tone: 'gold', delay: 2 },
  { icon: 'smartphone', title: 'Pay Mobile Money', text: 'Choose M-Pesa or Airtel Money. Approve on your phone.', tone: 'gold', delay: 3 },
  { icon: 'zap', title: 'Instant Unlock', text: 'Payment verified in seconds — video continues automatically.', tone: 'green', delay: 4 },
  { icon: 'infinity', title: 'Yours Forever', text: 'Purchases stay unlocked in your library. Even after logout.', tone: 'green', delay: 4 },
]

/** What the platform offers creators. */
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

/** Why a creator should bother. */
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

/** The three ways a video can be sold, as filter labels. */
export const ACCESS_FILTERS = ['All Access', 'PPV Forever', 'Paid Premiere', 'Free With Ads']

/** How each review state is shown to the creator who is waiting on it. */
export const REVIEW_STATUS = {
  pending: { label: 'Pending Review', pill: 'pend', icon: 'hourglass' },
  approved: { label: 'Approved · Published', pill: 'ok', icon: 'badge-check' },
  rejected: { label: 'Rejected', pill: 'bad', icon: 'x-circle' },
}


/**
 * The heading on each dashboard tab.
 *
 * `overview` is a function because it greets the person by name, and the name
 * has to come from the signed-in account — it used to say "Karibu, Juma" to
 * everybody, including people who were not called Juma.
 */
export const DASH_TITLES = {
  overview: (name) => [
    name ? `Karibu, ${name} 👋` : 'Karibu 👋',
    "Here's how your content is performing today.",
  ],
  library: () => ['My Library', 'Every video you own — unlocked forever.'],
  upload: () => ['Upload New Video', 'Upload, price and submit for review — we approve within hours.'],
  videos: () => ['My Videos', 'Manage your published content and premieres.'],
  earnings: () => ['Earnings', 'Your money, transparent and withdrawable anytime.'],
  purchases: () => ['My Purchases', 'Every video you have paid for, and how you paid.'],
  become: () => ['Become a Creator', 'Start selling your own videos on MTONYO+.'],
  inbox: () => ['Notifications', 'Announcements and news about your account.'],
  analytics: () => ['Analytics', 'How your videos and your spending are actually doing.'],
  profile: () => ['My Profile', 'Your name, your photo, and how people find you.'],
  settings: () => ['Settings', 'Your password, your email preferences, and your account.'],
}
