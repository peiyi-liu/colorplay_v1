# Teacher Tactical Observatory UI Optimization

Status: Phase A closed; all six page directions owner-approved
Date: 2026-08-14
Implementation status: not started

## 1. Design Read and scope

「教師日常使用的教學決策工作台，延續深藍 JRPG 戰術觀測台語言，但資訊判讀與操作效率優先於沉浸感。」

- `DESIGN_VARIANCE: 5`
- `MOTION_INTENSITY: 3`
- `VISUAL_DENSITY: 6`
- Redesign mode: targeted evolution with moderate recomposition. Routes, existing handlers, permissions and operation semantics stay unchanged. The only approved Phase B data-contract expansion is the dedicated classroom-owner-only correct-answer projection defined in section 7.1.
- The `design-taste-frontend` skill explicitly excludes dashboards and data tables. This proposal therefore applies only its redesign audit, hierarchy, density, material, responsive, motion and accessibility guardrails. Landing-page patterns are excluded.
- No new design system, package, charting dependency or generated fixture is proposed.

### 1.1 Owner decisions recorded on 2026-08-14

| Page | Owner status | Decision now binding Phase B |
| --- | --- | --- |
| 教學分析 | approved | Preserve family A tactical-observatory direction. |
| 班級管理 | approved | Preserve direct class-name input and create action; no persistent visible label is required. |
| 進入班級 | approved | Preserve composition with the formal `activeBlookId` asset guardrail in section 4.3. |
| 查看學生細節 | approved | Summary is limited to four named server-backed fields; the revised desktop/mobile directions supersede the prior pair. |
| 題目分析 | approved | Preserve correct-answer marking, but render it only after the dedicated owner-only server projection exists. |
| Live 課程報表 | approved | Preserve family C composition and use only the derivations defined in section 4.6. |

These approvals are design decisions, not authorization to start Phase B implementation.

## 2. Grounded inventory

### 2.1 Confirmed facts

| Page | Production route | Page component | Direct page CSS | Harness scenario |
| --- | --- | --- | --- | --- |
| 教學分析 | `/teacher` | `src/features/teacher-content/pages/teacher-analytics-page.tsx` | `teacher-analytics.css`, `teacher-analytics-data.css`, `teacher-analytics-mobile.css` | `analytics` |
| 班級管理 | `/teacher/classes` | `src/features/classrooms/pages/teacher-classrooms-page.tsx` | `teacher-classrooms-workspace.css` | `classes` |
| 進入班級 | `/teacher/classes/:classroomId` | `src/features/classrooms/pages/teacher-classroom-detail-page.tsx` | `teacher-classrooms-workspace.css` | `classroom-detail` |
| 查看學生細節 | `/teacher/classes/:classroomId/members/:memberRef` | `src/features/classrooms/pages/teacher-student-progress-page.tsx` | `teacher-classrooms-workspace.css` | `student-progress` |
| 題目分析 | `/teacher/questions` | `src/features/teacher-content/pages/teacher-question-analysis-page.tsx` | analytics CSS trio | `questions` |
| Live 課程報表 | `/teacher/live/:sessionId/report` | `src/features/live/pages/teacher-live-report-page.tsx` | `teacher-live-report-page.css` | `live-report` |

All six pages use `AuthenticatedTeacherMenu` and `TeacherWorkSurface`. `TeacherMenu` owns identity, avatar upload, the three teacher destinations and sign-out confirmation. `TeacherWorkSurface` owns the common title, optional eyebrow/subtitle/toolbar and loading, empty, error, retry or content state. The shared surface CSS is `teacher-workspace.css` and `teacher-workspace-mobile.css`.

The six harness states were observed at 1280x900 and 393x852 from the active server on port 4177. Both listeners use this worktree as cwd. These screenshots were design inputs only, not phase-gate evidence.

### 2.2 Component boundary

Shared boundary:

- `TeacherMenu` and `AuthenticatedTeacherMenu`: persistent teacher identity, navigation and sign-out.
- `TeacherWorkSurface`: page scene header, work canvas and complete state boundary.
- Existing `ui-table`, `Chip`, links, buttons, inputs and disclosure semantics remain the accessible primitives.
- Teacher-local tokens belong inside the teacher module. Global tokens, Tailwind setup and router are outside Phase B ownership.

