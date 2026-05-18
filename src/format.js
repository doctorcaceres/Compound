// ----------------------------------------------------------------------------
// Sectors — single source of truth.
// Add or remove from this array and every component that imports SECTORS
// (Auth signup dropdown, Network filters, Profile display, room create form)
// updates automatically.
// ----------------------------------------------------------------------------
export const SECTORS = [
  { value: 'energy',        label: 'Energy & Power' },
  { value: 'healthcare',    label: 'Healthcare & Biomedical' },
  { value: 'tech',          label: 'Technology' },
  { value: 'finance',       label: 'Finance & Banking' },
  { value: 'legal',         label: 'Legal' },
  { value: 'realestate',    label: 'Real Estate' },
  { value: 'education',     label: 'Education' },
  { value: 'consulting',    label: 'Consulting' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'maritime',      label: 'Maritime & Shipping' },
  { value: 'mining',        label: 'Mining & Resources' },
  { value: 'climate',       label: 'Climate & Sustainability' },
  { value: 'agriculture',   label: 'Agriculture & Food' },
  { value: 'media',         label: 'Media & Entertainment' },
  { value: 'defense',       label: 'Aerospace & Defense' },
  { value: 'logistics',     label: 'Logistics & Supply Chain' },
  { value: 'pharma',        label: 'Pharmaceuticals' },
  { value: 'construction',  label: 'Construction & Infrastructure' },
  { value: 'telecom',       label: 'Telecommunications' },
  { value: 'retail',        label: 'Retail & Consumer Goods' },
  { value: 'automotive',    label: 'Automotive' },
  { value: 'government',    label: 'Government & Public Sector' },
  { value: 'nonprofit',     label: 'Nonprofit & NGO' },
  { value: 'profservices',  label: 'Professional Services' },
  { value: 'biotech',       label: 'Biotech & Life Sciences' },
  { value: 'other',         label: 'Other' },
]

const SECTOR_LOOKUP = SECTORS.reduce((acc, s) => { acc[s.value] = s.label; return acc }, {})

// Legacy/alias mapping — keeps existing profile rows readable when their
// sector token doesn't match the canonical list above.
const SECTOR_ALIASES = {
  infrastructure: 'Construction & Infrastructure',
  other: 'Other',
}

export function sectorLabel(value) {
  if (!value) return 'Other'
  const key = String(value).toLowerCase()
  return SECTOR_LOOKUP[key] || SECTOR_ALIASES[key] || value
}

// ----------------------------------------------------------------------------
// Sector → color theme. Used for tags, avatar backgrounds, and accent colors.
// Sectors are grouped into broad color families so we don't need 25 unique
// hues; closely related industries share a tint.
// ----------------------------------------------------------------------------
// All sector chips share the editorial copper-soft look. Avatar backgrounds
// keep a per-sector hue so users still get visual distinction at a glance.
const CHIP = {
  sectorColor: 'var(--sector-chip-bg)',
  sectorText:  'var(--sector-chip-text)',
  cardColor:   'var(--sector-chip-text)',
}
const THEME_GREEN  = { ...CHIP, bg: '#2F7D5F' }       /* deep editorial green */
const THEME_NAVY   = { ...CHIP, bg: '#2D4D6B' }       /* deep navy            */
const THEME_AMBER  = { ...CHIP, bg: '#A7652A' }       /* copper avatar         */
const THEME_NLIGHT = { ...CHIP, bg: '#3B5F80' }       /* lighter navy          */

const SECTOR_THEMES = {
  energy:        THEME_GREEN,
  climate:       THEME_GREEN,
  agriculture:   THEME_GREEN,
  biotech:       THEME_GREEN,
  healthcare:    THEME_GREEN,
  pharma:        THEME_GREEN,
  tech:          THEME_GREEN,
  manufacturing: THEME_AMBER,
  construction:  THEME_AMBER,
  retail:        THEME_AMBER,
  automotive:    THEME_AMBER,
  legal:         THEME_AMBER,
  consulting:    THEME_AMBER,
  media:         THEME_AMBER,
  education:     THEME_NAVY,
  finance:       THEME_NAVY,
  realestate:    THEME_NAVY,
  government:    THEME_NAVY,
  nonprofit:     THEME_NAVY,
  profservices:  THEME_NAVY,
  telecom:       THEME_NLIGHT,
  defense:       THEME_NLIGHT,
  maritime:      THEME_NLIGHT,
  mining:        THEME_NLIGHT,
  logistics:     THEME_NLIGHT,
  // legacy aliases
  infrastructure: THEME_AMBER,
}

const FALLBACK_THEME = {
  sectorColor: 'var(--sector-chip-bg)',
  sectorText:  'var(--sector-chip-text)',
  bg: '#3B5F80',
  cardColor: 'var(--sector-chip-text)',
}

export function sectorTheme(value) {
  if (!value) return FALLBACK_THEME
  const key = String(value).toLowerCase()
  if (SECTOR_THEMES[key]) return SECTOR_THEMES[key]
  // Tolerate label-form input ("Energy & Power" → energy)
  for (const s of SECTORS) {
    if (key === s.label.toLowerCase()) return SECTOR_THEMES[s.value] || FALLBACK_THEME
  }
  return FALLBACK_THEME
}

// ----------------------------------------------------------------------------
// Misc
// ----------------------------------------------------------------------------
export function makeInitials(name) {
  if (!name) return 'U'
  return name.split(' ').map(w => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 2) || 'U'
}

export function timeAgo(iso) {
  if (!iso) return ''
  const now = Date.now()
  const t = new Date(iso).getTime()
  const diff = Math.floor((now - t) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
