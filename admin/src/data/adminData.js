/* =========================================================================
   Every string, stat, row and image from the original single-file admin.
   Tables that the admin can mutate (block / suspend / delete / approve)
   are seeded here and then held in state by AdminDataContext.
   ========================================================================= */

export const IMG = {
  loginBg: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1600&q=80',
  admin: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80',
  diamond: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80',
  nandy: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=100&q=80',
  marioo: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100&q=80',
  amina: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80',
  neema: 'https://images.unsplash.com/photo-1531891437562-4301cf35b7e4?w=100&q=80',
  streetVibes: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&q=80',
  thumbFame: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=200&q=80',
  thumbJourney: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=200&q=80',
  thumbStudio: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=200&q=80',
  thumbKonser: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=200&q=80',
  thumbStreet: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=200&q=80',
  modMakingOf: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=300&q=80',
  modFreestyle: 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=300&q=80',
  modStreet: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&q=80',
  modNightLife: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=300&q=80',
}

/* ---------- SIDEBAR / PAGE META ---------- */
export const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { tab: 'overview', path: '/dashboard', icon: 'layout-dashboard', label: 'Dashboard' },
      { tab: 'analytics', path: '/analytics', icon: 'bar-chart-3', label: 'Analytics' },
    ],
  },
  {
    label: 'Management',
    items: [
      { tab: 'users', path: '/users', icon: 'users', label: 'Users' },
      { tab: 'creators', path: '/creators', icon: 'video', label: 'Creators' },
      { tab: 'videos', path: '/videos', icon: 'clapperboard', label: 'Videos' },
      { tab: 'moderation', path: '/moderation', icon: 'shield-alert', label: 'Moderation', count: 4 },
    ],
  },
  {
    label: 'Finance',
    items: [
      { tab: 'payments', path: '/payments', icon: 'credit-card', label: 'Payments' },
      { tab: 'withdrawals', path: '/withdrawals', icon: 'banknote', label: 'Withdrawals', count: 3 },
      { tab: 'revenue', path: '/revenue', icon: 'percent', label: 'Revenue & Splits' },
      { tab: 'ads', path: '/ads', icon: 'megaphone', label: 'Ads Management' },
    ],
  },
  {
    label: 'System',
    items: [
      { tab: 'audit', path: '/audit', icon: 'scroll-text', label: 'Audit Log' },
      { tab: 'settings', path: '/settings', icon: 'settings', label: 'Settings' },
    ],
  },
]

export const PAGE_META = {
  overview: ['Dashboard', 'Platform overview · live data'],
  analytics: ['Analytics', 'Deep performance metrics across the platform'],
  users: ['User Management', 'View, block or remove any user account'],
  creators: ['Creator Management', 'Verify, suspend and manage creator accounts'],
  videos: ['Video Management', 'Full control over every video on the platform'],
  moderation: ['Content Moderation', 'Deletion requests & flagged content — admin has final say'],
  payments: ['Payments', 'Every transaction, verified and recorded'],
  withdrawals: ['Withdrawals', 'Approve and track creator payouts'],
  revenue: ['Revenue & Splits', 'Configure global and per-creator revenue sharing'],
  ads: ['Ads Management', 'Pre-roll advertising configuration & campaigns'],
  audit: ['Audit Log', 'Every admin action, permanently recorded'],
  settings: ['Platform Settings', 'Global configuration & backups'],
}

/* ---------- OVERVIEW ---------- */
export const OVERVIEW_STATS = [
  { icon: 'users', label: 'Total Users', value: '12,450', trend: '+15.2% this month' },
  { icon: 'video', label: 'Total Creators', value: '245', trend: '+8.7% this month' },
  { icon: 'clapperboard', label: 'Total Videos', value: '1,236', trend: '+11.3% this month' },
  { icon: 'coins', tone: 'gold', label: 'Total Revenue', value: 'TZS 142,650,000', trend: '+20.9% this month' },
]

