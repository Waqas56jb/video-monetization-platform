import { Camera, Clapperboard, Megaphone, Wrench } from 'lucide-react'

/**
 * What Creator Capital can be used for — the homepage section and the
 * /creator-capital page read this one list. It lives here, not in the
 * homepage section, so the info page can use it without pulling that lazily
 * loaded section into the main bundle.
 */
export const FUNDING_USES = [
  { icon: Camera, title: 'Production Funding', text: 'Turn ideas into bigger projects.' },
  { icon: Wrench, title: 'Equipment', text: 'Cameras, audio, lights and more.' },
  { icon: Clapperboard, title: 'Filming & Editing', text: 'Better tools. Higher quality.' },
  { icon: Megaphone, title: 'Marketing & Promotion', text: 'Reach more viewers in Tanzania and beyond.' },
]
