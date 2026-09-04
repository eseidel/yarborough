# The practice page: UX inventory and redesign

The practice page (`/` and `/bid/<board>`) is the app's main surface. Its
audience is someone on a phone, in a browser, who wants to bid hands, find out
whether they followed SAYC, and get better at it over time. This document
inventories the page as it was before the redesign, names what got in the way
of that goal, and records the design the code now follows.

## 1. Inventory of the page before the redesign

The page has three phases: **bidding** (it is South's turn), **thinking**
(the engine is bidding for the other three seats), and **review** (the auction
is over). South is always the user. Top to bottom, each phase showed:

### Every phase

| Element                 | What it did                                                                                                                      | Problems                                                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nav bar                 | Practice / Explore tabs.                                                                                                         | Fine. Kept.                                                                                                                                                                           |
| Error bar               | Engine or solver failure text with a dismiss button.                                                                             | Fine. Kept.                                                                                                                                                                           |
| Auction table           | W N E S columns, vulnerable seats in red, calls in grid order, `?` for the pending call. Tapping a call showed its SAYC meaning. | Nothing said the calls were clickable. Dealer was implied only by blank cells. No board number or vulnerability in words. The user's own calls looked exactly like the robots' calls. |
| Inline call explanation | Rule name, constraints, description, and an "Explore →" link that left the page.                                                 | Leaving the page loses the hand. The explorer does not know the cards, so it could not say which option fit the hand.                                                                 |
| Share Hand              | A bare text link centred under the actions, sharing the permalink with the auction so far.                                       | Looked like a footnote. The recipient got a half-bid or finished auction, not a hand to bid.                                                                                          |
| Practice Focus          | Random / Notrump / Preempt / Strong 2♣ chips, at the bottom below the fold.                                                      | Tapping a chip threw away the auction in progress with no warning. Being at the bottom, most users never found it.                                                                    |
| About footer            | Links to the SAYC references and the source.                                                                                     | Fine. Kept.                                                                                                                                                                           |

### Bidding phase

| Element        | What it did                                                                                                    | Problems                                                                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| South's hand   | Thirteen mini cards, fanned by suit.                                                                           | Good on a phone. Kept as the hand view during bidding.                                                                                                                                               |
| Bidding box    | XX / Pass / X row, then a grid of levels × strains collapsed to four rows with "Show more". Illegal calls dim. | The 1♣ … 7NT buttons were small (roughly 30 px tall) for thumbs.                                                                                                                                     |
| Suggest Bid    | Fetched the engine's call and showed "Autobidder says: 2♥" with the rule.                                      | It gave the answer away with no way to say so in the record, and the user still had to find and tap the bid in the box afterwards. It took a second or more because it was fetched only when tapped. |
| Skip Hand      | Dealt a new hand.                                                                                              | Equal weight with Suggest and Rebid, though it is rarely wanted.                                                                                                                                     |
| Rebid          | Restarted the current auction.                                                                                 | Labelled "Rebid" here and "Rebid Hand" in review.                                                                                                                                                    |
| Thinking state | "Thinking..." replaced the bidding box and the action row.                                                     | The page jumped every time the robots bid.                                                                                                                                                           |

### Review phase

| Element                | What it did                                                                                                                                                              | Problems                                                                                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Auction Complete"     | A heading.                                                                                                                                                               | Said nothing about the result.                                                                                                                                                                                                                                                                                   |
| Autobidder comparison  | "✓ matches autobidder", or "Autobidder: 4H N" as a link that toggled the engine's whole auction.                                                                         | Compared the whole call string. After the first divergence the engine's auction is a different auction, so the comparison said nothing about _which_ of the user's calls was off or what SAYC would have bid at that point. "4H N" is engine shorthand.                                                          |
| Double dummy           | "Double Dummy" heading, contract, "Best defense: down 1 (9 tricks)", "After West leads ♦4: makes 4 (10 tricks)" plus the lead reason, then a 5 × 4 table headed N E S W. | Two numbers that appeared to disagree, with no explanation of why both exist. "Best defense" is not what the number means (it is best play by _both_ sides). The table had no caption and single-letter headers, so a learner could not tell what a cell was. Nothing related the numbers to the user's bidding. |
| All four hands         | North as a fan, West and East as mini-card columns side by side, South as a fan.                                                                                         | Fifty-two mini cards on a phone. The East and West columns overflowed their half of the screen on any suit longer than six cards.                                                                                                                                                                                |
| Deal stats             | N-S and E-W high-card points and suit counts.                                                                                                                            | Useful numbers, buried after the cards.                                                                                                                                                                                                                                                                          |
| Next Hand / Rebid Hand | Two equal buttons.                                                                                                                                                       | Fine in spirit; the labels and weights are revisited below.                                                                                                                                                                                                                                                      |

### What was missing entirely

- **Progress.** Nothing remembered the last hand. A learner could not see
  whether they were improving. (An analytics event recorded match/differ, but
  only for the site owner.)
- **Per-call feedback.** The only verdict was whole-auction and came at the
  end.
- **Exploring in place.** To see what else was possible at a point in the
  auction the user had to leave for the explorer, which does not know the
  hand.

## 2. Design principles for the redesign

1. **The learning loop is per call.** Every call South makes is checked
   against what SAYC (the engine) would bid in that exact position, on the
   auction as it actually went. That is the unit of feedback, of the record,
   and of the review.
2. **Reveal in the order a teacher would.** During bidding, only South's hand
   and the auction. When the auction ends: the result and the verdict on the
   bidding first, then how the cards would play, then the hands themselves.
   The double-dummy table is never shown as a table; it is read out in
   sentences.
3. **Stay on the page.** The explorer's knowledge (what every legal call means
   here) is available inline for the current position and, read-only, for any
   earlier call. The explorer page itself stays for use with real cards.