export const OVERVIEW_WITHDRAWALS = [
  { id: 'ow-1', name: 'Diamond Platnumz', sub: 'ID #C-1042', avatar: IMG.diamond, amount: 'TZS 2,450,000', method: 'M-Pesa', date: '31 May', approveMsg: 'Withdrawal approved & sent via M-Pesa' },
  { id: 'ow-2', name: 'Nandy Official', sub: 'ID #C-1087', avatar: IMG.nandy, amount: 'TZS 980,000', method: 'M-Pesa', date: '31 May', approveMsg: 'Withdrawal approved & sent via M-Pesa' },
  { id: 'ow-3', name: 'Marioo Music', sub: 'ID #C-1103', avatar: IMG.marioo, amount: 'TZS 750,000', method: 'Airtel', date: '30 May', approveMsg: 'Withdrawal approved & sent via Airtel Money' },
]

export const INITIAL_FEED = [
  { id: 'fd-1', tone: 'f-pay', icon: 'banknote', html: '<b>Amina K.</b> paid <b>TZS 500</b> for "Behind The Fame" via M-Pesa', time: '12 seconds ago' },
  { id: 'fd-2', tone: 'f-up', icon: 'upload-cloud', html: '<b>Zuchu Studio</b> uploaded a new video "Acoustic Session Vol. 2"', time: '2 minutes ago' },
  { id: 'fd-3', tone: 'f-user', icon: 'user-plus', html: '<b>34 new users</b> registered in the last hour', time: '8 minutes ago' },
  { id: 'fd-4', tone: 'f-gold', icon: 'calendar-clock', html: 'Premiere <b>"Konser Dar Live"</b> expired → switched to <b>Free With Ads</b>', time: '26 minutes ago' },
  { id: 'fd-5', tone: 'f-pay', icon: 'banknote', html: '<b>John M.</b> paid <b>TZS 1,000</b> for "The Journey — Live" via Airtel', time: '31 minutes ago' },
  { id: 'fd-6', tone: 'f-warn', icon: 'flag', html: 'Video <b>"Street Vibes Ep.4"</b> was flagged by 3 users — review required', time: '1 hour ago' },
]

/** Rotated into the feed every 5 seconds once the admin logs in. */
export const FEED_POOL = [
  ['f-pay', 'banknote', '<b>Fatma H.</b> paid <b>TZS 800</b> for "Studio Session Live" via M-Pesa'],
  ['f-user', 'user-plus', '<b>New user</b> registered from Dodoma'],
  ['f-pay', 'banknote', '<b>Ibrahim T.</b> paid <b>TZS 500</b> for "Behind The Fame" via Airtel'],
  ['f-up', 'upload-cloud', '<b>Nandy Official</b> uploaded "Voices of Bongo Ep.1"'],
  ['f-gold', 'share-2', '<b>Konde Gang</b> shared a 60s preview to Instagram & TikTok'],
  ['f-pay', 'banknote', '<b>Salma D.</b> paid <b>TZS 1,000</b> for "The Journey — Live" via M-Pesa'],
]

/* ---------- ANALYTICS ---------- */
export const ANALYTICS_STATS = [
  { icon: 'eye', label: 'Total Views (30d)', value: '2,145,830', trend: '+18.4%' },
  { icon: 'ticket', tone: 'gold', label: 'Paid Unlocks (30d)', value: '88,412', trend: '+22.1%' },
  { icon: 'percent', tone: 'green', label: 'Preview → Pay Conversion', value: '14.8%', trend: '+1.9 pts' },
  { icon: 'megaphone', label: 'Ad Impressions (30d)', value: '1,204,551', trend: '+9.6%' },
]

/** Bar heights for "Payments per Day" — [x, y, height], last bar highlighted gold. */
export const PAYMENT_BARS = [
  { x: 15, y: 120, h: 100 },
  { x: 56, y: 95, h: 125 },
  { x: 97, y: 140, h: 80 },
  { x: 138, y: 105, h: 115 },
  { x: 179, y: 80, h: 140 },
  { x: 220, y: 118, h: 102 },
  { x: 261, y: 66, h: 154 },
  { x: 302, y: 92, h: 128 },
  { x: 343, y: 58, h: 162 },
  { x: 384, y: 86, h: 134 },
  { x: 425, y: 48, h: 172 },
  { x: 466, y: 72, h: 148 },
  { x: 507, y: 40, h: 180 },
  { x: 548, y: 30, h: 190, fill: '#f5c518' },
]