Page-local boundary:

- Analytics owns filters, class overview, assessment-source choice, question insight and recent Live sessions.
- Classes owns create-class operation and class roster.
- Classroom detail owns class identity and member roster.
- Student progress owns student identity, summary facts and chapter progress.
- Question analysis owns chapter and subtopic grouping, error ranking and question-content disclosure.
- Live report owns session summary, question analysis, answer matrix, CSV export and ranking.

### 2.3 Design inference

- The existing IA and server-backed content are viable. The redesign should change composition and CSS rather than domain behavior.
- Scene images have enough product recognition to retain, but must stop at the page header. Extending the scene under data lowers reading contrast and makes empty space look accidental.
- The current border and card treatment gives filters, summaries and detail tables nearly equal weight. Fewer containers will improve scan speed without deleting information.

### 2.4 Still requires verification in Phase B

- Exact contrast ratios must be measured against implemented final tokens, not against generated direction images.
- Long real-world labels, classroom names, prompts and response matrices need browser fixtures or production-like local data beyond the single harness row.
- Focus order and sticky-layer overlap must be rechecked after layout implementation.
- Real mobile device behavior remains an owner phase-gate task; the 393px compositions here are browser design targets.
- The correct-answer UI remains gated on the dedicated server-authoritative typed projection in section 7.1; the existing answer-free payload cannot authorize or infer a correct state.

## 3. Shared visual contract

### 3.1 Color roles

- Page foundation: deep navy, never pure black. Suggested role range: page `#030a14`, canvas `#061321`, raised work row `#0a2035`.
- Navigation and selected state: cobalt/electric blue. Use a solid edge or fill plus text/icon, never color alone.
- Data emphasis: bright but not fluorescent blue. Numerals use tabular figures.
- Gold: only the highest-priority operation or a genuinely important teaching signal. Join codes may use restrained gold text because they are copy targets, not status.
- Green, red and orange: semantic state only, always paired with a label or icon.
- Text: off-white primary, blue-gray secondary. No gray text below WCAG 2.2 AA in final implementation.

### 3.2 Typography

Use the existing Traditional Chinese stack. No new font dependency.

| Role | Desktop | Mobile | Rule |
| --- | --- | --- | --- |
| Page title | 40-44 / 1.15, 900 | 28-32 / 1.2, 900 | One or two lines, no ellipsis |
| Section title | 20-22 / 1.35, 800 | 18-20 / 1.4, 800 | Plain functional title |
| Metric | 28-36 / 1.1, 900 | 24-30 / 1.1, 900 | `tabular-nums` |
| Body / table | 16 / 1.55 | 16 / 1.6 | Mobile never below 16px |
| Metadata | 13-14 / 1.5 | 13-14 / 1.5 | Not for essential instructions |

### 3.3 Spacing, radius, borders and shadow

- 8px visual rhythm with 4px half-step. Content gaps: 8, 12, 16, 24, 32 and 40.
- Control radius 6px, work group 8px, scene header 0px. Pills remain limited to short status labels.
- Default work grouping uses spacing and one divider. A full box is reserved for a bounded interaction, disclosure, matrix or elevated summary.
- Border: one-pixel blue-gray. Avoid border plus outline plus inset shadow on the same surface.
- Shadow: only TeacherMenu, sticky mobile bars, modal/dropdown and the page-header transition may have a subtle navy-tinted shadow.
- Layer contract: canvas 0, scene/header 1, sticky menu/bars 20, dropdown 40, dialog 60, toast 70.

### 3.4 Scene and work canvas

- The JRPG command-room scene occupies only the page header: about 164-200px desktop and 116-180px mobile depending on title/toolbar needs.
- Title, subtitle and back action sit on a dark scrim with AA contrast.
- The data area begins on a quiet near-solid navy canvas. No `background-size: cover` across the entire page.
- Generated scene content is decorative and uses empty alt text in implementation. Product text remains semantic DOM.

### 3.5 Tables and disclosure rows

