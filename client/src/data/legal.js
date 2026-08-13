/**
 * The platform's own terms, written from how it actually behaves.
 *
 * Every clause here describes a rule that exists in the code or the database —
 * the review queue, the per-video entitlement, the split, the premiere expiry,
 * the fact that a purchased video cannot be deleted out from under its buyer.
 * Nothing promises behaviour the platform does not have.
 *
 * IMPORTANT: these are operating terms, not legal advice. They need review by a
 * lawyer qualified in Tanzania before the platform takes real money from the
 * public — particularly the consumer-refund position and the data-protection
 * section, which are the two that carry statutory obligations.
 */

const CONTACT = 'support@mtonyo.co.tz'

export const LEGAL_DOCS = {
  terms: {
    slug: 'terms',
    title: 'Terms of Service',
    intro:
      'These terms cover using MTONYO+ as a viewer. If you upload and sell content, the Creator Agreement applies to you as well.',
    sections: [
      {
        h: 'Your account',
        p: [
          'You need an account to buy anything. One person, one account, and the details on it must be accurate enough that we can reach you about a payment.',
          'You are responsible for what happens under your account. If you think someone else has access to it, change your password immediately — that signs the account out everywhere it is used.',
          'We may suspend or close an account that is used to break these terms, to abuse other users, or to attempt to bypass payment.',
        ],
      },
      {
        h: 'What you are buying',
        p: [
          'Paying for a video buys you access to that one video, on your account. It does not give you the file, and it does not transfer any ownership in the content — that stays with the creator.',
          'A purchase is recorded against you and the video together. It stays in your library and follows you to any device you sign in on. Signing out does not remove it.',
          'You may not record, copy, re-upload or redistribute anything you have paid for. Playback links are signed and expire; sharing one does not give anybody else access, and attempting to defeat that is a breach of these terms.',
        ],
      },
      {
        h: 'Free previews and Free + Ads',
        p: [
          'Most paid videos carry a free preview whose length is chosen by the creator. The preview is the whole of what you get before paying.',
          'A creator may release a video as Free + Ads, or run a Paid Premiere that becomes Free + Ads when its paid period ends. If you paid during the premiere, the video stays ad-free for you afterwards — that is part of what you paid for.',
        ],
      },
      {
        h: 'Content on the platform',
        p: [
          'Every upload is reviewed by our team before it is publicly visible. We may reject content, ask for changes, or remove content already published.',
          'If a video you bought is later removed from the platform, your purchase record is kept. Contact us and we will deal with it individually.',
        ],
      },
      {
        h: 'Availability',
        p: [
          'We work to keep the platform available but do not guarantee uninterrupted service. Video delivery depends on third parties and on your own connection.',
          'We may change or discontinue features. Where a change affects something you have already paid for, we will tell you.',
        ],
      },
      {
        h: 'Closing your account',
        p: [
          'You may close your account from Settings. Your purchase and payment records are kept afterwards, because they are part of the platform’s own financial records and of the creators’ earnings history.',
        ],
      },
    ],
  },

  privacy: {
    slug: 'privacy',
    title: 'Privacy Policy',
    intro:
      'What we hold about you, why we hold it, and what you can ask us to do with it.',
    sections: [
      {
        h: 'What we collect',
        p: [
          'Account details you give us: name, email address, and optionally a phone number, location, short bio, website and profile picture.',
          'Payment records: the amount, the method, the mobile money number used, the provider’s reference, and whether it succeeded. We never see or store your mobile money PIN.',
          'Activity needed to run the service: which videos you have bought, view counts, and how far through a video you have watched so it can resume where you stopped.',
          'Creators additionally have payout details and an earnings ledger.',
        ],
      },
      {
        h: 'Why we hold it',
        p: [
          'To give you access to what you paid for, and to be able to prove you paid for it.',
          'To pay creators the correct share of what their audience spent.',
          'To review content before publication, and to act on reports about it.',
          'To send you the messages the service depends on — password resets, and news about your own account.',
        ],
      },
      {
        h: 'Where it is stored',
        p: [
          'Account and transaction records are held in a managed PostgreSQL database. Video files and their derived streams are held by Cloudflare Stream. Profile pictures and cover images are held in managed object storage.',
          'Video playback uses signed, short-lived links, so a copied address stops working rather than circulating indefinitely.',
        ],
      },
      {
        h: 'Who else sees it',
        p: [
          'Our payment provider receives what it needs to take the payment.',
          'A creator can see that a purchase of their video happened, and the totals it contributes to their earnings. They do not get your contact details.',
          'Our staff can see account and transaction records where their role requires it. Every staff action is recorded against the individual who took it.',
          'We do not sell personal data, and we do not share it for advertising.',
        ],
      },
      {
        h: 'Your choices',
        p: [
          'You can change or clear most of your profile at any time in the dashboard, and turn off announcement emails in Settings. Password-reset emails are always sent — without them you would have no way back into your account.',
          `You can ask for a copy of what we hold, or ask us to correct it, by writing to ${CONTACT}.`,
          'Closing your account stops you signing in. Purchase, payment and earnings records are retained afterwards as financial records.',
        ],
      },
    ],
  },

  creators: {
    slug: 'creators',
    title: 'Creator Agreement',
    intro:
      'This applies to you the moment you upload something. It sets out what stays yours, what you are confirming when you upload, and how you get paid.',
    sections: [
      {
        h: 'Your content stays yours',
        p: [
          'You keep ownership of everything you upload. You grant MTONYO+ a non-exclusive licence to store it, transcode it, generate a preview and a short promotional clip from it, and stream it to viewers on the terms you set — for as long as it is on the platform.',
          'That licence exists so we can run the service. It does not let us sell your work elsewhere, license it on, or use it in advertising without asking you.',
        ],
      },
      {
        h: 'What you confirm when you upload',
        p: [
          'That you made the content, or otherwise hold every right needed to sell it here — including the rights of anyone appearing in it and of any music used.',
          'That it does not infringe anyone’s copyright, and is not illegal, hateful, or sexually explicit material involving anyone who is not a consenting adult.',
          'You remain responsible for this. If a claim is made about your content, we may take it down while it is resolved.',
        ],
      },
      {
        h: 'Review and publication',
        p: [
          'Nothing goes live automatically. Every upload enters a review queue and a member of our team approves it, asks for changes, or rejects it with a reason.',
          'We may ask you to change your price, preview length or paid period. We do not change them for you — those are yours to set, and only you can alter them.',
          'We may unpublish or remove content that breaks this agreement, including after it has been published.',
        ],
      },
      {
        h: 'Money',
        p: [
          'You set your own price, your own free-preview length, and — for a Paid Premiere — your own paid period.',
          'You receive the creator share of each sale, shown in your dashboard and applied at the moment of sale. The platform keeps the remainder. Your share can be set individually; if it is not, the platform default applies.',
          'Where you have chosen Free + Ads, or a premiere has reached the end of its paid period, you receive the creator share of advertising revenue earned against that video.',
          'Earnings are credited when a payment settles, not when it is initiated. A payment that fails, is cancelled or expires credits nothing.',
        ],
      },
      {
        h: 'Withdrawals',
        p: [
          'You can request a withdrawal once your available balance reaches the platform minimum. Requests are reviewed and paid manually, to the payout number on your account.',
          'Keep that number correct. Changing it requires your password, and we will notify you when it changes. Money sent to a number you gave us is not recoverable by us.',
        ],
      },
      {
        h: 'Removing your content',
        p: [
          'You can ask for a video to be taken down at any time. You cannot delete one yourself, and this is deliberate: if somebody has paid for permanent access, that access cannot simply disappear because you changed your mind.',
          'An administrator decides each request. Where there are buyers, the usual outcome is that the video is unpublished — new sales stop, existing buyers keep what they paid for.',
        ],
      },
    ],
  },

  copyright: {
    slug: 'copyright',
    title: 'Copyright & Reporting',
    intro:
      'How to tell us that something on MTONYO+ should not be here, and what we do about it.',
    sections: [
      {
        h: 'Reporting content',
        p: [
          `Write to ${CONTACT} with the link to the video, what is wrong with it, and — if you are making a copyright claim — enough for us to identify the work you say it infringes and your authority to act for the rights holder.`,
          'We look at every report. We may unpublish the content while we do.',
        ],
      },
      {
        h: 'What happens next',
        p: [
          'If a claim is upheld, the content is removed and the creator is told why. Repeated infringement leads to the creator’s account being suspended or closed.',
          'If we do not uphold it, the content stays and we tell you that too.',
          'Every decision is recorded against the member of staff who made it.',
        ],
      },
      {
        h: 'If your content was removed',
        p: [
          'You will be given the reason. If you believe it was wrong, reply to that message and it will be looked at again by an administrator.',
        ],
      },
      {
        h: 'Bad-faith reports',
        p: [
          'Reporting content you know you have no claim over wastes a creator’s income and our time. We may refuse to act on further reports from a source that does it.',
        ],
      },
    ],
  },

  payments: {
    slug: 'payments',
    title: 'Payments & Refunds',
    intro: 'How paying works, and where you stand if something goes wrong.',
    sections: [
      {
        h: 'Paying',
        p: [
          'Payments are taken by mobile money. You enter the number to charge, approve the request on your handset, and the video unlocks as soon as the provider confirms the payment.',
          'Access is granted only on a confirmed payment. A payment that is pending, failed, cancelled or expired unlocks nothing — if you were not charged, nothing happened.',
          'Prices are in Tanzanian Shillings and are set by the creator. The price you are shown is the price you pay.',
        ],
      },
      {
        h: 'If a payment does not confirm',
        p: [
          'Occasionally a provider’s confirmation is delayed or lost. The platform re-checks any payment still showing as pending, so a payment that actually succeeded will unlock the video without you doing anything.',
          `If you were charged and the video is still locked after a few minutes, contact ${CONTACT} with the date, the amount and the number you paid from, and we will trace it.`,
        ],
      },
      {
        h: 'Refunds',
        p: [
          'Because a purchase gives immediate access to the full video, we do not refund simply because you changed your mind after watching.',
          'We do refund where you were charged and did not receive access, where you were charged more than once for the same video, or where the video is materially not what its page described.',
          `Ask within 14 days at ${CONTACT}. Approved refunds go back to the mobile money number the payment came from, and the corresponding access is withdrawn.`,
          'This does not affect any right you have under Tanzanian consumer law.',
        ],
      },
      {
        h: 'Creator payouts',
        p: [
          'Creator earnings, withdrawal thresholds and payout timing are covered by the Creator Agreement.',
        ],
      },
    ],
  },
}

export const LEGAL_ORDER = ['terms', 'privacy', 'creators', 'copyright', 'payments']

/** The date these were last changed. Update it whenever the wording does. */
export const LEGAL_UPDATED = '13 August 2026'