export const PAYMENT_METHOD_METERS = [
  { label: 'M-Pesa', value: '68%', width: '68%', fill: 'linear-gradient(90deg,#0f7b3c,#22c55e)' },
  { label: 'Airtel Money', value: '32%', width: '32%', fill: 'linear-gradient(90deg,#e40000,#ff6b6b)' },
  { label: 'PPV Forever sales', value: '54%', width: '54%', fill: 'linear-gradient(90deg,var(--purple),var(--purple2))' },
  { label: 'Paid Premiere sales', value: '46%', width: '46%', fill: 'linear-gradient(90deg,var(--gold),#e0a800)' },
]

export const TOP_VIDEOS = [
  { rank: 1, title: 'Behind The Fame', thumb: IMG.thumbFame, creator: 'Konde Gang', type: 'Premiere', pill: 'pend', views: '425,300', unlocks: '42,530', revenue: 'TZS 8,250,000' },
  { rank: 2, title: 'The Journey — Live', thumb: IMG.thumbJourney, creator: 'Zuchu Studio', type: 'PPV', pill: 'ok', views: '351,200', unlocks: '35,120', revenue: 'TZS 6,750,000' },
  { rank: 3, title: 'Studio Session Live', thumb: IMG.thumbStudio, creator: 'Marioo Music', type: 'PPV', pill: 'ok', views: '214,900', unlocks: '21,490', revenue: 'TZS 4,230,000' },
  { rank: 4, title: 'Konser Dar Live', thumb: IMG.thumbKonser, creator: 'Rayvanny TV', type: 'Free+Ads', pill: 'free', views: '182,300', unlocks: '—', revenue: 'TZS 3,490,000' },
]

/* ---------- USERS ---------- */
export const USER_STATS = [
  { icon: 'users', label: 'Total Users', value: '12,450' },
  { icon: 'user-check', tone: 'green', label: 'Active (30d)', value: '8,912' },
  { icon: 'ticket', tone: 'gold', label: 'Paying Users', value: '3,204' },
  { icon: 'user-x', tone: 'red', label: 'Blocked', value: '27' },
]

export const USERS = [
  { id: 'u-1', name: 'Amina Kimaro', email: 'amina@email.com', avatar: IMG.amina, phone: '0712 *** 890', joined: '12 Jan 2026', purchases: 32, spent: 'TZS 24,500', status: 'Active' },
  { id: 'u-2', name: 'John Mwakyusa', email: 'johnm@email.com', avatar: IMG.diamond, phone: '0765 *** 221', joined: '03 Feb 2026', purchases: 18, spent: 'TZS 15,800', status: 'Active' },
  { id: 'u-3', name: 'Neema Joseph', email: 'neemaj@email.com', avatar: IMG.neema, phone: '0688 *** 445', joined: '18 Mar 2026', purchases: 7, spent: 'TZS 5,500', status: 'Active' },
  { id: 'u-4', name: 'Baraka Said', email: 'baraka@email.com', avatar: IMG.marioo, phone: '0754 *** 019', joined: '25 Apr 2026', purchases: 2, spent: 'TZS 1,500', status: 'Blocked' },
]

/* ---------- CREATORS ---------- */
export const CREATOR_STATS = [
  { icon: 'video', label: 'Total Creators', value: '245' },
  { icon: 'badge-check', tone: 'green', label: 'Verified', value: '182' },
  { icon: 'coins', tone: 'gold', label: 'Creator Payouts (Total)', value: 'TZS 99.8M' },
  { icon: 'pause-circle', tone: 'red', label: 'Suspended', value: '6' },
]