- Desktop tables use a single header band, sparse row separators, left-aligned labels and tabular numerals. Row hover and keyboard focus share the same location cue.
- At 393px, general tables become summary disclosure rows. The summary contains identity plus the most decision-relevant value; expanded content preserves the remaining fields and actions.
- The Live answer matrix is the sole justified matrix. It keeps a bounded horizontal scroll region, an obvious edge cue and a sticky first column where feasible. It never expands the document width.
- Charts, if added later from existing typed data, require a text summary or table alternative. This Phase A proposal adds no chart.

### 3.6 Button hierarchy and states

- Primary: one high-priority operation per group, gold only where the action is truly primary (for example, 建立班級).
- Selected/navigation: cobalt fill with text and icon.
- Secondary: dark navy with blue border.
- Tertiary: text action with underline or directional icon; minimum hit area remains 44x44.
- Disabled retains label and visible boundary, plus nearby reason where needed. Loading uses stable button width. Error is contextual; retry remains next to the failed region.

### 3.7 Motion

- `MOTION_INTENSITY 3`: no automatic entrance, float, glow, parallax or scroll hijack.
- Hover, active, focus and disclosure transitions only. Transform/opacity, 120-200ms.
- `prefers-reduced-motion` makes disclosure and state transitions instant.

### 3.8 Responsive contract

- Desktop: fixed 240px TeacherMenu, content max 1280px, 24-32px canvas insets.
- Tablet: filters and summaries may use two columns; title/toolbars wrap as semantic groups.
- Mobile: fixed 72px top identity bar and 72px bottom navigation with safe-area offsets. Page content reserves both bars.
- 393px has no page-level horizontal overflow. Action groups stack or use two columns only when every target stays at least 44px.
- Loading skeletons match final composition. Empty and error messages remain inside the affected group rather than replacing the persistent menu and page identity.

## 4. Six-page audit and proposal

### 4.1 教學分析, family A

Current audit:

- The first screen contains the required filter and three class-level conclusions, but filters occupy too much height on mobile and the actionable conclusion competes with equal-weight panels.
- Desktop section framing is consistent but repetitive. `ClassroomOverview`, `QuestionInsight` and `LiveHistory` look like siblings even though they answer different decision levels.
- Mobile has good Live disclosure rows, but the class overview becomes a long vertical stack and the fixed bottom navigation overlaps the visual rhythm.

Proposal:

- Preserve all four filter fields in one collapsible operation deck. Collapse by default on mobile after the teacher has a valid selection summary.
- Make the class conclusion a plain three-part decision strip, with the weak subtopic as the textual conclusion rather than a decorative tile.
- Keep source selection adjacent to question analysis. Desktop uses question analysis as the larger column and recent Live sessions as the supporting column. Mobile uses sequential disclosure summaries.
- Preserve loading, empty and error per query region. Do not replace missing values with zero.

### 4.2 班級管理, family B

Current audit:

- The first screen clearly exposes class creation, but the white form island breaks the visual system and the class item floats as a large card.
- Desktop class data is under-dense. A two-column card grid gives repeated information more space than it needs.
- Mobile class actions are visible, but join code wrapping and a large expanded card make scanning multiple classes slow.

Proposal:

- Keep summary counts and class creation at the top. Treat creation as one bounded operation strip with direct class-name input and one gold primary button. A persistent visual label is not required, but the input must have a stable programmatic name such as `aria-label="新班級名稱"`; placeholder text is only a visual hint.
- Desktop changes class cards into a compact roster with name, active students, join code, creation date and two actions.
- Mobile uses classroom disclosure rows. Class name and student count remain visible; join code and actions appear on expansion.
- Pending creation keeps the button width and label. Field error stays below the input; pending and disabled remain distinct; every control remains at least 44x44. The list empty state explains that no class exists without a fake zero card.

### 4.3 進入班級, family B

Current audit:

- Desktop first screen identifies the class, but duplicates class name in the scene header and panel header. A one-row table occupies a wide floating container.
- Mobile still presents four table columns, producing narrow broken words and a poor reading order.
- The back action has weak contrast in the observed harness state. The join-code badges look more prominent than the member task.

Proposal:

