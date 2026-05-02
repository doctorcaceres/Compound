# Compound — Project Handoff Document

> **Note on scope:** This document was reconstructed from the current state of the codebase. It is not transcribed from session logs — there are no conversation transcripts or git history available to draw from. Where rationale is given, it is inferred from the patterns and choices visible in the code.

---

## 1. Product Overview

**Compound** is a B2B professional networking and deal-execution platform positioned at the intersection of LinkedIn (networking), Bloomberg Terminal (industry intelligence), and a virtual data room (deal execution).

**Tagline (in-app):** *"Where industries and people connect."*

**Target audience:** Professionals and companies in heavy industry verticals — energy, infrastructure, maritime, manufacturing, climate tech, mining, industrial finance, and defense/aerospace.

**Core value proposition:** Unlike LinkedIn (general-purpose, consumer-flavored) or Bloomberg (data-only, no collaboration), Compound combines:
1. A sector-aware professional network
2. A content/intelligence feed scoped to industrial verticals
3. Built-in **Conversation Rooms** — collaborative spaces where parties can move from Getting Started through In Progress and Review to Complete, all on-platform.

The product is currently a **frontend-only prototype** (no backend, no persistence). All data is in-memory React state seeded from hardcoded sample arrays.

---

## 2. Tech Stack

| Layer | Choice | Version |
|---|---|---|
| Framework | React | 19.0.0 |
| Build tool | Vite | 6.0.0 |
| Plugin | @vitejs/plugin-react | 4.3.4 |
| Styling | Plain CSS (per-component) + CSS custom properties | — |
| State | React `useState` only — no Redux, Zustand, or Context | — |
| Routing | None — view switching via `activePage` state in `App.jsx` | — |
| Backend | None | — |
| Auth | Mocked (client-side only) | — |
| TypeScript | Not used — pure `.jsx` | — |
| Linting | None configured | — |
| Tests | None | — |

**Dev commands** (`package.json`):
- `npm run dev` — starts Vite dev server (host:true, accessible on LAN)
- `npm run build` — production build to `/dist`
- `npm run preview` — preview built output

**Fonts** loaded from Google Fonts in [index.html](index.html):
- `DM Sans` (400/500/600/700) — primary sans
- `Space Mono` (400/700) — monospace accent (used for sector tags, code-feel labels)

**Why these choices (inferred):**
- React 19 + Vite — fastest possible iteration on a UI-heavy prototype.
- No TypeScript — speed of prototyping prioritized over type safety; trivial to migrate later.
- No router — a flat `switch` on `activePage` is sufficient when there are 5 views and no URL persistence is required yet.
- No state library — every screen is largely self-contained; lifting state higher will become necessary only when real persistence/auth lands.

---

## 3. Design Language

A distinct, opinionated visual identity defined entirely in [src/index.css](src/index.css) as CSS custom properties. The tokens are referenced everywhere by name (`var(--…)`), making a future theme/rebrand straightforward.

### 3.1 Color tokens

```css
/* Backgrounds — "CLINICAL black" */
--bg-deep:        #0A0D10;   /* page background */
--bg-card:        #0F1318;   /* card background */
--bg-card-hover:  #141920;
--bg-surface:     #161C24;

/* Borders */
--border:         #1E2733;
--border-light:   #263040;

/* Text */
--text-primary:   #E8ECF1;
--text-secondary: #8A94A6;
--text-muted:     #5A6478;

/* Brand: "CHORDIS navy" */
--navy:           #1B3A5C;
--navy-light:     #234B74;
--navy-glow:      rgba(27, 58, 92, 0.25);

/* Brand: "CLINICAL dark green/teal" */
--green:          #1F9B73;
--green-dim:      #1A8563;
--green-glow:     rgba(31, 155, 115, 0.14);

/* Accent line — same as --green */
--accent-line:    #1F9B73;

/* Utility */
--amber:          #F59E0B;
--red:            #EF4444;
```

### 3.2 Naming conventions

The token comments reference two internal codenames — **"CLINICAL"** (the clinical/sober black + teal mood) and **"CHORDIS"** (the navy palette). These appear to be design-system identifiers; teammates picking this up should be aware they're internal labels, not third-party libraries.

### 3.3 Sector → color mapping

A repeating convention across components:

