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
 * There used to be a LANDING_SHOWCASE here: four hand-written cards with
 * invented creators, invented view counts and invented prices, sitting on the
 * homepage as though they were real releases.
 *
 * It is gone, and nothing replaced it — the homepage grid reads the live
 * catalogue now. The client's instruction was plain: "Remove fake/demo creator
 * earnings presented as real unless they are actual production data." A figure
 * on a storefront is a claim, and a made-up one is a false claim however good
 * it makes the layout look.
 */

/** The scrolling strip of what the platform does. */
export const MARQUEE_ITEMS = [
  'INSTANT ACCESS',
  'FLEXIBLE PAYMENTS',
  'CREATOR CONTROL',
  'PAID PREMIERES',
  'FREE + ADS',
  'PAY ONCE',
]

/** How buying a video works, for someone who has never done it. */
/**
 * The four steps, in the client's own words: Upload → Share → People Watch →
 * You Earn.
 *
 * The middle two used to be "Choose how people watch" and "Your audience pays
 * their way", which described the platform's mechanics rather than the
 * creator's day. Sharing was missing entirely, and it is the step that actually
 * matters here — almost nobody finds a video by browsing this site, they arrive
 * on a link somebody sent them.
 */
export const STEPS = [
  { icon: 'upload', title: 'Upload', text: 'Add your video and set your price.' },
  {
    icon: 'share-2',
    title: 'Share',
    text: 'Send your link on WhatsApp, Instagram or TikTok.',
    tone: 'gold',
    delay: 1,
  },
  {
    icon: 'play-circle',
    title: 'People watch',
    text: 'They see a free preview, then pay to keep watching.',
    tone: 'gold',
    delay: 2,
  },
  {
    icon: 'bar-chart-3',
    title: 'You earn',
    text: 'Your money lands in your dashboard, ready to withdraw.',
    tone: 'green',
    delay: 3,
  },
]

/**
 * The three ways a creator can release something.
 *
 * Named from the viewer's side of the transaction, which is the client's point:
 * "Pay Once" says what you do, where "PPV Forever" was jargon that also implied
 * the platform keeps the video locked up on the creator's behalf.
 */
/**
 * The three ways to release something, in the client's own words.
 *
 * These carried a label, a tagline and a paragraph each — three lines of
 * reading before you knew which one you wanted. The client's note was that an
 * average viewer should understand this in seconds, and gave the wording: a
 * verb for what the creator does, and one sentence for what happens.
 *
 * `label` is the creator's action and heads the section. `viewerTag` is the
 * same model named from the other side of the screen — it is what a video card
 * says, and the two must stay recognisable as the same thing, which is why the
 * card wording lives here beside it rather than being invented separately.
 * Anything more technical than this belongs in the upload form and help pages,
 * not the public site.
 */
export const ACCESS_OPTIONS = [
  {
    key: 'ppv_forever',
    icon: 'lock',
    label: 'Sell it',
    viewerTag: 'Pay Once',
    text:
      'Get paid directly by your viewers. They watch a free preview, then pay once to continue watching.',
  },
  {
    key: 'paid_premiere',
    icon: 'calendar-clock',
    tone: 'gold',
    label: 'Premiere it',
    viewerTag: 'Paid Premiere',
    text:
      'Earn from sales first, then advertising. Choose 30, 60 or 90 days. Viewers pay during that period. Afterward, the video automatically becomes Free + Ads.',
  },
  {
    key: 'free_with_ads',
    icon: 'megaphone',
    tone: 'green',
    label: 'Free + Ads',
    viewerTag: 'Free + Ads',
    text: 'Let everyone watch for free. Your video is free from day one and you earn from advertising.',
  },
]

/**
 * What MTONYO+ is for — deliberately wider than films and music.
 *
 * A creator who makes podcasts or courses should see themselves on this page.
 */
/**
 * The categories. One list, and this is it.
 *
 * The homepage advertised these ten while the upload form took free text and
 * Explore listed whatever strings happened to exist in the database — so the
 * three never agreed, which is exactly what the client reported. A creator
 * typing "documentry" created a category of one, permanently.
 *
 * Everything reads from here now: the upload picker, the Explore filters and
 * the landing strip. Explore additionally shows any category already in the
 * database that is not on this list, so content uploaded before the list
 * existed stays reachable instead of disappearing from the filters.
 */
/**
 * The category taxonomy. Mirrors server/src/lib/categories.js, which is what
 * actually enforces it — the API normalises on write and rejects anything not
 * on this list, so the two cannot drift the way "Documentaries"/"Documentary"
 * did. Add to both, or not at all.
 */
export const CATEGORIES = [
  'Films', 'Series', 'Music', 'Concerts', 'Comedy',
  'Documentaries', 'Sports', 'Podcasts', 'Courses', 'Behind the Scenes',
  'Food',
]