export const CREATORS = [
  { id: 'c-1', name: 'Konde Gang Official', sub: 'ID #C-1042 · Dar es Salaam', avatar: IMG.diamond, videos: 32, followers: '245K', revenue: 'TZS 28,450,000', balance: 'TZS 2,450,000', split: '70%', custom: false, status: 'Verified' },
  { id: 'c-2', name: 'Zuchu Studio', sub: 'ID #C-1058 · Dar es Salaam', avatar: IMG.nandy, videos: 24, followers: '198K', revenue: 'TZS 21,300,000', balance: 'TZS 1,850,000', split: '70%', custom: false, status: 'Verified' },
  { id: 'c-3', name: 'Marioo Music', sub: 'ID #C-1103 · Arusha', avatar: IMG.marioo, videos: 18, followers: '156K', revenue: 'TZS 14,750,000', balance: 'TZS 750,000', split: '75%', custom: true, status: 'Verified' },
  { id: 'c-4', name: 'Street Vibes TZ', sub: 'ID #C-1210 · Mwanza', avatar: IMG.streetVibes, videos: 4, followers: '12K', revenue: 'TZS 890,000', balance: 'TZS 240,000', split: '70%', custom: false, status: 'Pending' },
]

/* ---------- VIDEOS ---------- */
export const VIDEO_STATS = [
  { icon: 'clapperboard', label: 'Total Videos', value: '1,236' },
  { icon: 'ticket', tone: 'gold', label: 'Paid (PPV + Premiere)', value: '824' },
  { icon: 'megaphone', label: 'Free With Ads', value: '389' },
  { icon: 'eye-off', tone: 'red', label: 'Unpublished', value: '23' },
]

export const VIDEOS = [
  { id: 'v-1', title: 'Behind The Fame', meta: '20:14 · Music', thumb: IMG.thumbFame, creator: 'Konde Gang', status: 'Premiere', pill: 'pend', price: 'TZS 500', views: '425,300', revenue: 'TZS 8,250,000', flagged: false },
  { id: 'v-2', title: 'The Journey — Live', meta: '45:02 · Concert', thumb: IMG.thumbJourney, creator: 'Zuchu Studio', status: 'PPV', pill: 'ok', price: 'TZS 1,000', views: '351,200', revenue: 'TZS 6,750,000', flagged: false },
  { id: 'v-3', title: 'Konser Dar Live', meta: '18:22 · Concert', thumb: IMG.thumbKonser, creator: 'Rayvanny TV', status: 'Free', pill: 'free', price: '—', views: '182,300', revenue: 'TZS 3,490,000', revenueNote: '(ads)', flagged: false },
  { id: 'v-4', title: 'Street Vibes Ep.4', meta: '12:40 · Lifestyle', thumb: IMG.thumbStreet, creator: 'Street Vibes TZ', status: 'Flagged ×3', pill: 'bad', price: 'TZS 300', views: '8,120', revenue: 'TZS 240,000', flagged: true },
]

/* ---------- MODERATION ---------- */
export const DELETION_REQUESTS = [
  {
    id: 'dr-1',
    image: IMG.modMakingOf,
    title: 'Making Of — Vol. 2',
    requester: 'Marioo Music',
    requestNote: 'requested permanent deletion · 2 days ago',
    warning: '⚠ 7,210 customers own permanent access to this video',
    warningTone: 'var(--gold)',
    unpublishMsg: 'Video unpublished — hidden from platform, buyers keep access',
    confirmTitle: 'Approve permanent deletion?',
    confirmText: '7,210 buyers will keep an access record but the video will be gone. Consider Unpublish instead.',
  },
  {
    id: 'dr-2',
    image: IMG.modFreestyle,
    title: 'Freestyle Session #12',
    requester: 'Street Vibes TZ',
    requestNote: 'requested permanent deletion · 5 days ago',
    warning: '✓ No paid customers — safe to delete',
    warningTone: 'var(--green)',
    unpublishMsg: 'Video unpublished',
    confirmTitle: 'Approve permanent deletion?',
    confirmText: 'No paying customers on this video. It will be permanently removed.',
  },
]