4. **One primary action per phase.** During bidding it is the bidding box.
   In review it is Next Hand. Everything else is visibly secondary.
5. **Thumbs, not cursors.** Tap targets of 40 px or more, nothing that only
   works on hover, no layout jumps while the engine thinks.

## 3. The redesigned page

### Layout, top to bottom

1. **Nav bar** (unchanged).
2. **Board line.** "Board 7 · Dealer South · N-S vulnerable", and the focus
   chips (Random / Notrump / Preempt / Strong 2♣). Changing the focus deals a
   new hand at once if South has not bid yet or the hand is over; otherwise it
   applies to the next hand and the chip row says so.
3. **Progress strip.** Appears once at least one hand has been reviewed:
   accuracy across all calls, hands bid, and the current streak of hands bid
   entirely on system. Tapping it expands the breakdown by focus and offers a
   reset. Stored in `localStorage`; nothing leaves the device.
4. **Auction table.** As before, plus: a `You` marker under South's column,
   a small ✓ or ✗ beside each of South's calls once its verdict is known, and
   the `?` cell pulses while the robots are thinking instead of the box
   disappearing.
5. **Call feedback** (bidding phase, after each of South's calls). "✓ 1♠ is the
   SAYC bid" or "✗ SAYC would bid 2♥ here: Jacoby Transfer To Hearts", with the
   rule's constraints and a "Why?" expander. A setting on the strip switches
   this to end-of-hand only, for players who want to bid the whole hand blind.
6. **South's hand** (bidding phase): the mini-card fan.
7. **Bidding box** with larger buttons. Disabled, not hidden, while the robots
   think.
8. **Action row** (bidding phase): **Options** and **Show SAYC bid**.
   - _Options_ opens an inline sheet listing every legal call with its SAYC
     meaning (the explorer's data). Tapping one makes that call. The user
     still has to match the hand to a meaning, so this is not counted as
     help.
   - _Show SAYC bid_ reveals the engine's call and rule with a one-tap "Bid
     2♥" button. The hand is marked as assisted, and assisted calls are kept
     out of the accuracy figure.
   - Below, as small text: **Restart hand · Skip hand · Share**.
9. **Review** (auction complete), in this order:
   1. **Result card.** The contract in words ("4♠ by North", "Passed out"),
      then the verdict: "All 3 of your calls followed SAYC" or "1 of your 3
      calls differed from SAYC", followed by one line per differing call
      ("At 2♥ you bid 3♥; SAYC bids 4♥: Jump Raise") that expands to the
      rule's constraints. If any call differed, the card also says where the
      engine's own auction would have ended ("SAYC would have reached 4♥ by
      North") with a link to view that auction, whose calls are clickable for
      their meanings.
   2. **Play card.** Double dummy in sentences. "With all four hands in view
      and best play by both sides, 4♠ by North makes 4 (10 tricks)." When the
      textbook lead changes the outcome: "After West's normal ♦4 lead (fourth
      best), it makes 5." When it does not, one sentence covers both. Then a
      line per side listing what it could make ("N-S can make 4♠, 3NT, 2♦;
      E-W can make 2♥"), and a verdict that ties the contract to the bidding:
      reached a making game, stopped short of a makeable game, too high, or
      the opponents' contract and whether it makes. The twenty-cell trick
      table itself is not shown; the sentences carry what a learner needs.
   3. **Hands.** All four hands as the same mini cards South bid from, laid
      out as at the table: North across the top, West and East side by side,
      South across the bottom, each with its high-card points and South
      marked "(you)". In the side-by-side columns every card but the last of
      a suit sits in a slot that shrinks when the column is narrow, so a long
      suit overlaps more instead of spilling off a phone screen. Under the
      hands, each side's total points and any eight-card or longer fit.
   4. **Actions.** **Next hand** as the one primary button; **Bid again** and
      **Share** as secondary. Share sends the bare board, without the
      auction, so the recipient bids the hand themselves. Bid again restarts the same board with the same
      robots, so the user can try to bid it on system.
10. **About footer** (unchanged).

### The action button, by phase

| Phase    | Primary                                  | Secondary               | Tertiary (text)                              |
| -------- | ---------------------------------------- | ----------------------- | -------------------------------------------- |
| Bidding  | The bidding box                          | Options · Show SAYC bid | Take back · Restart hand · Skip hand · Share |
| Thinking | Everything disabled; the `?` cell pulses |                         |                                              |
| Review   | Next hand                                | Bid again · Share       |                                              |

"Rebid" and "Rebid Hand" became "Restart hand" during bidding (it throws away
calls) and "Bid again" in review (it is a second attempt). "Take back" undoes
only South's latest call: the robots' replies to it are dropped, or discarded
if they are still thinking, and the re-opened turn keeps its cached SAYC bid.
It is offered during bidding only; a reviewed hand is already in the record. "Skip hand" and
"Next hand" stay distinct because they mean different things to the learner
even though both deal.

### How the per-call verdict is produced

When it is South's turn the page asks the engine for its call in that position
straight away, while the user is still thinking, so the answer is already in
hand when they tap a bid. The verdict is shown at once (or at the end, per the
setting) and recorded with the hand. Boards opened from a permalink with calls
already in the auction get their verdicts for South's earlier calls the same
way, one request per call. The engine's whole-auction simulation is still run
at the end, but only to say where SAYC would have ended up, not as the
verdict.

### Why the double-dummy numbers can disagree

The table is computed with all fifty-two cards visible and both sides playing
perfectly from the first card. The "after the lead" number fixes the opening
lead to the textbook choice and then plays perfectly from the second card. A
real defender does not see the other hands, so the textbook lead can give
declarer a trick the table says the defense could have kept, or, rarely, the
reverse. The page says which is which in words rather than leaving two numbers
side by side.

## 4. Follow-ups outside this change

- The focus filter selects on the _dealer's_ opening. Selecting on South's
  first call instead (for instance, any 1NT response rule for "Notrump")
  would make "Notrump" practice mostly responding to and opening 1NT, rather
  than passing over an opponent's 1NT a quarter of the time. That is an engine
  adapter change with its own Python tests.
- More focuses are cheap once the filter looks at South's call: takeout
  doubles, overcalls, responses to a major, slam tries.
- The explorer page could take a hand string so it can highlight which calls
  fit a hand held at the table.
