import { Link } from 'react-router-dom'
import { Facebook, Instagram, Twitter, Youtube } from 'lucide-react'
import Logo from '@/components/ui/Logo'
import { FOOTER_LINKS } from '@/data/copy'
import useSectionLink from '@/hooks/useSectionLink'
import { useToast } from '@/context/ToastContext'

const SOCIALS = [
  { label: 'Instagram', Icon: Instagram },
  { label: 'Facebook', Icon: Facebook },
  { label: 'Twitter', Icon: Twitter },
  { label: 'Youtube', Icon: Youtube },
]

export default function Footer() {
  const showToast = useToast()
  /* Those sections only exist on the landing page, so a raw href did nothing at
     all from /explore or a policy page — the same fault the client already
     reported in the header nav. */
  const goToSection = useSectionLink()

  return (
    <footer>
      <div className="container">
        <div className="foot-grid">
          <div className="foot-brand">
            <Logo />
            <p>
              The premium video platform helping Tanzanian creators monetize their content. Upload
              first, sell it, then release Free + Ads.
            </p>
            <div className="socials">
              {SOCIALS.map(({ label, Icon }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  onClick={(e) => {
                    e.preventDefault()
                    showToast(`Opening ${label}…`)
                  }}
                >
                  <Icon />
                </a>
              ))}
            </div>
          </div>

          <div className="foot-col">
            <h4>Platform</h4>
            {FOOTER_LINKS.platform.map((l) => (
              <a
                key={l.hash}
                href={l.hash}
                onClick={(e) => goToSection(l.hash.replace('#', ''), e)}
              >
                {l.label}
              </a>
            ))}
          </div>

          <div className="foot-col">
            <h4>Account</h4>
            {FOOTER_LINKS.account.map((l) => (
              <Link key={l.to} to={l.to}>
                {l.label}
              </Link>
            ))}
          </div>

          <div className="foot-col">
            <h4>Legal</h4>
            {FOOTER_LINKS.legal.map((l) => (
              <Link key={l.to} to={l.to}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="foot-bottom">
          <span>© 2026 MTONYO+. Made with ❤️ in Tanzania.</span>
          <div className="pay-badges">
            <span>M-PESA</span>
            <span>AIRTEL MONEY</span>
            <span>SSL SECURE</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