- Merge class identity, member count and join code into one compact identity strip under the header. Keep back action in the header toolbar.
- Desktop roster uses a single full-width table without a surrounding decorative card.
- Mobile member summary is name + school id + status. Expansion reveals nickname and the full-width 查看細節 action.
- Inactive state uses label plus neutral icon, not color alone. Error keeps the existing retry handler.
- Student imagery is optional and may only resolve through the existing `activeBlookId` and formal asset mapping. If that asset is unavailable to this slice, omit the image. Do not add avatar URLs, initials fields, static student portraits or placeholder silhouettes.
- `membershipStatus` is membership eligibility only: `active` or `inactive`. It is not presence, activity or connectivity. Phase B may label inactive members「已停用」and either omit the active badge or label it「有效」; it must not translate either value to「學習中」、「離線」or any online/presence state.

### 4.4 查看學生細節, family B

Current audit:

- Desktop places useful four-metric summary first, but all metrics have the same weight and the chapter row leaves a large empty field beneath it.
- Mobile keeps a desktop table. Headers become vertical fragments and content is partially hidden behind the fixed navigation.
- The current average accuracy breakdown is valuable but too long for a single mobile cell.

Proposal:

- Keep identity in the scene header. The summary contains exactly `classRank`, `classXp`, `avgAccuracy` and `unfinishedMistakeCount / totalMistakeCount`.
- Desktop table makes combined accuracy the main value and the section/chapter/Live breakdown secondary text in the same cell.
- Mobile chapter rows show chapter, status and combined accuracy in the summary. Expansion shows review completion and the three source accuracies.
- Do not derive class population, percentile, performance grade or remediation severity. Remove subjective copy such as「前 7%」and「表現良好」. Preserve inactive-member notice, existing server-backed state labels and honest null placeholders such as an em dash.

### 4.5 題目分析, family B

Current audit:

- The initial collapsed state contains only one thin subtopic row inside a large outlined region, so content appears unfinished even though the hierarchy is valid.
- Desktop lacks visible classroom context and the chapter container adds another equal-weight border.
- Mobile collapsed state is readable, but does not demonstrate the intended question-level density until expanded.

Proposal:

- Treat chapter title as an unboxed navigation heading. Subtopics become compact disclosure bars with question count only if that count already exists in the loaded rows.
- Expanded desktop table preserves current order, stable code, prompt, error rate and 查看. Question options stay in an inline expansion under the triggering row. Once the section 7.1 server slice is complete, the correct option receives explicit text/icon and correct-answer state; color is supplemental only.
- Mobile question summaries show order/code, error rate and prompt. A 44px 查看/收合 control owns `aria-expanded`; options appear below.
- Keep this route limited to existing `section_quiz` data. Do not add the analytics source tabs here.
- The existing answer-free payload remains answer-free. Until the dedicated projection is available, the UI must omit correct-answer marking and must not infer it from option order, color, fixtures or client logic.

### 4.6 Live 課程報表, family C

Current audit:

- The current first screen starts with detailed question rows and postpones ranking. It does not answer the fastest debrief questions: participation, overall performance, hardest question and leaders.
- Mobile compresses the six-column question table, causing word-by-word wrapping. The matrix is correctly recognized as horizontally scrollable, but its boundary and export relationship are weak.
- Three equal panels make question analysis, matrix and final ranking appear equally urgent.

Proposal:

- Compose the first screen from the loaded report object using only these contracts: participant count is `report.participants.length`; overall accuracy is `sum(correct) / sum(answered)` from existing aggregates and is omitted when the denominator is zero; hardest question is the minimum existing non-null `correctRate`; top three are taken from `report.ranking` by its authoritative rank and are not recomputed from another field.
- Desktop follows with question analysis, then answer matrix and export. Remaining final ranking stays below.
- Mobile shows the top three as a stepped podium: first in the center and highest, second left and lower, third right and lowest, with a shared baseline. Names and scores remain text.
- Question rows become disclosures. The answer matrix alone keeps bounded horizontal scrolling; CSV stays in the matrix operation group.
- Missing data omits the affected summary. It never displays a fake zero and never justifies a new backend field. Ties for hardest question keep the report's existing question order rather than invent a secondary metric.

## 5. Accessibility pre-flight