export const FLAGGED_CONTENT = [
  {
    id: 'fc-1',
    image: IMG.modStreet,
    title: 'Street Vibes Ep.4',
    note: 'Flagged by 3 users · Reason: misleading content · 1 hour ago',
    dismissLabel: 'Dismiss Flags',
    dismissMsg: 'Flags dismissed — video marked safe',
    confirmTitle: 'Take down this video?',
    confirmText: 'It will be unpublished pending review and the creator notified.',
  },
  {
    id: 'fc-2',
    image: IMG.modNightLife,
    title: 'Night Life Dar Ep.9',
    note: 'Flagged by 1 user · Reason: copyright claim · 4 hours ago',
    dismissLabel: 'Dismiss',
    dismissMsg: 'Flag dismissed — claim rejected',
    confirmTitle: 'Take down this video?',
    confirmText: 'It will be unpublished pending copyright review.',
  },
]

/* ---------- PAYMENTS ---------- */
export const PAYMENT_STATS = [
  { icon: 'credit-card', tone: 'gold', label: 'Payments Today', value: 'TZS 1,845,000', trend: '412 transactions' },
  { icon: 'check-circle-2', tone: 'green', label: 'Success Rate', value: '97.8%' },
  { icon: 'smartphone', label: 'M-Pesa Share', value: '68%' },
  { icon: 'x-circle', tone: 'red', label: 'Failed (24h)', value: '9' },
]

export const PAYMENTS = [
  { id: 'TX-88412', user: 'Amina K.', video: 'Behind The Fame', method: 'M-Pesa', amount: 'TZS 500', split: '350 / 150', date: '31 May 14:22', status: 'Completed', pill: 'ok' },
  { id: 'TX-88411', user: 'John M.', video: 'The Journey — Live', method: 'Airtel', amount: 'TZS 1,000', split: '700 / 300', date: '31 May 14:18', status: 'Completed', pill: 'ok' },
  { id: 'TX-88410', user: 'Neema J.', video: 'Studio Session Live', method: 'M-Pesa', amount: 'TZS 800', split: '560 / 240', date: '31 May 14:11', status: 'Pending', pill: 'pend' },
  { id: 'TX-88409', user: 'Hassan R.', video: 'Behind The Fame', method: 'Airtel', amount: 'TZS 500', split: '—', date: '31 May 14:05', status: 'Failed', pill: 'bad' },
  { id: 'TX-88408', user: 'Grace W.', video: 'The Journey — Live', method: 'M-Pesa', amount: 'TZS 1,000', split: '700 / 300', date: '31 May 13:58', status: 'Completed', pill: 'ok' },
  { id: 'TX-88407', user: 'Peter L.', video: 'Konser Dar (tip)', method: 'M-Pesa', amount: 'TZS 2,000', split: '1,400 / 600', date: '31 May 13:41', status: 'Completed', pill: 'ok' },
]

/* ---------- WITHDRAWALS ---------- */
export const WITHDRAWAL_STATS = [
  { icon: 'hourglass', tone: 'gold', label: 'Pending Requests', value: '3' },
  { icon: 'banknote', label: 'Pending Amount', value: 'TZS 4,180,000' },
  { icon: 'check-circle-2', tone: 'green', label: 'Paid This Month', value: 'TZS 18.4M' },
  { icon: 'timer', label: 'Avg Processing', value: '6.2 hrs' },
]

export const WITHDRAWAL_QUEUE = [
  { id: 'wq-1', name: 'Diamond Platnumz', sub: '#C-1042', avatar: IMG.diamond, amount: 'TZS 2,450,000', method: 'M-Pesa', number: '0712 *** 890', balanceAfter: 'TZS 0', requested: '31 May' },
  { id: 'wq-2', name: 'Nandy Official', sub: '#C-1087', avatar: IMG.nandy, amount: 'TZS 980,000', method: 'M-Pesa', number: '0765 *** 002', balanceAfter: 'TZS 870,000', requested: '31 May' },
  // NOTE: "0688 *** firm" is verbatim from the original mock data (looks like a typo there).
  { id: 'wq-3', name: 'Marioo Music', sub: '#C-1103', avatar: IMG.marioo, amount: 'TZS 750,000', method: 'Airtel', number: '0688 *** firm', balanceAfter: 'TZS 0', requested: '30 May' },
]

