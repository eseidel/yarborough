# Plan: a bidding record, strengths and weaknesses, and adaptive practice

The practice page checks every call South makes against the engine's call
in that position. Today the only thing kept is a handful of counters in
`localStorage`. This plan replaces that with a full record of every hand the
user bids, kept in IndexedDB on the device; a way of naming what kind of call
each check was, so the record can say where the user is strong and weak; a
Progress tab that shows all of that and how it is changing; and an adaptive
practice mode that deals hands whose auctions call for the kinds of calls the
user has been getting wrong.

Nothing is migrated from `localStorage`; there are no production users of it.

## 1. What each call is: the category hierarchy

A verdict compares the user's call with the engine's call in the same
position. The category of a verdict is the category of the **engine's** call,
since that is the call the user was supposed to find. Every engine call comes
from a rule class in `python/z3b/rules.py` (279 of them), or from no rule at
all when the engine simply passes.

The rule classes do not form a usable tree on their own: many derive
straight from `Rule`, and the intermediate classes mix conventions with
implementation detail. So the hierarchy is a curated table in a new
`python/categories.py`, mapping each rule class name to a path of three
levels, with a unit test that fails when a rule class in `rules.py` has no
entry, so new rules cannot slip through unlabelled.

**Level 1: what you are doing.** Seven groups, from South's point of view.

| Level 1                  | Level 2 (examples)                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opening                  | One of a suit · 1NT, 2NT and 3NT · Strong 2♣ · Preempts · Passing in first or second seat                                                                                                                           |
| Responding to an opening | To one of a suit (raises, 1NT, new suits, jump shifts, Jacoby 2NT, negative doubles, over their interference) · To 1NT (Stayman, transfers, invitations, minor suits) · To 2♣ · To a preempt · Passing as responder |
| Opener's rebid           | After one of a suit (rebids, new suits, reverses, notrump rebids, raises, help-suit tries) · After 1NT (Stayman replies, accepting and super-accepting transfers, doubled transfers) · After 2♣ · After a preempt   |
| Responder's rebid        | Preference and sign-off · Invitations · Fourth-suit forcing and its replies · Second negative · After opener's reverse · After a transfer · After Stayman                                                           |
| Competing                | Overcalls (simple, jump, 1NT, preemptive) · Takeout doubles · Michaels and Unusual 2NT · Balancing · Penalty and lead-directing doubles · The overcaller's or doubler's rebid                                       |
| After partner competes   | Replying to an overcall (raises, cuebids, new suits) · Replying to a takeout double · Replying to Michaels or Unusual 2NT                                                                                           |
| Slam bidding             | Blackwood · Gerber · Quantitative 4NT · Grand slam force · Replies to each                                                                                                                                          |

**Level 3** is the rule itself, under its formatted name ("Jump Raise",
"Jacoby Transfer To Hearts"), as the feedback already shows it.