- DOM and focus order follow the visual order: title, toolbar/back, page operation, summary, details.
- Every control and disclosure summary has a 44x44 minimum target.
- `:focus-visible` uses a solid cobalt ring with at least 3:1 component contrast and no clipping by overflow containers.
- Status always includes text/icon. Podium placement does not replace rank text. Error rate retains its percentage label.
- Contrast targets: normal text 4.5:1, large text 3:1, UI boundary/focus 3:1.
- Scene images are decorative. A formally mapped Blook image, when present, retains descriptive alt; omitted imagery creates no empty avatar control. Data tables retain captions or accessible names.
- Loading uses content-shaped skeletons plus status text. Empty, error, retry, pending and disabled remain visibly distinct.
- No automatic motion. Reduced-motion behavior is instant.

## 6. Artifact map

Wireframe boards:

- `artifacts/design-audit/teacher-tactical-observatory/wireframes/analytics-board.svg`
- `artifacts/design-audit/teacher-tactical-observatory/wireframes/classes-board.svg`
- `artifacts/design-audit/teacher-tactical-observatory/wireframes/classroom-detail-board.svg`
- `artifacts/design-audit/teacher-tactical-observatory/wireframes/student-progress-board.svg`
- `artifacts/design-audit/teacher-tactical-observatory/wireframes/questions-board.svg`
- `artifacts/design-audit/teacher-tactical-observatory/wireframes/live-report-board.svg`

Each page also has a current desktop and mobile PNG direction recorded by exact path in the manifest. Revised files use versioned filenames; superseded files remain registered but are excluded from approval candidates. Deterministic SVG direction companions record the planned composition without authoritative data. The manifest is the definitive artifact registry.

## 7. Phase B suggested slices, not authorized

1. Shared `TeacherWorkSurface` and teacher-local tokens. Constrain the scene header and establish the quiet work canvas, type, spacing, border, states and responsive rules.
2. 教學分析 pilot. Validate the decision strip, progressive filter and desktop/mobile data hierarchy against existing tests and hooks.
3. 班級管理 pilot. Validate the create-class operation, compact desktop roster and mobile class disclosures.
4. 班級與學生下鑽頁. Apply identity strip, member disclosures and chapter-progress disclosures.
5. 題目分析. First deliver and verify the dedicated owner-only correct-answer server slice in section 7.1; only then apply chapter/subtopic hierarchy, inline question details and correct-answer state without changing `section_quiz` scope.
6. Live 課程報表. Add the debrief-first composition using only values already available in the report object; preserve matrix and CSV.
7. Scoped regression and browser verification at 1280x900 and 393x852, plus keyboard, focus, 44px targets, overflow and state cycles.

### 7.1 Correct-answer server slice boundary

This is an approved Phase B scope expansion, but it is not authorized for implementation in Phase A.

- Add a dedicated server-authoritative RPC or projection for the teacher question-detail path. It verifies the authenticated caller is the owner of the requested classroom before returning any answer field.
- Anonymous callers, students, non-owner teachers and an otherwise valid teacher crossing into another classroom fail closed. The authorization check belongs on the server and cannot rely on a hidden route or client guard.
- The generated RPC result must explicitly model the answer-bearing payload: classroom identity, stable-question identity and `options[]` with `option_key`, `option_text` and `is_correct: boolean`. The repository maps that narrow result to a teacher-only TypeScript type with `options[].isCorrect`. Do not append the flag to the existing shared answer-free `QuestionDetail` payload.
- Add a positive same-classroom-owner test and negative tests for anonymous, student, non-owner teacher and cross-classroom access. Verify result typing and verify no answer field is exposed through student quiz, Live answering or any other non-teacher report payload.
- The teacher UI may display the answer label and correct-option state only from that projection. If the server slice is unavailable, pending or denied, omit the answer state; never infer it from color, position, option order, static fixture or local computation.
- Do not send the correct answer into student routes, active Live answer payloads, general analytics payloads or unrelated teacher reports. Keep the answer projection narrow and on-demand.

## 8. Approval boundary

Phase A is closed: the shared visual contract and all six page directions are owner-approved. The v2 classroom-detail mobile and student-progress desktop/mobile PNGs are the approved current directions; their predecessors remain isolated as superseded artifacts. Approval of the design does not authorize implementation. Phase B does not begin until the owner approves the implementation plan and issues an explicit bounded implementation instruction.