export const RECENT_PAYOUTS = [
  { id: 'rp-1', creator: 'Rayvanny TV', amount: 'TZS 690,000', method: 'M-Pesa', approvedBy: 'Admin', date: '29 May' },
  { id: 'rp-2', creator: 'Zuchu Studio', amount: 'TZS 1,850,000', method: 'M-Pesa', approvedBy: 'Admin', date: '28 May' },
  { id: 'rp-3', creator: 'Konde Gang Official', amount: 'TZS 3,200,000', method: 'M-Pesa', approvedBy: 'Admin', date: '25 May' },
]

/* ---------- REVENUE & SPLITS ---------- */
export const SPLIT_OVERRIDES = [
  { id: 'so-1', creator: 'Marioo Music', split: '75% / 25%', custom: true },
  { id: 'so-2', creator: 'Konde Gang Official', split: 'Global (70/30)', custom: false },
  { id: 'so-3', creator: 'Zuchu Studio', split: 'Global (70/30)', custom: false },
]

export const PLATFORM_EARNINGS = [
  { icon: 'landmark', tone: 'gold', label: 'Platform Revenue (Total)', value: 'TZS 42.8M' },
  { icon: 'ticket', label: 'From Sales', value: 'TZS 38.1M' },
  { icon: 'megaphone', label: 'From Ads', value: 'TZS 4.7M' },
  { icon: 'trending-up', tone: 'green', label: 'This Month', value: 'TZS 6.2M' },
]

/* ---------- ADS ---------- */
export const AD_STATS = [
  { icon: 'megaphone', label: 'Ad Impressions (30d)', value: '1,204,551' },
  { icon: 'coins', tone: 'gold', label: 'Ad Revenue (30d)', value: 'TZS 4,720,000' },
  { icon: 'film', label: 'Videos with Ads', value: '389' },
  { icon: 'mouse-pointer-click', tone: 'green', label: 'CTR', value: '2.4%' },
]

export const AD_SETTINGS = [
  { id: 'preroll', title: 'Enable pre-roll ads', note: 'Play an ad before every free-with-ads video', on: true },
  { id: 'skippable', title: 'Skippable after 5 seconds', note: 'Viewers can skip the ad after 5s', on: true },
  { id: 'expired', title: 'Ads on expired premieres', note: 'Auto-enable ads when a Paid Premiere becomes free', on: true },
  { id: 'share', title: 'Share ad revenue with creators', note: 'Creators earn their split % from ads on their videos', on: true },
]

export const AD_CAMPAIGNS = [
  { id: 'ac-1', name: 'Vodacom Tanzania', impressions: '412,000', revenue: 'TZS 2.1M', status: 'Active', pill: 'ok' },
  { id: 'ac-2', name: 'Azam TV', impressions: '318,500', revenue: 'TZS 1.4M', status: 'Active', pill: 'ok' },
  { id: 'ac-3', name: 'NMB Bank', impressions: '274,000', revenue: 'TZS 1.2M', status: 'Paused', pill: 'pend' },
]

/* ---------- AUDIT LOG ---------- */
export const AUDIT_LOG = [
  { id: 'al-1', time: '31 May 14:30', admin: 'Admin', action: 'APPROVED', pill: 'ok', object: 'Withdrawal', target: 'Rayvanny TV · TZS 690,000', ip: '41.222.*.*' },
  { id: 'al-2', time: '31 May 13:12', admin: 'Admin', action: 'BLOCKED', pill: 'bad', object: 'User', target: 'Baraka Said #U-8841', ip: '41.222.*.*' },
  { id: 'al-3', time: '31 May 11:47', admin: 'Admin', action: 'CHANGED', pill: 'info', object: 'Split override', target: 'Marioo Music → 75/25', ip: '41.222.*.*' },
  { id: 'al-4', time: '30 May 18:03', admin: 'Admin', action: 'UNPUBLISHED', pill: 'bad', object: 'Video', target: '"Night Life Dar Ep.8"', ip: '41.222.*.*' },
  { id: 'al-5', time: '30 May 09:15', admin: 'Admin', action: 'VERIFIED', pill: 'ok', object: 'Creator', target: 'Street Vibes TZ #C-1210', ip: '41.222.*.*' },
]