/** The same list, under the name the landing page has always called it. */
export const CONTENT_KINDS = CATEGORIES

/**
 * How long a Paid Premiere stays paid.
 *
 * These were free number inputs accepting anything from 1 to 3650, which is
 * how a 45-day window reached the database. The client's specification names
 * three windows and its acceptance tests check exactly those three, so the
 * choice is now between them rather than an open field with three sensible
 * answers hidden in it.
 *
 * The API still accepts other values: it has to, because a video already
 * carrying a window outside this list must keep working, and the expiry job
 * reads `premiere_ends_at` rather than the number of days anyway.
 */
export const PREMIERE_WINDOWS = [
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
]

/** The principle the client wants running through the whole site. */
export const CREATOR_CONTROL = {
  heading: 'Your Content. Your Rules.',
  /**
   * Two lines, not four.
   *
   * Three of the four said the same thing the release models say directly
   * above this section — how it is released, the paid period, whether it goes
   * free — so a visitor read the three options and then read them again as
   * bullet points. The client asked for less repetition on the homepage; this
   * is the clearest case of it.
   */
  points: [
    'You choose the price.',
    'You choose how and when it is released.',
  ],
  footnote: 'MTONYO+ provides the platform. You control the release.',
}

/** What the platform offers creators. */
export const FEATURES = [
  {
    icon: 'banknote',
    tone: 'gold',
    title: 'Pay Once & Paid Premiere',
    text: 'Release each video your way: keep it paid, or run a Paid Premiere that becomes Free + Ads automatically when your paid period ends — and keeps earning from ads.',
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
    title: 'Fast, Secure & Flexible Payments',
    text: "Mobile money, cards and digital payments. Verified in seconds, and the video unlocks instantly — tied to the customer's own account.",
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
    title: 'Secure Streaming Protection',
    text: 'Signed, expiring stream URLs mean copied links die instantly. Adaptive streaming delivers smooth playback even on slow connections.',
    delay: 2,
  },
]

/**
 * Platform Power, as three stories rather than six tiles.
 *
 * The six features below are unchanged — every word of them survives — but a
 * 3×2 grid of icon cards is what the client meant by "a PDF made of boxes",
 * and six equal tiles also flatten the difference between "you can set a
 * preview length" and "nobody can steal your film". Grouped into three, each
 * one answers a question somebody actually has: how do people find it, how do
 * I get paid, and how do I know it is working.
 */
export const PLATFORM_POWERS = [
  {
    key: 'discover',
    kicker: 'Share',
    title: 'Share your video. Let people watch. Earn.',
    text:
      'When you share your MTONYO+ video on WhatsApp or social media, people can watch the free preview and pay to continue.',
    points: ['Share', 'Watch free preview', 'Pay', 'Keep watching'],
  },
  {
    key: 'monetize',
    kicker: 'Monetize',
    title: 'Paid on your terms.',
    text:
      'You set the price, the free preview and the paid period — per video, not once for your whole channel. Viewers pay with the money already on their phone.',
    tone: 'gold',
    points: ['Pay Once & Paid Premiere', 'You Set the Free Preview', 'Mobile Money, Cards & Digital'],
  },
  {
    key: 'grow',
    kicker: 'Grow',
    title: 'See it as it happens.',
    text:
      'Views, unlocks and the share of every sale that is yours, updating as they land. Withdraw to M-Pesa or Airtel Money whenever the balance is there.',
    tone: 'green',
    points: ['Live earnings dashboard', 'Conversion and view tracking', 'Ads keep paying after a premiere'],
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
    text: 'When your paid period ends and the video goes Free + Ads, advertising keeps paying you.',
  },
]

export const FOOTER_LINKS = {
  platform: [
    { label: 'Trending Videos', hash: '#trending' },
    { label: 'How It Works', hash: '#how' },
    { label: 'Features', hash: '#features' },
    { label: 'For Creators', hash: '#creators' },
    { label: 'Stories', hash: '#stories' },
  ],
  account: [
    { label: 'Sign Up Free', to: '/signup' },
    { label: 'Log In', to: '/login' },
    { label: 'Reset Password', to: '/reset' },
    { label: 'My Dashboard', to: '/dashboard' },
  ],
  /**
   * These were plain strings that popped a "coming in your full build" toast.
   * A storefront that takes money has to let somebody read the terms before
   * they pay, not after they ask for them.
   */
  legal: [
    { label: 'Terms of Service', to: '/legal/terms' },
    { label: 'Privacy Policy', to: '/legal/privacy' },
    { label: 'Creator Agreement', to: '/legal/creators' },
    { label: 'Payments & Refunds', to: '/legal/payments' },
    { label: 'Copyright & Reporting', to: '/legal/copyright' },
  ],
}

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
  library: () => ['My Library', 'Every video you own — yours to watch any time.'],
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
