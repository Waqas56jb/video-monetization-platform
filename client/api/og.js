/**
 * Per-video share card for WhatsApp / Facebook / X.
 *
 * This used to proxy the Cloudflare poster and, on any miss, return the 512×512
 * app icon. WhatsApp treats a square icon as a tiny webpage thumbnail — which
 * is exactly the "small/poor image" the client kept seeing, especially on
 * WhatsApp Web where the first scrape often lost the race.
 *
 * Every response is now a 1200×630 card with the poster, MTONYO+, the title,
 * the creator and WATCH FREE PREVIEW baked in. If the poster is late, the
 * text card still sells the video. Never a square icon.
 */

import { ImageResponse } from '@vercel/og'
import { createElement as h } from 'react'

export const config = { runtime: 'edge' }

const API =
  process.env.VITE_API_URL ||
  process.env.API_URL ||
  'https://video-monetization-platform-backend.vercel.app'

const clip = (s, n) => {
  const t = String(s || '').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

function slugFrom(req) {
  const url = new URL(req.url)
  const raw =
    url.searchParams.get('slug') ||
    url.searchParams.get('videoId') ||
    url.pathname.split('/').pop() ||
    ''
  return decodeURIComponent(raw).replace(/\.(jpe?g|png)$/i, '').replace(/\/$/, '')
}

export default async function handler(req) {
  const slug = slugFrom(req)
  let title = 'Watch on MTONYO+'
  let creator = ''
  let poster = null

  if (slug) {
    try {
      const r = await fetch(`${API}/api/share/${encodeURIComponent(slug)}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(4000),
      })
      if (r.ok) {
        const body = await r.json()
        title = body?.video?.title || body?.title || title
        creator = body?.video?.creator?.name || ''
        const key = body?.video?.slug || slug
        const src = `${API}/api/share/${encodeURIComponent(key)}/card.jpg`
        const ping = await fetch(src, { signal: AbortSignal.timeout(3500) })
        const type = ping.headers.get('content-type') || ''
        if (ping.ok && /^image\/(jpeg|jpg|png|webp)/i.test(type)) poster = src
      }
    } catch {
      /* Text card still works. */
    }
  }

  const heading = clip(title, 72)
  const byline = clip(creator, 40)

  return new ImageResponse(
    h(
      'div',
      {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: '#08080f',
          color: '#fff',
          fontFamily: 'sans-serif',
        },
      },
      poster
        ? h('img', {
            src: poster,
            width: 1200,
            height: 630,
            style: {
              position: 'absolute',
              left: 0,
              top: 0,
              width: 1200,
              height: 630,
              objectFit: 'cover',
            },
          })
        : null,
      h('div', {
        style: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          top: 0,
          display: 'flex',
          background:
            'linear-gradient(to top, rgba(6,6,10,0.94) 0%, rgba(6,6,10,0.35) 48%, rgba(6,6,10,0.08) 72%)',
        },
      }),
      h(
        'div',
        {
          style: {
            position: 'absolute',
            left: 56,
            right: 56,
            bottom: 46,
            display: 'flex',
            flexDirection: 'column',
          },
        },
        h(
          'div',
          {
            style: {
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: 5,
              color: '#e9b949',
              marginBottom: 14,
            },
          },
          'MTONYO+'
        ),
        h(
          'div',
          {
            style: {
              fontSize: heading.length > 42 ? 40 : 52,
              fontWeight: 800,
              lineHeight: 1.15,
              marginBottom: 18,
            },
          },
          heading
        ),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center' } },
          h(
            'div',
            {
              style: {
                fontSize: 20,
                fontWeight: 800,
                letterSpacing: 1.6,
                background: '#e9b949',
                color: '#06140c',
                padding: '12px 22px',
                borderRadius: 999,
              },
            },
            'WATCH FREE PREVIEW'
          ),
          byline
            ? h(
                'div',
                {
                  style: {
                    marginLeft: 22,
                    fontSize: 24,
                    color: '#d2d2de',
                  },
                },
                byline
              )
            : null
        )
      )
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        'Content-Disposition': 'inline; filename="share.png"',
      },
    }
  )
}