**Passes with no rule.** When the engine passes without a rule, the level-1
group comes from the auction: nobody has bid yet (Opening); partner opened
and South has not acted (Responding); South opened (Opener's rebid); partner
opened and South has bid (Responder's rebid); the opponents opened and our
side is silent (Competing); the opponents opened and partner has acted
(After partner competes). Level 2 is "Passing". This is the same role logic
the table uses for the rows above, so it lives in `categories.py` beside the
table.

The engine adapter gains one field: `get_suggested_call` returns `category`
(the three-element path) alongside `rule_name`, and the TypeScript result
parser and `CallInterpretation` carry it. The adaptive generator (section 4)
categorizes the engine's own auction inside the adapter, so `get_full_autobid`
is unchanged. The engine's bidding does not change, so the baseline test is
untouched.

## 2. The record: IndexedDB

One database, `yarborough`, version 1, two object stores. No library: a
promise wrapper over the IndexedDB API is about eighty lines and there is
nothing else in the app to justify a dependency. Unit tests run against
`fake-indexeddb` (a dev dependency, since happy-dom has no IndexedDB); one
browser test exercises the real thing in Chromium.

**`hands`** holds one record per reviewed hand, keyed by an auto-incremented
id, indexed by `completedAt` and by `boardId`:

- board: `boardId`, board number, dealer, vulnerability, the deal as its
  26-character encoding, the user's seat;
- how it was dealt: the focus (`Random`, `Notrump`, ...) or `Adaptive`, and
  for adaptive hands which categories were targeted;
- the auction: the calls as bid, the contract and declarer, and the engine's
  own auction for the board;
- the verdicts: for each of South's calls, its index, the call, the engine's
  call, rule name and category path, matched, assisted;
- the play: the double-dummy table and the tricks after the textbook lead,
  when they were computed;
- `completedAt` and `durationMs` (from the first call to the last).

A hand is written once, when the auction is complete and every verdict is in,
exactly where the `localStorage` counters are updated today. Bidding the same
board again writes another record; "Take back" never writes.

**`settings`** is a key-value store for the few preferences the page keeps:
feedback timing, the current focus, and the adaptive mode's last targets.
`localStorage` and `sessionStorage` are no longer used.

Everything derived (accuracy, per-category counts, trends) is computed in
memory from the `hands` store by pure functions in `src/practice/stats.ts`.
At a few thousand hands that is a single `getAll` and a millisecond of
arithmetic; nothing needs a second store or incremental maintenance. A hook
(`useRecord`) loads the store once per page and exposes the aggregate, the
recent hands, and `recordHand`; the practice page's strip and the Progress
tab both read from it.

## 3. What the numbers mean

Usage volume differs enormously between users: one bids ten hands a month,
another a hundred a day. Any fixed window ("the last half of your calls",
"at least five calls") is wrong for one of them. So every judgment the app
makes about the record is a statistical statement with its own confidence,
computed from however much data there is, and shown as such.

Every checked call is one Bernoulli trial: matched or not, unassisted only.

**Accuracy** for any set of calls is matched / calls, shown with a 95%
Wilson interval so a beginner's 4 of 5 reads "80% (38–96%)" and a heavy
user's 400 of 500 reads "80% (76–83%)". Nothing is hidden for being small;
the interval says how much to trust it.

**Strengths and weaknesses** ask, for each category: is the user's accuracy
here genuinely different from their accuracy everywhere else? Each category
gets a Beta posterior whose prior is centred on the user's overall accuracy
with the weight of five calls, updated by the category's own calls. The
figure shown is the posterior probability that the category's true accuracy
is below the overall figure. A category with 3 misses in 3 calls comes out
around 90% likely to be a weak spot; the same 3 misses among 30 calls at a
user who runs 80% overall comes out near 50%, which is to say unremarkable.
The regularized incomplete beta function this needs is forty lines of
numerical code with a unit test against known values; there is no library
to add. The prior does the work a minimum-count threshold did, and does it
smoothly: small samples are pulled toward "no evidence" rather than cut off.

Labels follow the probability: **weak spot** at 80% or more, **strength** at
20% or less (that is, 80% likely to be above overall), otherwise nothing.
Rows sort by that probability, and the Progress tab shows it beside the
accuracy ("Weak spot, 91% sure").

**Trend** asks whether accuracy is rising with time, and how fast. Calls in
the window are ordered by time and the test is the score test for a
positive slope in a logistic model of matched on call order (this is the
Cochran–Armitage trend test with one call per level). It is closed-form,
uses every call rather than two halves, and its power grows with the number
of calls, so a heavy user sees a trend confirmed within days rather than
after doubling their history. The fitted slope is reported as percentage
points per hundred calls, so the reader gets size as well as direction.

The window answers "am I improving now?", not "have I ever improved": the
last ninety days, extended back to at least forty calls when the ninety days
hold fewer. The same test runs per category over that category's window,
with the same minimum.

Labels follow the one-sided p-value: **improving** at p ≤ 0.05, **probably
improving** at p ≤ 0.2, and the mirror pair for a negative slope, otherwise
**no clear trend**. Shown as "Improving, 97% confidence, +6 points per 100
calls".

The chart of accuracy over time plots each block of hands as a point with
its Wilson interval, so a user can see for themselves whether the points
are separating or merely wandering.

## 4. Adaptive practice

Adaptive mode is a fifth focus chip, "Weak spots", enabled once at least one
level-2 category is a weak spot by the rule in section 3 (80% posterior
probability of sitting below the user's overall accuracy). Its targets are
those categories, each weighted by that probability times the gap between
its posterior mean and the overall figure, so a near-certain small weakness
and a likely large one both get practice and neither dominates. A target chosen from
the Progress tab ("Practice this") is a single-category form of the same
mode.

**Finding a hand.** The adapter gains `generate_adaptive_board(targets,
max_attempts)`. It deals random boards, bids each one through with the
engine, and accepts the first board where any of South's calls falls in a
target category. This is the same rejection sampling the focus filter does,
but bidding a whole auction costs one engine call per seat per round, so
attempts are far more expensive than a focus check of the opening alone.

Two things keep that off the user's screen:

- **Short requests.** The worker serializes requests, so one long generation
  would stall the robots' next reply. Each request tries at most a handful
  of boards (three) and returns either a board or nothing; the page loops
  requests, and between them the queue drains. The robots never wait for
  more than one short attempt.
- **Prefetching.** The next adaptive board is generated while the user bids
  the current one, so by the time they tap Next hand it is usually ready.
  When it is not, the page says what it is looking for ("Finding a hand
  that needs a response to 1NT...") and keeps looping. After a bounded
  number of attempts (thirty boards) it falls back to a random deal and says
  so, rather than spinning.

A hand dealt by adaptive mode records which categories were targeted, so
the Progress tab can later say whether practising a weakness improved it.

## 5. The Progress tab

A third tab in the nav, `/progress`, built for the phone like the practice
page. Top to bottom:

1. **Overall.** Accuracy, hands bid, calls checked, current and best streak,
   and the trend with its confidence and slope. A small chart of accuracy
   over time, one point per block of hands with its Wilson interval, so
   improvement (or its absence) is visible at a glance.
2. **Strengths and opportunities.** Two short lists picked from level 2 by
   the rules in section 3, each row with the category, its accuracy over its
   count, and its trend. Every opportunity row has a "Practice this" button
   that starts adaptive mode on that category.
3. **All categories.** The full tree, collapsed to level 1 with level 2 and
   level 3 underneath on tap. Each row: name, accuracy or "n/a", count, and a
   thin bar carrying the interval, and the weak-spot or strength probability
   when it is one. Rows with no calls yet are dimmed rather than hidden, so
   the user can see what they have not met.
4. **Recent hands.** The last twenty, newest first: date, contract, "on
   system" or which category the misses were in. Each opens the board's
   review at `/bid/<board>:<calls>`, which already renders the verdicts from
   the auction alone.
5. **Your data.** A sentence saying the record lives only on this device,
   an Export button that downloads the `hands` store as JSON, and Reset with
   a confirmation.

The practice page keeps its strip, now fed from the same record, and the
strip links to the tab.

## 6. Delivery, in order

Each step is a separate pull request with its own tests; each leaves the app
working.

1. **Categories in the engine adapter.** `python/categories.py` with the
   table and the pass-context logic; coverage test; `category` on the
   adapter's results; parsers and `CallInterpretation` on the TypeScript side.
   No visible change.
2. **The IndexedDB record.** The wrapper, the two stores, `stats.ts`, the
   `useRecord` hook; the practice page writes hands and reads its strip from
   the record; `progress.ts` and its `localStorage` use are deleted.
   `fake-indexeddb` added for unit tests, one browser test added.
3. **The Progress tab.** Route, nav tab, the five sections above, export and
   reset.
4. **Adaptive practice.** `generate_adaptive_board` in the adapter with
   tests, the short-request loop and prefetch in the session hook, the
   "Weak spots" chip and the "Practice this" buttons.

Steps 1 and 2 are independent and could land in either order; 3 needs 2;
4 needs 1, 2 and 3.

## 7. Decisions taken, and two to confirm

Taken, and easy to change later:

- Categories are keyed by the engine's call, not the user's. The user's call
  may have no rule at all, and the point is what SAYC wanted here.
- Assisted calls (SAYC bid shown first) stay out of every figure, as now.
- Stats are derived on load rather than stored. Revisit only if a record
  grows past tens of thousands of hands.
- No sync, no accounts: the record is per device, with export as the escape
  hatch.

To confirm before step 1:

- The seven level-1 groups and the level-2 split above. These are the labels
  the user will read; changing them later re-labels history but loses no
  data, since each verdict stores its full path.
- "Weak spots" as the adaptive chip's name, and the confidence levels in
  section 3: 80% posterior probability for a weak spot or strength, p ≤ 0.05
  and p ≤ 0.2 for the two trend labels, five calls of prior weight, and the
  ninety-day / forty-call trend window.
