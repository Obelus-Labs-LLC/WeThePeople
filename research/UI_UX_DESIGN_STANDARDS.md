# UI/UX Design Standards for Web and Civic Tech Platforms

**Project:** We the People
**Date:** 2026-04-10
**Purpose:** Comprehensive reference for UI/UX design decisions — general web standards first, then civic-specific standards for petition/engagement platforms.

---

## Table of Contents

1. [General Web UI/UX Standards](#1-general-web-uiux-standards)
2. [Civic Tech Platform Standards](#2-civic-tech-platform-standards)
3. [Do's](#3-dos)
4. [Don'ts](#4-donts)
5. [Accessibility Requirements](#5-accessibility-requirements)
6. [Trust and Credibility](#6-trust-and-credibility)
7. [Information Architecture](#7-information-architecture)
8. [Mobile-First Design](#8-mobile-first-design)
9. [Multilingual and Inclusive Design](#9-multilingual-and-inclusive-design)
10. [References](#10-references)

---

## §1 General Web UI/UX Standards

### 1.1 Layout

- **Grid system:** 12-column desktop, 8-column tablet, 4-column mobile.
- **Breakpoints:** 320px (mobile), 480px, 768px (tablet), 1024px (desktop), 1280px (large desktop). Prefer content-driven breakpoints over device-specific.
- **Mobile-first:** design for smallest screen, progressively enhance. This is the industry standard.
- **White space:** reduces cognitive load, improves scanability. Treat it as a structural element, not empty filler.
- **Critical content above the fold:** primary CTAs and key information visible without scrolling.
- **Single-column forms:** reduce eye-jumps and missed fields vs multi-column.
- **Modern CSS:** Grid, Flexbox, `clamp()` for fluid typography, container queries for component-scoped responsiveness.

### 1.2 Typography

| Property | Value |
| --- | --- |
| Body text minimum | 16px (mobile 12-16pt, tablet 15-19pt, desktop 16-20pt) |
| Headings | 20-32px typical |
| Line height (body) | 145-150% of text size |
| Line height (headings) | 1.0-1.35 |
| Optimal line length | 45-90 characters; 66 is the sweet spot |
| Alignment | Left-aligned (constant starting point per line) |
| Font family | Sans-serif (Arial, Helvetica, Roboto) for interface clarity |

Hierarchy: bold headers, medium subheaders, regular body. Size and weight, not decoration, create structure.

USWDS uses a normalized type scale from micro (10px) to token 20 (140px), with role-based font tokens: heading, body, ui, code, alternate. Each typeface is regularized to match the optical size of system fonts (San Francisco, Roboto).

### 1.3 Color

- **Blue = trust:** extensively used in banking, tech, and government for this reason.
- **Never rely on color alone** to convey information (WCAG 1.4.1). Always pair with text, icons, or patterns.
- **Contrast minimums:**
  - Normal text: 4.5:1
  - Large text (14pt bold / 18pt): 3:1
  - UI components and graphics: 3:1
- **USWDS "magic number" contrast system:** 40+ grade difference = AA Large Text; 50+ = AA; 70+ = AAA.
- **Colorblind-safe:** avoid red/green, green/brown, green/blue, blue/gray, blue/purple, green/gray, green/black pairings. 8% of men and ~1% of women have color vision deficiencies.

### 1.4 Navigation

- **Semantic HTML** (`<nav>`, `<header>`, `<main>`) for logical, structured navigation.
- **Consistent order** across all pages (WCAG 3.2.3).
- **Breadcrumbs** near top of page: `Home > Section > Subsection > Current Page`.
- **Mega menus** over nested dropdowns for large sites — users scan many options at once.
- **Search** is essential for content-rich sites.
- **Skip navigation links** to jump past repeated content (WCAG 2.4.1).
- **Large touch targets** on mobile; avoid complex dropdowns or deeply buried menus.

### 1.5 Forms

- **Ask only what you need.** Justify every field or remove it.
- **Labels above fields.** Never use placeholders as the only label — they vanish on input.
- **Labels remain permanently visible** (not just inside the field).
- **Sensible defaults, autocomplete,** and device-appropriate input types (`type="email"`, `type="tel"`, etc.).
- **Split long forms into steps** by topic with accurate progress indicators ("Step 2 of 4").
- **Error messages must identify the problem and suggest corrections** (WCAG 3.3.1, 3.3.3). Not just "invalid input."
- **Critical submissions** (legal, financial) must allow review and reversal (WCAG 3.3.4).
- **Associate labels** with form controls using `<label>` elements.

### 1.6 Calls to Action (CTAs)

- Specific, concise language: 2-5 words starting with a strong action verb.
- High-contrast colors; proportional size relative to surrounding elements.
- Primary CTA above the fold.
- A well-designed CTA button can boost conversion by up to 30%.
- A/B test CTA text, color, placement, and size.

### 1.7 Performance

| Metric | Target |
| --- | --- |
| LCP (Largest Contentful Paint) | < 2.5 s |
| INP (Interaction to Next Paint) | < 200 ms |
| CLS (Cumulative Layout Shift) | < 0.1 |

- Compress images, enable lazy loading, reduce third-party JavaScript.
- Minimize render-blocking CSS and JS.
- Use CDNs for content distribution.
- Mobile users expect speed; reduce pop-ups and bulky scripts.
- Pages must load quickly even on weak connections.

---

## §2 Civic Tech Platform Standards

### 2.1 USWDS Design Principles

The U.S. Web Design System defines 5 principles with specific practical actions:

**1. Start with real user needs.** Engage current and prospective users early. Use qualitative and quantitative research. Test with prototypes. Share findings publicly. Test regularly.

**2. Earn trust.** Clearly identify as government — use `.gov` domains with HTTPS. Add the USWDS official government banner ("An official website of the United States government" with expandable "Here's how you know" section). Review content twice yearly. Write in plain language. Manage data properly. Publish open resources. Work in the open.

**3. Embrace accessibility.** Follow Revised 508 Standards and WCAG 2.1. Test with users of varied abilities. Write accessible content with proper headings and labels. Build accessible designs with proper contrast. Address issues immediately.

**4. Promote continuity.** Consistent identification on every page. Support wide device range. Handle content changes with notice and forwarding. Support multi-session processes — allow exit and resume. Auto-populate forms for repeat visitors.

**5. Listen.** Provide bug/issue reporting. Collect direct feedback via surveys. Implement Digital Analytics Program (DAP). Analyze search data. Publish metrics. Continuous testing with real users.

### 2.2 GOV.UK Design Principles

11 principles from the UK Government Digital Service:

1. **Start with user needs** — not government needs.
2. **Do less** — government should only do what only government can do.
3. **Design with data** — not hunches or guesswork.
4. **Do the hard work to make it simple** — complexity is the design team's problem, not the user's.
5. **Iterate, then iterate again** — release MVPs early, progress through alpha/beta.
6. **This is for everyone** — accessible design is good design. Design for those most dependent on services first.
7. **Understand context** — design for people, not screens. Consider libraries, mobile devices, varying digital literacy.
8. **Build digital services, not websites** — address user objectives holistically.
9. **Be consistent, not uniform** — same language and patterns where possible, flexibility where needed.
10. **Make things open: it makes things better** — share code, designs, ideas, and failures.
11. **Minimize environmental impact.**

### 2.3 Code for America Principles

- Use plain, inviting language.
- Help text that clarifies questions at key moments.
- Screens that explain processes in steps so people feel informed and welcomed.
- Recognize impacted communities as most valuable advisors and decision-makers.
- Understand policy, historical context, and traditional bureaucratic processes to create thoughtful improvements.
- Combine human-centered design, efficiency, and better services.

### 2.4 U.S. Digital Services Playbook (13 Plays)

Understand user needs. Address entire user experience. Prioritize simplicity. Use agile practices. Align budgets and contracts. Appoint accountable leaders. Assemble experienced teams. Adopt modern technology stacks. Deploy in flexible hosting environments. Automate testing and deployments. Manage security and privacy. Leverage data-driven decisions. Default to openness.

### 2.5 Petition Platform-Specific Patterns

These patterns directly apply to We the People:

- **Live progress bars** updating with each signature. Progress thermometers measurably increase participation.
- **Social proof:** showing that others have contributed motivates new participants.
- **Urgency:** time-bound petitions gain more traction than evergreen ones.
- **Clean design + clear CTA + simple signature process** outperform generic forms.
- **Dynamic signature count** displays showing proximity to goal.
- **Real-time updates at key milestones.**
- **Change.org's recommender system** achieved a 30% increase in petition signature rates globally through personalization.
- **Emotional mapping and sentiment analysis** can improve engagement further.

### 2.6 Federal Website Requirements

The federal checklist covers 11 categories: Accessibility, Analytics, Content, Customer Experience, Design, Governance, Privacy, Search, Security, Software Engineering, Trust. Over 100 laws, regulations, and policies impact federal websites.

---

## §3 Do's

1. **Start with user research.** Engage diverse users from the beginning; use qualitative and quantitative methods. *Real needs drive product decisions, not assumptions.*

2. **Use plain language.** Replace legal jargon with accessible terminology. Simplifying web language improves success rates by over 124% (Nielsen Norman Group), especially for users with lower reading levels.

3. **Design mobile-first.** 58% of U.S. government web traffic is from mobile devices (up from 13% in 2013). The majority of civic engagement now happens on phones.

4. **Use consistent navigation patterns.** Same order, same labels across all pages. Familiarity reduces cognitive load and builds trust.

5. **Provide multiple ways to reach content.** Search, navigation, sitemap, breadcrumbs (WCAG 2.4.5). Different users navigate differently.

6. **Clearly identify as an official site.** Use `.gov` domains, HTTPS, official government banner. 88% of residents trust government more if its website is easy to navigate on mobile.

7. **Show progress in multi-step processes.** "Step 2 of 4" — not vague percentages. Clear progress reduces abandonment.

8. **Support multi-session processes.** Allow users to save and resume later. Civic tasks (petitions, applications, registration) are often interrupted.

9. **Test with assistive technologies.** Screen readers, keyboard-only, voice control. Automated tools catch only 20-40% of accessibility issues; manual testing is essential.

10. **Audit content regularly.** At least twice yearly for accuracy. Outdated content erodes trust.

11. **Use semantic HTML first, ARIA to fill gaps.** `<button>`, `<nav>`, `<header>`, `<form>`. Proper semantics are the foundation of accessibility.

12. **Display real contact information.** Phone, email, physical address. Stanford credibility research (4,500+ participant study) shows this significantly builds trust.

13. **Provide error messages that suggest corrections.** Not just "invalid input." WCAG 3.3.3 requires it, and it dramatically improves task completion.

14. **Use progress bars and social proof on petition platforms.** Dynamic signature counts, milestone notifications. Proven to increase participation.

15. **Convert legacy PDFs to HTML.** Especially frequently accessed documents. Scanned PDFs are invisible to screen readers; PDF proliferation is the #1 government accessibility problem.

---

## §4 Don'ts

1. **Don't rely on color alone** to convey information. 8% of men are colorblind; WCAG 1.4.1 prohibits it.

2. **Don't use placeholder text as the only label** for form fields. Placeholders disappear on input, leaving users confused about what was requested.

3. **Don't use "Read More" or "Click Here" as link text.** Screen reader users often review links out of context in lists; generic text is meaningless.

4. **Don't skip heading levels** (e.g., h1 directly to h3). Screen readers use heading hierarchy for page structure navigation.

5. **Don't create keyboard traps.** Every component must be navigable into and out of (WCAG 2.1.2). Keyboard-only users will be stuck.

6. **Don't use hover-only interactions** on mobile. Touch devices have no hover state; menus dependent on hover are inaccessible.

7. **Don't auto-play audio or video** without controls. WCAG 1.4.2. Unexpected audio disorients screen reader users and is disruptive in public spaces.

8. **Don't use pop-ups without proper focus management.** Modals without focus trapping disorient keyboard and screen reader users.

9. **Don't treat accessibility as an afterthought.** Retrofitting is 10x more expensive than building in from the start. Civic platforms often have legal mandates.

10. **Don't use complex, legalistic language** in civic interfaces. It confuses users and erodes trust. The Plain Writing Act of 2010 legally requires clear government communication.

11. **Don't trigger unexpected context changes on focus or input** (WCAG 3.2.1, 3.2.2). Users should control when pages navigate or forms submit.

12. **Don't rely solely on automated accessibility testing.** Automated scanners catch only 20-40% of issues; the most impactful barriers require human review.

13. **Don't use excessive advertising or promotional content** on civic sites. Stanford credibility research shows ads significantly reduce perceived trustworthiness.

14. **Don't ignore broken links.** Link rot significantly harms credibility (Stanford guideline #10); errors of all types damage trust.

15. **Don't lock orientation.** Content must function in both portrait and landscape (WCAG 1.3.4).

---

## §5 Accessibility Requirements

### 5.1 Legal Framework

| Law / Standard | Scope | Requirement |
| --- | --- | --- |
| **Section 508** (Rehabilitation Act) | Federal agencies and contractors | WCAG 2.0 Level AA |
| **ADA Title II** | State and local governments | WCAG 2.1 AA. Deadlines: agencies ≥50K persons by April 24, 2026; <50K by April 26, 2027 |
| **Plain Writing Act of 2010** | Federal agencies | Clear communication the public can understand and use |
| **21st Century IDEA** | Federal websites | Modern, consistent, mobile-friendly, fully functional |

4,500+ web accessibility lawsuits were filed in 2023. 96.3% of top million homepages failed ADA standards in 2023. Government forms (voter registration, tax, licensing) are the #1 lawsuit target.

### 5.2 WCAG 2.1 AA — Key Success Criteria

**Perceivable:**
- 1.1.1 Text alternatives for all non-text content
- 1.2.2 Synchronized captions for video with audio
- 1.2.5 Audio description for pre-recorded video
- 1.3.1 Visual structure programmatically determinable (headings, lists, tables use proper HTML)
- 1.3.4 Content works in both portrait and landscape
- 1.3.5 Form fields have autocomplete attributes for known data
- 1.4.1 Color not sole means of conveying information
- 1.4.3 Contrast minimum: 4.5:1 text, 3:1 large text
- 1.4.10 Content reflows at 320px without horizontal scrolling
- 1.4.11 UI components and graphics: 3:1 contrast
- 1.4.12 Readable with increased line/letter/word spacing
- 1.4.13 Hover/focus content dismissible and persistent

**Operable:**
- 2.1.1 All functionality via keyboard alone
- 2.1.2 No keyboard traps
- 2.2.1 Time limits pausable/adjustable/extendable
- 2.4.1 Skip navigation links
- 2.4.3 Logical tab/focus order
- 2.4.5 Multiple ways to reach content (navigation + search + sitemap)
- 2.4.7 Keyboard focus indicator clearly visible
- 2.5.1 Multi-finger gestures have single-pointer alternatives

**Understandable:**
- 3.1.1 HTML `lang` attribute declares page language
- 3.1.2 Content in different languages marked with `lang`
- 3.2.1 No unexpected context changes on focus
- 3.2.3 Consistent navigation order across pages
- 3.3.1 Errors identified textually
- 3.3.3 Error messages provide correction guidance
- 3.3.4 Critical submissions allow review and reversal

**Robust:**
- 4.1.2 Components have programmatic name, role, and state
- 4.1.3 Dynamic status updates via ARIA live regions

### 5.3 WCAG 2.2 Additions (Published October 2023)

Key new criteria at AA:
- **Focus Not Obscured** — focused element must remain at least partially visible
- **Focus Appearance** — focus indicator must be sufficiently visible
- **Dragging Movements** — drag operations have single-pointer alternatives
- **Target Size (Minimum)** — touch targets at least 24x24 CSS pixels
- **Consistent Help** — help mechanisms in consistent location across pages
- **Redundant Entry** — previously entered info auto-populated or selectable
- **Accessible Authentication** — no cognitive function tests (CAPTCHAs) required for login

### 5.4 Civic-Specific Accessibility Concerns

- Legacy PDF documents are the **biggest accessibility problem** in government sites. Convert to HTML.
- Automated tools catch only 20-40% of issues. Manual testing with real assistive technology is required.
- 2.2 billion people globally have visual impairments; 84% of popular homepages have low-contrast text.

---

## §6 Trust and Credibility

### 6.1 Stanford Web Credibility Guidelines

From a study of 4,500+ participants — the 10 factors that most influence perceived credibility:

1. **Make it easy to verify information accuracy.** Third-party citations, references, source materials with direct links.
2. **Show a real organization behind the site.** Physical address, office photos, membership documentation.
3. **Highlight expertise.** Team qualifications, contributor authority, respected affiliations. Avoid linking to non-credible sites.
4. **Show trustworthy people.** Real employee names, photographs, personal details in staff bios.
5. **Make it easy to contact you.** Phone numbers, physical addresses, email addresses prominently displayed.
6. **Professional visual design.** Nearly half of consumers assess credibility based on visual design (layout, typography, color). Users form opinions in as little as **0.05 seconds**.
7. **Make the site easy to use and useful.** Prioritize UX over flashy technology.
8. **Update content often.** Regular updates or review dates signal active maintenance.
9. **Use restraint with promotional content.** Minimize ads; separate sponsored from editorial; no pop-ups; clear, direct, sincere writing.
10. **Avoid errors of all types.** Typos and broken links significantly harm credibility.

### 6.2 Civic-Specific Trust Signals

- **`.gov` domain with HTTPS** — the most fundamental trust indicator for government sites.
- **Official government banner** — the USWDS banner component ("An official website of the United States government" with "Here's how you know" expandable section).
- **Lock icon + HTTPS explanation** in the banner.
- **Consistent styling** across related digital services.
- **Transparent processes** — clear step information in multi-step flows.
- **Data protection statements** — coordinate with agency records and privacy officials.
- **Open source and open data** — share source code and datasets when appropriate.
- **88% of residents** trust local government more if its website is easy to navigate on mobile.

### 6.3 Academic Research Findings

An empirical study (IJRSI) found that user-centric, accessible design produces statistically significant improvements in:
- Task success rates (p<.01)
- Time-on-task reduction (p<.001)
- Perceived trust increase (p<.001)

Key finding: "deliberate investment in user-centric and accessible design is not merely an aesthetic choice but a crucial mechanism" for strengthening citizen-government relationships.

### 6.4 Trust Complexity Warning

ACM CHI 2021 paper "Designing Civic Technology with Trust" (Corbett, NYU) warns: trust cannot be treated as a linear value to optimize. Misplaced trust can legitimize institutions perpetuating injustice. In civic contexts, trust is manifested in everyday interactions and relationships between stakeholders, not just through technology. Design for appropriate, informed trust — not blind trust.

---

## §7 Information Architecture

### 7.1 Plain Language Requirements

- **Plain Writing Act of 2010:** requires federal agencies to use clear communication the public can understand.
- **Clear and Concise Content Act of 2022:** further strengthens plain language mandates.
- Simplifying web language improves success rates by over 124% (NNGroup).

### 7.2 Eight Guidelines for Plain Language in IA

1. **Know your audience.** Demographics, profession, cultural background, digital literacy.
2. **Organize information strategically.** Tables of contents, numbered pages, bulleted lists, clear headings, visual charts. Bookend with introductions and summaries.
3. **Select words deliberately.** Replace jargon with specific actions. "Close the loop" → "I'll schedule 30 minutes tomorrow to review final edits."
4. **Be concise yet clear.** Eliminate redundancy but prioritize clarity over brevity.
5. **Write conversationally.** Contractions, active voice, familiar vocabulary.
6. **Design for readability.** Avoid distracting visual elements, incompatible fonts, irrelevant imagery.
7. **Apply web standards.** Avoid embedded PDFs. Use descriptive alt text. Place information where users expect it.
8. **Test with real users.** Usability testing or paraphrase testing to confirm understanding.

### 7.3 Civic-Specific IA

- **Structure around tasks, not org charts.** Organize by what residents need to do, not by which department handles it.
- **Surface common service requests** prominently.
- **Consistent navigation labels** across services.
- **Progress indicators** for multi-step tasks.
- **Replace legal jargon** with accessible terminology.
- **Bold headlines or larger font size** as organizational markers.
- **Short sentences, clear headings, bullet points.**
- **Explain specialized terms** when unavoidable.

---

## §8 Mobile-First Design

### 8.1 The Numbers

- U.S. government mobile web traffic: ~13% in 2013 → **~58% in 2023**.
- 88% of residents trust local government more when its website works well on mobile.
- Poor mobile design erodes trust in government systems and reduces civic engagement.

### 8.2 Requirements

- **Responsive design:** automatically adjusts to any screen size, no zooming or horizontal scrolling.
- **Content reflow at 320px width** without horizontal scrolling (WCAG 1.4.10).
- **Both portrait and landscape** must work (WCAG 1.3.4).
- **Touch targets:** at least 24x24 CSS pixels (WCAG 2.2), ideally 44x44px.
- **High-contrast colors** for improved visibility on small screens.
- **Buttons and links** large enough for easy tapping.
- **No hover-only menus** (they don't function on touch devices).
- **Avoid complex dropdown structures.**

### 8.3 Content Optimization

- Keep headlines brief and direct.
- Use white space to separate sections.
- Position critical information near the top.
- Minimize form fields and steps.
- Compress images, limit pop-ups, reduce bulky scripts.
- Pages must load quickly even on weak connections.

### 8.4 Grid

| Device | Columns |
| --- | --- |
| Mobile | 4 |
| Tablet | 8 |
| Desktop | 12 |

Use content-driven breakpoints. Modern approach: fluidity and adaptability over rigid breakpoints.

### 8.5 Testing

- Test on real mobile devices, not just emulators.
- Complete tasks as residents would to identify friction points.
- Monitor exit rates on underperforming pages.
- Collect user feedback through brief surveys.

---

## §9 Multilingual and Inclusive Design

### 9.1 Principles

- **Co-design** must intentionally engage diverse user groups from the outset.
- Interfaces must be shaped by a broad range of linguistic abilities, cultural contexts, and accessibility needs.
- Research must include non-native English speakers for both English and translated versions.
- Design for the entire nation, including those less comfortable with digital tools.
- Those most dependent on services often face the greatest usability challenges — **design with them foremost in mind** (GOV.UK Principle #6).

### 9.2 Translation Best Practices

- Convene translation panels: at least two speakers of each target language.
- Translate materials, then **back-translate to English** to check accuracy.
- Evaluate content availability, translation quality, and message clarity early.
- Use `lang` attributes to mark content in different languages (WCAG 3.1.2).
- Declare default page language via HTML `lang` attribute (WCAG 3.1.1).

### 9.3 Design for Varied Digital Literacy

- Consider diverse environments: libraries, mobile devices, social media, varying tech familiarity.
- Account for users on older devices and low-bandwidth networks.
- Test across real devices, tablets, and low-bandwidth connections.
- Clear language reduces confusion across multilingual populations.
- Use universal icons where possible to transcend language barriers.

### 9.4 Resources

- USWDS provides multilingual support and language access resources.
- Digital.gov offers communities of practice for building accessible and multilingual products.
- Center for Civic Design provides civic icons, images, and language access support tools.

---

## §10 References

### Design Systems and Frameworks

- **USWDS Design Principles** — designsystem.digital.gov/design-principles/
- **USWDS Typography** — designsystem.digital.gov/components/typography/
- **USWDS Color System** — designsystem.digital.gov/design-tokens/color/overview/
- **GOV.UK Design System** — design-system.service.gov.uk/
- **GOV.UK Government Design Principles** — gov.uk/guidance/government-design-principles
- **Code for America Design Principles** — codeforamerica.org/news/design-principles-that-put-people-at-the-center/
- **Code for America Style Guide** — style.codeforamerica.org/
- **U.S. Digital Services Playbook** — playbook.usds.gov/

### Accessibility Standards

- **WCAG 2.1** — w3.org/TR/WCAG21/ (78 success criteria)
- **WCAG 2.2** — w3.org/TR/WCAG22/ (86 success criteria, published Oct 2023)
- **What's New in WCAG 2.2** — w3.org/WAI/standards-guidelines/wcag/new-in-22/
- **Section508.gov** — federal accessibility requirements
- **Section 508 + USWDS** — section508.gov/develop/accessible-design-using-uswds/
- **10 Digital Accessibility Mistakes to Avoid** — accessibility.blog.gov.uk/2025/02/04/10-digital-accessibility-mistakes-to-avoid/
- **Web Accessibility in Government** — lullabot.com/articles/web-accessibility-government-common-misses-and-practical-fixes

### Credibility and Trust Research

- **Stanford Web Credibility Guidelines** — credibility.stanford.edu/guidelines/index.html (4,500+ participant study)
- **Designing Civic Technology with Trust** — ACM CHI 2021 (Corbett, NYU)
- **Impact of UI/UX Design on User Trust in Civic Tech** — IJRSI (rsisinternational.org)
- **Building Citizen Trust Through E-Government** — ScienceDirect

### Civic Design Organizations

- **Center for Civic Design** — civicdesign.org/ (plain language, information design, civic research)
- **Civic Design Systems: Ultimate Guide** — maxiomtech.com/accessible-ux-civic-design-systems/

### Government Requirements

- **Federal Website Requirements Checklist** — digital.gov/resources/checklist-of-requirements-for-federal-digital-services/ (11 categories, 100+ laws)
- **USWDS Website Standards** — designsystem.digital.gov/website-standards/
- **U.S. Access Board Revised 508 Standards** — access-board.gov/ict/
- **Plain Language Guide** — digital.gov/guides/plain-language

### Contrast and Color Tools

- WebAIM Contrast Checker
- Color Contrast Analyzer (CCA) desktop app
- Colorblindly Chrome extension
- Stark plugin for Sketch/Figma/Adobe XD
- USWDS contrast grid system

### Nielsen Norman Group

- Breadcrumbs: 11 Design Guidelines — nngroup.com/articles/breadcrumbs/
- Standards & Conventions — nngroup.com/topic/standards-conventions/
- Finding: simplifying web language improves success rates by over 124%