/* ---------- SETTINGS ---------- */
export const PLATFORM_SETTINGS = [
  { id: 'registrations', title: 'New creator registrations', note: 'Allow new creators to sign up', on: true },
  { id: 'verification', title: 'Require creator verification', note: 'New creators need admin approval before publishing', on: true },
  { id: 'autofree', title: 'Auto Premiere → Free with Ads', note: 'Automatically switch expired premieres', on: true },
  { id: 'maintenance', title: 'Maintenance mode', note: 'Take the platform offline temporarily', on: false },
]

/* ---------- CONFIRM DIALOG COPY ---------- */
export const CONFIRM = {
  blockUser: (name) => ({
    title: 'Block this user?',
    text: `${name} will lose access immediately. Purchases stay preserved and restore if unblocked.`,
  }),
  deleteUser: {
    title: 'Permanently delete this user?',
    text: 'This removes the account and login. Purchase & payment records are kept for financial audit. This cannot be undone.',
  },
  suspendCreator: {
    title: 'Suspend this creator?',
    text: 'Their videos stay live but they cannot upload or withdraw until reinstated.',
  },
  unpublishVideo: {
    title: 'Unpublish this video?',
    text: 'It disappears from the platform immediately. Buyers keep access to what they purchased.',
  },
  deleteVideo: {
    title: 'Permanently remove this video?',
    text: 'Purchased customers keep their access record for audit. The stream file is deleted. This cannot be undone.',
  },
  rejectWithdrawalShort: {
    title: 'Reject this withdrawal?',
    text: 'The creator will be notified and the amount returned to their balance.',
  },
  rejectWithdrawal: {
    title: 'Reject withdrawal?',
    text: 'Amount returns to creator balance with a note.',
  },
}

/* ---------- TOASTS ---------- */
export const TOASTS = {
  login: '🛡️ Welcome back, Super Admin — session audit-logged',
  logout: 'Logged out securely',
  exportCsv: '📄 CSV export generated — download starting',
  settingSaved: 'Setting saved',
  deleted: '🗑️ Deleted permanently — action recorded in audit log',
  blocked: '🚫 User blocked — access revoked, recorded in audit log',
  unblocked: '✓ User unblocked — access restored with all purchases intact',
  suspended: '⏸️ Creator suspended — uploads & withdrawals disabled',
  unpublished: '👁️‍🗨️ Video unpublished — hidden from platform, buyers keep access',
  withdrawalRejected: 'Withdrawal rejected — amount returned to creator balance',
  modDone: '✓ Action completed — recorded in audit log',
  creatorVerified: '✓ Creator verified — they can now publish & withdraw',
  markPaid: '✓ Marked paid — payout recorded & creator notified',
  viewProfile: 'Opening full profile & purchase history',
  viewCreator: 'Opening creator profile, videos & payout history',
  splitEditor: 'Per-creator split editor opened',
  overrideEditor: 'Override editor opened',
  videoPreview: 'Opening video preview player',
  statusEditor: 'Status editor: PPV / Premiere / Free with Ads',
  flagsCleared: 'Flags cleared — video marked safe',
  globalSplit: 'Global split updated — applies to all future sales',
  paymentSettings: 'Payment settings saved',
  newCampaign: 'New campaign form opened',
  backupNow: '💾 Manual backup started — you will be notified when complete',
  viewBackups: 'Last backup: today 03:00 EAT · 214 MB · verified ✓',
}