| Sector | Background pattern | Foreground/text |
|---|---|---|
| Energy | `--green-glow` bg, `--green` text | tag color `--green` |
| Manufacturing | `rgba(245,158,11,0.15)` bg, `--amber` text | tag color `--amber` |
| Commodities / Maritime | `--navy-glow` bg, `--accent-line` text | tag color `--accent-line` |
| Infrastructure | `--amber` text | — |
| Mining | dark olive `#2F3D25` bg | — |
| Finance | `--amber` text | — |

These are not centralized — they're inlined into the seed data in [Feed.jsx](src/Feed.jsx), [Network.jsx](src/Network.jsx), [Messaging.jsx](src/Messaging.jsx), [ConversationRooms.jsx](src/ConversationRooms.jsx). **First refactor candidate** when wiring real data: extract a single sector-style map.

### 3.4 Typography

- `DM Sans` for body and headings.
- `Space Mono` reserved for sector tags, short uppercase labels, and the logo's "C" mark.

### 3.5 Animation primitive

A single keyframe `fadeIn` is defined globally in [index.css:60](src/index.css:60); individual components apply it on mount/active states.

---

## 4. Application Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  main.jsx → App.jsx (root)                                  │
│                                                             │
│  user === null  →  <Auth />                                 │
│  user !== null  →  <Header /> + renderPage()                │
│                                                             │
│  renderPage() switches on activePage:                       │
│    'feed'      → LeftSidebar + Feed + RightSidebar          │
│    'network'   → Network                                    │
│    'conversationrooms' → ConversationRooms                                  │
│    'messaging' → Messaging                                  │
│    'profile'   → Profile (with optional `target`)           │
└─────────────────────────────────────────────────────────────┘
```

### 4.1 Top-level state ([src/App.jsx](src/App.jsx))

Three pieces of state live in `App`:

| State | Type | Purpose |
|---|---|---|
| `user` | `{ name, email, sector, accountType, initials }` \| `null` | Auth gate. Null = show Auth; populated = show app. |
| `activePage` | `'feed' \| 'network' \| 'conversationrooms' \| 'messaging' \| 'profile'` | Active view. |
| `profileTarget` | person object \| `null` | If null + activePage='profile' → show *own* profile. If set → view *that* person's profile. |

Helper `openProfile(person)` sets both `profileTarget` and switches the page in one call. Header's avatar click calls `openProfile(null)` to view your own profile.

### 4.2 Layout

The home view uses a 3-column CSS grid defined in [App.css:5](src/App.css:5):

```css
grid-template-columns: 280px 1fr 300px;   /* left | center | right */
max-width: 1400px;
```

This is the LinkedIn-style triple-pane layout (left rail, content feed, right rail). Network/Messaging/ConversationRooms/Profile each define their own internal layout instead of using this grid.

---

## 5. Components — In Detail

### 5.1 `Auth.jsx` ([src/Auth.jsx](src/Auth.jsx))

Login/signup gate. Two modes toggled by local state (`mode === 'signup' | 'login'`).

**Signup form fields:**
- Account type — `'company'` or `'individual'` (visual radio cards with diamond/circle iconography)
- Full name
- Work email — validated against personal-domain blocklist (`gmail.com`, `yahoo.com`, `hotmail.com`, `outlook.com`) when account type is `company`
- Sector — dropdown of 10 sector enums (see below)
- Password — min 8 chars

**Login form** is just email + password; on submit, builds a fake user object and calls `onLogin`.

**Sector enum** (drives the rest of the app's filtering):
```
energy, infrastructure, maritime, manufacturing,
climate, mining, finance, defense, tech, other
```

**Initials derivation:**
```js
name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
```
This drives the avatar circles everywhere.

**Rationale:**
- Personal-domain blocklist enforces "this is a serious B2B platform" identity gating without requiring a real email-verification backend.
- Account-type split reflects the dual user model — Compound onboards both *organizations* and *individuals*, and downstream UI makes that distinction (e.g. Profile shows `'Independent'` for individual accounts).

### 5.2 `Header.jsx` ([src/Header.jsx](src/Header.jsx))

Top nav bar. Logo (clickable → feed), 4 nav buttons, search bar (currently controlled-input only — no search action wired), user avatar (clickable → own profile).

**Nav items:** Feed, Network, Conversation Rooms, Messages.

The logo is rendered as `<span class="logo-c">C</span>ompound` with a styled `.logo-bar` underline element — this is the recurring brand mark.

### 5.3 `LeftSidebar.jsx` ([src/LeftSidebar.jsx](src/LeftSidebar.jsx))

Three blocks:

1. **Profile mini card** — avatar, name, sector role, sector tag, follower/post counts (both currently `0`).

2. **Folders** — user-defined collections (default seeded: "Saved Companies", "Pipeline", "Research"). `addFolder()` uses `prompt()` for the name and picks a random color from the palette. Counts are placeholders (always 0).

3. **Google Search widget** — *this is the most non-trivial component in the sidebar.* It is **not** real Google search.

   **What it actually does** (LeftSidebar.jsx:20-76):
   - Optimistically attempts a fetch to `googleapis.com/customsearch/v1` with `key=DEMO` (this is intentionally invalid and will fail).
   - The failure is silently swallowed and `generateResults(query)` is called regardless.
   - `generateResults` returns 5 templated cards with reputable-source domains (Reuters, Bloomberg, McKinsey, FT, Wikipedia).
   - For energy-related queries (`wind|solar|energy|hydrogen`) the first two templates are swapped to IEA/BNEF.
   - For mining/commodities (`copper|lithium|mining|steel`) they're swapped to LME/S&P Global.
   - Each result card's `href` is a **real Google search URL** for the query + domain — clicking opens an actual Google search in a new tab.

   **Rationale:** This pattern lets the prototype look like it has a working "Search Google" feature without needing a Google CSE API key during the prototype phase. The results aren't real, but the click destination is, so the UX is honest at the click boundary. Replace `generateResults` with a real CSE/Bing/SerpAPI call when ready.

### 5.4 `Feed.jsx` ([src/Feed.jsx](src/Feed.jsx))

Center column on the home view. Two parts:

1. **Composer** — textarea (500-char limit), action icons (📎 attach, 🎯 sector tag, 💰 mark as opportunity — all decorative for now), char counter, Post button. Adds to the local posts array.

2. **Posts list** — seeded with three posts (Equinor, ArcelorMittal, Trafigura) with realistic industrial copy (offshore wind, green steel, copper recycling).

**Post component** has its own `useState(post.likes)` so each post tracks its own count locally. Comment/share/save buttons render but do nothing.

**Rationale for sample copy:** It's deliberately specific (capacity numbers, project years, MW figures) to communicate the platform's intended density and audience to a viewer in 2 seconds.

### 5.5 `RightSidebar.jsx` ([src/RightSidebar.jsx](src/RightSidebar.jsx))

Three widgets:

1. **Messages preview** — three hardcoded conversation snippets with a "View all" link that calls `onOpenMessages` (switches to Messaging page).
2. **AI Intelligence Feed** — three hardcoded news items (EU hydrogen corridor, Maersk ammonia, NEOM rail). Tagged as "AI Intelligence" but is currently static content.
3. **Collab CTA** — "Start a Collaboration" → calls `onOpenConversationRooms`.

### 5.6 `Network.jsx` ([src/Network.jsx](src/Network.jsx))

Full-page view. Two-column layout: people grid (main) + stats sidebar.

**Main:**
- 12 seeded `PEOPLE` (Elena Voss/Shell, James Chen/Bechtel, Sarah Al-Rashid/DP World, Marcus Lindberg/SSAB, Priya Mehta/BlackRock Infrastructure, Anders Kjaer/Orsted, Thomas Mueller/Siemens Energy, Liu Wei/Rio Tinto, Rachel Okonkwo/BAE Systems, David Park/Honeywell, Ingrid Solheim/Norges Bank, Carlos Rivera/Vale).
- Search bar (filters by name/company/role substring).
- Sector chip filter row — `All` + 9 sector labels.
- Two sections rendered conditionally: **Your Connections** (only if any are connected) + **Suggested for You** (everyone not yet connected, filtered).
- Each card: avatar, name (clickable → profile), role, company, sector tag, mutual count, **Connect** + **View** buttons.
- `toggleConnect(id)` flips `connected` on a person.

**Sidebar:**
- Network stats: connections (live count), pending (3 hardcoded), profile views (847 hardcoded), sector rank (12 hardcoded).
- Trending in your sector — 4 topics (Floating Offshore Wind, Green Hydrogen, Carbon Capture, Critical Minerals).
- Upcoming Events — Energy Transition Summit (Apr 12, London), Industrial Decarbonization Forum (Apr 28, Hamburg).

### 5.7 `Messaging.jsx` ([src/Messaging.jsx](src/Messaging.jsx))

LinkedIn/iMessage-style two-pane chat: conversation list (left) + active chat (right).

**5 seeded conversations** with realistic threaded copy:
1. **Aker BP** — North Sea offshore wind mooring discussion
2. **SiemensX** — Hamburg conference follow-up, 20MW PEM electrolyzer
3. **Terra Firma Capital** — Mozambique LNG due diligence
4. **Vestas Wind Systems** — Baltic Sea 15MW turbine + 25-year O&M
5. **BHP Group** — copper offtake, 30K mt/year

Each conversation has online status, sector tag, and pre-built `messages[]` arrays alternating `from: 'me' | 'them'`.

**Chat UI:** header with voice/video/more buttons (decorative SVGs), message bubbles (sent right-aligned, received left), input row with attach + send.

**Send action:** appends `{from: 'me', text, time: 'now'}` to both `conversations[i].messages` and `activeConvo.messages`, updates `lastMessage` preview. Pressing Enter sends (no Shift+Enter for newline yet).

### 5.8 `ConversationRooms.jsx` ([src/ConversationRooms.jsx](src/ConversationRooms.jsx))

The product's most distinctive feature. Two screens in one component: list view + detail view.

**4 seeded rooms:**

| # | Name | Status | Value | Stage | Participants |
|---|---|---|---|---|---|
| 1 | North Sea Floating Wind — 500MW | active | $1.2B | In Progress | Equinor, Aker BP, Vestas |
| 2 | Green Steel Supply Agreement — SSAB | active | $340M | Review | ArcelorMittal, SSAB |
| 3 | Mozambique LNG Terminal — Phase 2 | active | $2.1B | Getting Started | Terra Firma, BHP |
| 4 | Copper Recycling Offtake — Trafigura | invited | $85M | Getting Started | Trafigura |

Each room carries `participants[]`, `documents[]`, `milestones[]` (4-stage pipeline), and `activity[]` log.

**List view:**
- Header with total count + crude pipeline-value sum in the subtitle.
- "+ New Conversation Room" button toggles an inline create form (name, sector, value) — currently the submit just closes the form (no persistence).
- Filter chips: All / Active / Invited.
- Card grid — each card: sector label, status badge, name, value, milestone progress dots + fill bar, participant avatars, document count, last activity timestamp.

**Detail view (`RoomDetail`):**
- Back button, sector tag, title, value+stage line, Invite + Upload action buttons.
- 4 tabs: **Overview**, **Documents**, **Participants**, **Activity**.
- Overview tab shows milestones (with done/current state via SVG checkmarks vs circles), recent activity, participants list, key documents list.
- Documents tab is a flat list with download buttons.
- Participants tab — full list with Message buttons.
- Activity tab — full activity log.

**Rationale for milestone schema:** Each room defines its own `milestones[]` array of `{label, done, current}`. The current seed data uses neutral defaults (Getting Started → In Progress → Review → Complete), but the schema is intentionally flexible — rooms can supply any sequence of stage labels. This is intentionally open for the prototype but will need consolidation when you wire real persistence (likely converging on a small set of canonical pipelines per room type).

**Pipeline-value calculation** (ConversationRooms.jsx:129) is brittle — it parses string values like `"$1.2B"` by stripping symbols and multiplying by 1000 if it sees `B`. Fragile if a value uses decimals like `$1.25B` (still works, but `$1B500M` style would not). Replace with structured numeric fields when wiring backend.

### 5.9 `Profile.jsx` ([src/Profile.jsx](src/Profile.jsx))

Polymorphic — same component renders **own profile** (`target` is null) and **other profiles** (`target` is a person object).

**Header card:**
- Big avatar, name, headline (editable when own profile), location (editable), sector badge.
- Right side: "Edit Profile" toggle on own; "Connect" + "Message" on others.
- Stats row: connections (142), posts (28), rooms (4), profile views (847) — all hardcoded.

**About section** — bio textarea editable on own profile.

**Tabs:** Activity / Posts / Rooms.

`SAMPLE_ACTIVITY` is shared across all profiles. Posts tab filters to `type === 'post'`. Rooms tab shows 3 hardcoded room cards which navigate to the Conversation Rooms page on click.

**Sidebar:**
- Contact (email, website)
- Expertise tag cloud (6 tags)
- Similar Professionals (3 hardcoded names)

**Edit toggle:** simple `isEditing` boolean swaps inputs/textareas in for static text. Currently "Save" just toggles back; no state is committed beyond the in-component `editData`.

---

## 6. Cross-Cutting Concerns

### 6.1 Avatars

Pattern: 2-letter `initials` + sector-derived `bg` color. Used in profile mini, person cards, message threads, conversation-room participants. No image upload anywhere yet.

### 6.2 Iconography

All icons are **inline SVG**, hand-drawn from Lucide-style stroke paths. No icon library dependency. Trade-off: copy-paste verbosity vs. zero-bundle-cost. If icon variety grows, migrate to `lucide-react` or `heroicons`.

### 6.3 Sample data realism

The seeded copy is deliberately industry-specific: real company names (Equinor, Trafigura, BHP, Vestas, Maersk, ArcelorMittal, etc.), realistic project parameters (500MW, $2.1B, 18-month lead time, 30,000 mt/year), and realistic stages of deal flow. This is the primary thing differentiating the demo from a generic LinkedIn clone — keep this density when adding new sample content.

### 6.4 What persists across navigation vs what doesn't

| Action | Survives navigation? |
|---|---|
| Posting on Feed | Posts array — only while staying in Feed view. App.jsx unmounts Feed when switching pages, so on return the seeded posts are restored. |
| Connecting on Network | Same — Network unmounts on navigation. |
| Sending a message | Same — Messaging unmounts. |
| Editing profile | Same — Profile unmounts. |

This is a known limitation of the current architecture (state lives in leaf components). If interactivity persistence becomes important pre-backend, lift the data into App or a Context.

---

## 7. File-by-File Reference

| Path | Lines | Role |
|---|---|---|
| [package.json](package.json) | 19 | React 19 + Vite 6, three scripts |
| [vite.config.js](vite.config.js) | 9 | React plugin, host:true |
| [index.html](index.html) | 13 | DM Sans + Space Mono, root div |
| [src/main.jsx](src/main.jsx) | 10 | StrictMode wrapper |
| [src/App.jsx](src/App.jsx) | 56 | Root: auth gate + page switch |
| [src/App.css](src/App.css) | 12 | 3-column grid for home |
| [src/index.css](src/index.css) | 63 | Design tokens + reset |
| [src/Auth.jsx](src/Auth.jsx) | 122 | Sign up / sign in |
| [src/Auth.css](src/Auth.css) | 65 | Auth styling |
| [src/Header.jsx](src/Header.jsx) | 51 | Top nav |
| [src/Header.css](src/Header.css) | 43 | — |
| [src/LeftSidebar.jsx](src/LeftSidebar.jsx) | 201 | Profile mini, folders, Google search widget |
| [src/LeftSidebar.css](src/LeftSidebar.css) | 222 | — |
| [src/Feed.jsx](src/Feed.jsx) | 103 | Composer + posts |
| [src/Feed.css](src/Feed.css) | 62 | — |
| [src/RightSidebar.jsx](src/RightSidebar.jsx) | 67 | Messages preview + AI feed + CTA |
| [src/RightSidebar.css](src/RightSidebar.css) | 58 | — |
| [src/Network.jsx](src/Network.jsx) | 190 | People discovery + stats |
| [src/Network.css](src/Network.css) | 253 | — |
| [src/Messaging.jsx](src/Messaging.jsx) | 191 | Conversation list + active chat |
| [src/Messaging.css](src/Messaging.css) | 274 | — |
| [src/ConversationRooms.jsx](src/ConversationRooms.jsx) | 356 | List + detail (4 tabs) |
| [src/ConversationRooms.css](src/ConversationRooms.css) | 366 | — |
| [src/Profile.jsx](src/Profile.jsx) | 243 | Polymorphic own/other profile |
| [src/Profile.css](src/Profile.css) | 248 | — |

**Total:** ~1,800 LoC of JSX, ~1,666 LoC of CSS.

---

## 8. What Is Real vs. What Is Decorative

To save the next developer a half-day of trial-and-error, here's an explicit map of what works:

### Working / interactive
- Auth flow (signup + login → `onLogin` populates user; no validation against a backend)
- Page navigation via Header
- Avatar → own profile
- Feed: post creation
- Feed: per-post like increment
- Network: search filter, sector chip filter, connect toggle, view-profile click
- Messaging: switch conversation, send message, conversation search
- Conversation Rooms: filter (all/active/invited), open room, switch tabs inside a room
- Conversation Rooms: open create-form (does not persist)
- Profile: edit toggle (in-memory only), tab switching, link to Conversation Rooms page
- Left sidebar: add folder via `prompt()`, "Google" search (templated, opens real Google in new tab)

### Decorative / not wired
- Header search input
- Feed composer's attach/sector/opportunity buttons
- Right-sidebar message previews aren't synced with the actual Messaging conversations
- Right-sidebar AI Intelligence Feed (static)
- Messaging: voice/video/more buttons, attach button
- Conversation Rooms: Invite, Upload, Download, Message-from-room buttons
- Conversation Rooms create form: form closes without persisting
- Profile: Connect / Message buttons on others' profiles
- Profile stats numbers (all hardcoded except `connections` count comes from a state in Network that resets on navigation — they don't share state)

---

## 9. Known Limitations & First Things to Fix

1. **No persistence whatsoever.** Reload = full reset. Highest-leverage fix: a localStorage layer behind `user`, `posts`, `connections`, `conversations`, `rooms` so demos survive a refresh.
2. **State doesn't survive navigation.** Posts/connections/messages are scoped to leaf components. Lift to App.jsx or introduce a Context.
3. **Sector style map is duplicated.** The `{bg, sectorColor, sectorText}` triplet is inlined into every seed array. Centralize as `getSectorStyle(sector)`.
4. **Pipeline-value parsing is brittle** ([ConversationRooms.jsx:129](src/ConversationRooms.jsx:129)). Replace string `"$1.2B"` with `{currency, amountUsd}`.
5. **Fake search.** [LeftSidebar.jsx:30](src/LeftSidebar.jsx:30) makes a request that always fails by design. When a real CSE key exists, drop the templated fallback.
6. **No account-type effects on UI past signup.** The `accountType` field is captured but barely used — Profile shows `'Independent'` for individuals; otherwise the whole app treats both identically. Real product behavior will likely diverge significantly between Company and Individual accounts.
7. **No routing.** Direct-linking to `/conversationrooms/3` or sharing a profile URL is impossible. React Router becomes essential before any external sharing.
8. **No error/empty/loading states** beyond the search widget. Consider before any real network calls land.
9. **No accessibility audit.** Buttons are real `<button>`s but several `<a onClick>` handlers exist (Auth's mode switch, conversation-room cards), focus management is untested, color contrast on `--text-muted` against `--bg-card` is borderline.
10. **`prompt()` for folder name** ([LeftSidebar.jsx:86](src/LeftSidebar.jsx:86)) — replace with a proper modal before any user-facing release.
11. **No build/lint config beyond Vite defaults.** No ESLint, Prettier, Husky. Add before the team grows past 1.

---

## 10. Suggested Next Steps (rough)

A reasonable phasing if the goal is to take this from prototype → MVP:

**Phase 1 — make the demo durable (1–2 days)**
- localStorage persistence for user + the four big collections
- Lift state into App.jsx so navigation doesn't reset
- Centralize sector style map

**Phase 2 — real backend (1–2 weeks)**
- Pick a stack (Supabase is the fastest for this kind of CRUD-heavy social app; alternative: Postgres + tRPC + Prisma)
- Schema: users, companies, posts, connections, conversations, messages, conversation_rooms, conversation_room_participants, conversation_room_documents, conversation_room_milestones, conversation_room_activity
- Replace all seeded arrays with fetch hooks
- Real auth (magic link + corporate-domain enforcement on the server)

**Phase 3 — productize**
- React Router with shareable URLs
- File upload (S3 / Supabase Storage) for documents and avatars
- Real-time messaging (Supabase Realtime / Pusher / Ably)
- Replace the templated Google search with a real CSE or a dedicated industrial-news API
- Notifications system
- Search backend (typesense / meilisearch / Postgres FTS)

**Phase 4 — differentiate**
- AI Intelligence Feed actually pulls from sector-specific RSS/news APIs and ranks by user's sector
- Conversation Room AI assistant — summarize uploaded docs, flag missing milestones
- Sector-graph: who's connected to whom across the industrial network

---

## 11. Glossary

- **Compound** — product name; metaphor combines "industrial compound" (chemistry/site) with "compounding" (network/value growth).
- **Conversation Room** — collaborative space tied to a single transaction. Has participants, documents, milestones, activity.
- **Sector** — top-level vertical filter; one of the 10 enums in [Auth.jsx:4](src/Auth.jsx:4).
- **CLINICAL** — internal codename for the dark/teal palette family.
- **CHORDIS** — internal codename for the navy palette family.
- **Sector chip** — pill-style filter button used on Network and elsewhere.
- **Milestone dots** — small circles on a Conversation Room card showing pipeline progress; filled = done, ringed = current.

---

*End of handoff document.*
