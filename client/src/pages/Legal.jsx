import { useEffect } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, ScrollText } from 'lucide-react'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import { LEGAL_DOCS, LEGAL_ORDER, LEGAL_UPDATED } from '@/data/legal'

/**
 * The platform's terms, all five of them, through one route.
 *
 * The footer listed these as plain text for months — "Terms of Service" that
 * was not a link to anything. A storefront that takes money needs them to be
 * readable before somebody pays, not after they ask.
 *
 * One component rather than five pages: they share a shape, and five files
 * would drift apart the first time one was edited.
 */
export default function Legal() {
  const { doc } = useParams()
  const document_ = LEGAL_DOCS[doc]

  useEffect(() => {
    if (!document_) return
    window.document.title = `${document_.title} — MTONYO+`
    window.scrollTo({ top: 0 })
    return () => {
      window.document.title = "MTONYO+ — Tanzania's Premium Creator Video Platform"
    }
  }, [document_])

  if (!document_) return <Navigate to="/legal/terms" replace />

  return (
    <div className="page">
      <Header />

      <section className="legal">
        <div className="container">
          <Link className="legal-back" to="/">
            <ArrowLeft />
            Back to home
          </Link>

          <div className="legal-head">
            <span className="badge">
              <ScrollText style={{ width: 14, height: 14 }} />
              MTONYO+ POLICIES
            </span>
            <h1>{document_.title}</h1>
            <p>{document_.intro}</p>
            <small>Last updated {LEGAL_UPDATED}</small>
          </div>

          {/* Every document is one tap from every other — somebody reading the
              refund rules is usually about to want the payment terms too. */}
          <nav className="legal-tabs" aria-label="Policies">
            {LEGAL_ORDER.map((key) => (
              <Link
                key={key}
                to={`/legal/${key}`}
                className={`chip chip-sm ${key === doc ? 'on' : ''}`.trim()}
                aria-current={key === doc ? 'page' : undefined}
              >
                {LEGAL_DOCS[key].title}
              </Link>
            ))}
          </nav>

          <article className="legal-body">
            {document_.sections.map((section) => (
              <section key={section.h}>
                <h2>{section.h}</h2>
                {section.p.map((paragraph) => (
                  <p key={paragraph.slice(0, 40)}>{paragraph}</p>
                ))}
              </section>
            ))}
          </article>
        </div>
      </section>

      <Footer />
    </div>
  )
}
