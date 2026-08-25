# Standard American Yellow Card (SAYC) — Complete Bidding System Reference
### Version 3 — verified line-by-line against the extracted text of the ACBL SAYC System Booklet (revised January 2006); all standard-practice fills now flagged

**Purpose.** A complete, self-contained specification of SAYC as published by the ACBL, written so that a large language model can (a) select correct SAYC bids for any hand and auction, and (b) act as an expert teacher explaining those bids to humans.

**How an LLM oracle should use this document**

1. Always reason explicitly in terms of: hand evaluation (points), fit (8+ card fits), the meaning of every prior call in the auction, and whether the last call by partner is forcing (Forcing Index, §20).
2. Statements here follow the official ACBL SAYC System Booklet (rev. 1/2006) and yellow card. Rules marked **[standard practice]** fill gaps where the official documents are silent; teach them as defaults, flagged as such.
3. When teaching, always state (i) what the bid shows (point range + shape), (ii) whether it is forcing, invitational, or sign-off, and (iii) the plan for the auction ("captaincy": the limited hand describes, the unlimited hand decides).
4. SAYC is *not* 2/1 Game Force. Do not import 2/1 agreements (§17 lists what SAYC does not include).

**Notation.** ♠ ♥ ♦ ♣, NT = notrump. M = either major; m = either minor. X = double, XX = redouble, P = pass. Opponents' calls in parentheses: 1♦–(1♠)–X. HCP = high-card points; "points" = HCP + distribution. F = forcing one round; GF = game-forcing; INV = invitational; NF = non-forcing; S/O = sign-off. LHO/RHO = left/right-hand opponent.

---

## 1. System Overview

SAYC is a natural, five-card-major system built on these pillars:

- **Five-card majors** in all seats (1♥/1♠ = 5+ cards).
- **Strong notrump:** 1NT = 15–17, balanced (a 5-card major or minor is permitted).
- **Convenient minor:** 1♣/1♦ promise only 3+ cards.
- **Strong, artificial 2♣** (22+ points or the playing equivalent).
- **Weak two-bids:** 2♦/2♥/2♠ = 5–11 HCP, good 6-card suit.
- **Limit jump raises** of minors; over majors, the limit raise (10–11) plus **Jacoby 2NT** as the game-forcing raise.
- **Strong jump shifts** by responder.
- **Competitive toolkit:** negative doubles through 2♠, takeout doubles, weak jump overcalls, Michaels cue-bids, unusual 2NT, 15–18 1NT overcall (2♣ Stayman only).
- **Slam tools:** ordinary (non-keycard) Blackwood 4NT, 5NT Grand Slam Force, Gerber 4♣ over partner's NT bids, quantitative 4NT raises of NT.
- **Carding (for completeness):** standard leads (4th best; top of touching honors and top of interior sequences; the ace from A-K-x vs. suits; low from three small vs. suits, high vs. NT; 2nd highest from 4+ small without an honor) and standard signals (high encourages; high-low = even count). This document otherwise covers bidding only.

**Combined-strength targets** (all decisions flow from these):

| Contract | Combined points needed (approx.) |
|---|---|
| 3NT or 4♥/4♠ | 25–26 |
| 5♣/5♦ | 28–29 |
| Small slam | 33 |
| Grand slam | 37 |

**Strain priority:** (1) 8+ card major fit; (2) notrump; (3) minor-suit game only when NT is unplayable or slam is in view.

**Captaincy principle:** the first player to make a limit bid (narrow, defined range) hands the decision to partner, who adds the ranges, compares to the targets, and places the contract. Most auction logic is "describe, then decide."

---

## 2. Hand Evaluation

**HCP:** A = 4, K = 3, Q = 2, J = 1 (tens count zero; deck total 40).

**Length points** (when naming suits — openings, overcalls, most responses): +1 for each card beyond four in every suit.

**Dummy (support) points** — used **instead of** length points **only when raising partner's suit**: void = 5, singleton = 3, doubleton = 1 (shade down with only 3-card support).

**Notrump bids are judged on HCP.**

**Judgment refinements:** upgrade good suits, tens/nines, honors together, aces/kings; downgrade unguarded honors, 4-3-3-3 shape, queens/jacks in short suits.

**Opening standard:** open all hands worth 13+ points (HCP + length); a good 12 (decent suit, 2+ quick tricks) may be opened. Flat 12-counts normally pass in 1st/2nd seat.

**Balanced shapes:** 4-3-3-3, 4-4-3-2, 5-3-3-2. A 15–17 hand with a 5-card major (or minor) may open 1NT.

---

## 3. Choosing an Opening Bid (1st/2nd seat, no interference)

Apply in order; take the first rule that fits.

1. **Balanced, by HCP:** 15–17 → **1NT**; 20–21 → **2NT**; 25–27 → **3NT**; 18–19 → one of a suit, then **jump 2NT rebid**; 22–24 → **2♣**, then 2NT; 28+ → **2♣**, then 3NT+; 13–15 → one of a suit, then a lowest-level NT rebid.
2. **22+ points, or the playing equivalent (within about one trick of game)** → **2♣** (§10).
3. **13–21 points, one of a suit:**
   - 5+ card major → open it. With two suits of equal length (5-5 or 6-6), open the **higher-ranking**.
   - No 5-card major → longer minor; **4-4 minors → 1♦**; **3-3 minors → 1♣**. Hence 1♦ suggests 4+ cards — the only 3-card 1♦ opening is exactly 4=4=3=2 (four spades, four hearts, three diamonds, two clubs).
   - Never open a 4-card major in 1st/2nd seat (the booklet tolerates an occasional 4-card major in 3rd seat as judgment).
4. **Below opening strength:** good 6-card suit, 5–11 HCP → weak **2♦/2♥/2♠** (§11); good 7-card suit → 3-level preempt; 8-card suit → 4-level preempt (§12).
5. Otherwise **pass**.

**3rd seat:** openings may be shaded (~11–12); a 4-card major is a permitted deviation; preempts friskier. **4th seat:** open only expecting a plus score (**[standard practice]** "Rule of 15": HCP + spades ≥ 15); preempts show sound hands.

---

## 4. Responding to a 1♥ / 1♠ Opening (no interference)

Opener: 13–21 points, 5+ cards. Responder needs 6+ to act. **First priority: reveal a fit (3+ trumps).** (Illustrated from 1♥; 1♠ is symmetric.)

| Response | Shows | Forcing? |
|---|---|---|
| Pass | 0–5 points | — |
| 2♥ (raise) | 6–10 dummy points, **3+ trumps** | NF |
| 3♥ (jump raise) | **Limit raise:** 10–11 dummy points, **3+ trumps** | INV |
| 4♥ | **Preemptive:** usually 5+ trumps, a singleton or void, fewer than 10 HCP | S/O |
| 2NT | **Jacoby 2NT: game-forcing raise, 13+ dummy points** (see below) | GF |
| 3NT | **15–17 HCP, balanced, exactly 2-card support** (offers a choice of games) | Opener places |
| 1♠ | 6+ points, 4+ spades; tends to deny a heart fit | F |
| 1NT | **6–9**, no fit (denies 3 hearts), no biddable 1♠. **Not forcing** | NF |
| 2♣ / 2♦ (and 2♥ over 1♠) | **10+ points**, 4+ cards — except **1♠–2♥ promises 5+ hearts** (the booklet states only "4+ of the suit"; 5+ here is universal SAYC consensus **[standard practice]**). Forcing one round, *not* GF; **responder promises a rebid** unless opener's rebid is at game level | F |
| Jump shift (1♥–2♠, 1♥–3♣/3♦) | **Strong jump shift, invites slam** (guideline: ~17+ points **[standard practice]**) | GF |

**Jacoby 2NT continuations** (after 1♥–2NT): opener shows a **singleton or void** by bidding it at the three level (3♣/3♦/3♠). With no short suit, opener shows strength: **4♥ = minimum; 3NT = medium (15–17); 3♥ = maximum (18+)**; a jump to **4♣/4♦ = a good second 5-card suit**. Responder then signs off in game, cue-bids, or uses Blackwood.

**With 10–11 and only 3 trumps:** make the limit raise directly (it shows 3+). **With a game raise and 12 points** (below Jacoby 2NT's 13): bid a new suit, then jump to game **[standard practice for the gap hand]**.

---

## 5. Responding to a 1♣ / 1♦ Opening (no interference)

Opener: 13–21, 3+ cards. **First priority: 4-card majors, up the line.** There is **no forcing minor-suit raise** in SAYC.

| Response | Shows | Forcing? |
|---|---|---|
| Pass | 0–5 | — |
| 1♦ over 1♣; 1♥/1♠ | 6+ points, 4+ cards; with two 4-card suits bid **up the line**; with a 5-card and a 4-card suit, bid the longer first | F |
| Raise to 2m | 6–10, **4+ to raise 1♦, 5+ to raise 1♣** (one fewer in a pinch in competition), denies a 4-card major | NF |
| Jump raise to 3m | Limit, 10–11(12), same support rules, denies a 4-card major | INV |
| 1NT | 6–9(10) HCP, no 4-card major conveniently biddable **[range is standard practice — the booklet gives none for 1NT over a minor]** | NF |
| 2NT (jump) | **13–15 HCP, balanced, game-forcing**, no 4-card major | GF |
| 3NT (jump) | **16–18 HCP**, balanced, no 4-card major | S/O |
| New suit at 2-level (1♦–2♣) | 10+ points, 4+ cards, promises a rebid | F |
| Jump shift | Strong, invites slam (~17+) | GF |

---

## 6. Opener's Rebids

Opener re-expresses strength in three bands: **minimum 13–15**, **medium 16–18**, **maximum 19–21(22)**.

**Minimum (13–15):**
- Rebid NT at the **lowest available level** (e.g., 1♦–1♠; 1NT = **13–15 balanced**; in practice 13–14 or a poor 15, since 15–17 opens 1NT).
- Raise responder's suit at the lowest level (4-card support; good 3-card support permitted).
- New suit at the one level, or a **non-reverse** new suit at the two level. NOTE: a non-reverse new suit has the **wide range 13–18** and is NF.
- Rebid opener's own suit at the lowest level (6+ cards, occasionally a strong 5).

**Medium (16–18):**
- **Jump raise** of responder's suit, or **jump rebid** of opener's suit (good 6+ cards). INV.
- **Reverse:** a new suit at the two level **higher-ranking than the opened suit** (1♦–1♠; 2♥). Shows 16–18+, first suit longer. Forcing one round **[forcing status is the universal treatment; the booklet defines the reverse by shape/strength]**.

**Maximum (19–21/22):**
- **Jump in NT** (1♦–1♠; 2NT = 18–19 balanced — the arithmetic slot left by the 1NT ladder; the booklet files jump-NT under "maximum". Highly encouraging; pass only with a bare 6).
- Double-jump raise of responder's suit or double-jump rebid of opener's suit (to game).
- **Jump shift** in a new suit: GF.

**Definition drill (common confusion):** a reverse requires the *second* suit to outrank the *first*. Opening 1♠ and rebidding 2♥ is **not** a reverse (responder can prefer 2♠); with 5♠-5♥ and a minimum, open 1♠ and rebid 2♥ freely. Opening 1♥ and rebidding 2♠ **is** a jump-shift-strength action avoided on minimums — with 5-5 you opened the higher suit anyway.

**Opener's rebids after a 1M–1NT (6–9) response:** pass with a balanced minimum; 2 of a lower new suit = natural, 13–18, NF (may be a 3-card minor on 5-3-3-2 if forced to act **[standard practice]** — passing is normally better); 2M = 6+ card suit, minimum; 3M = 16–18 with 6+; 2NT = 18–19; jump shift = 19+ GF; reverses per above; game bids = maximum.

**Opener's rebids after a two-over-one (10+):** same band logic one level higher; remember responder has promised another bid, so a minimum opener rebids as cheaply and honestly as possible (rebid the suit, raise, or bid a non-reverse new suit) rather than jumping.

---

## 7. Responder's Rebids and General Auction Logic

Classify responder: **6–9 sign-off zone**, **10–11 invitational**, **12/13+ game-going**.

**After responder bid a suit at the one level:**
- **Sign-off (6–9):** pass, 1NT, or two of a previously bid suit (simple preference or rebid).
- **Invite (10–11):** 2NT, or three of a previously bid suit.
- **Force:** a **new suit by responder is forcing**; if it is the **fourth suit, it may be artificial/conventional** — a one-round force that merely asks opener to describe (opener shows a stopper with NT, support, or extra shape) — don't insist it promises length.
- **Game (12/13+):** bid it (3NT, 4M, 5m) when the strain is clear; otherwise force with a new suit and decide next round.

**After opener rebids 1NT (13–15), special rules apply — SAYC has no New Minor Forcing:**
- A new suit at the **next higher level is NON-forcing** (e.g., 1♦–1♠; 1NT–2♣/2♥ = to play-ish, weak shapely).
- To create a game force, responder must **jump shift or reverse** (1♦–1♠; 1NT–3♣ or 2♥ = GF).
- 2NT = INV (10–11); 3NT/game bids = to play; rebidding responder's suit at the two level = 6–9, 6+ cards, NF; a jump rebid of responder's suit = INV.

**After responder's two-over-one (10+), responder has promised a rebid** (unless opener's rebid was at game). Responder's second-round bids: **2NT or three of a previously bid suit = INV (10–11)**; simple preference to opener's major = NF (booklet: **11–12** with a doubleton); a **jump raise of opener's first suit to the three level = GF** (with a mere limit raise, responder would have raised directly); a new suit (including the fourth suit) = GF-ish force **[booklet: "game force, could be conventional"]**.

**Universal rules:** never pass a forcing bid; once any GF bid occurs, neither player stops below game; passed-hand exceptions in §16.

---

## 8. The 1NT Opening (15–17) and Its System

Responder is captain. Roughly: 0–7 part-score zone; 8–9 invite; 10–14 game; 15–16 invite slam; 17–18 drive slam.

| Response | Meaning | Forcing? |
|---|---|---|
| Pass | 0–7, no 5-card major, no better spot | — |
| 2♣ | **"Non-forcing Stayman"** — asks for a 4-card major; the auction may die in two of a suit. Normally 8+ with a 4-card major; also usable on weak shapely hands (see garbage note) | F one round |
| 2♦ / 2♥ | **Jacoby transfers** to hearts/spades: 5+ cards, any strength | F |
| 2♠ | **Minor-suit bust relay:** opener must bid 3♣; responder passes with a club bust or bids 3♦ with a diamond bust (opener passes) | F, then S/O |
| 2NT | INV, 8–9 HCP, no 4-card major **[range is standard practice — booklet silent]** | INV |
| 3♣ / 3♦ | 6+ card suit, **invitational to 3NT** | INV |
| 3♥ / 3♠ | 6+ card suit, **slam interest** (with game-only values, transfer instead) | GF |
| 3NT | 10–14(15), no 4-card major | S/O |
| 4♣ | **Gerber** (§13) | F |
| 4♥ / 4♠ | To play **[standard practice — rare; SAYC has no Texas transfers]** | S/O |
| 4NT | **Quantitative:** invites 6NT, ~15–16. Opener passes with 15/poor 16, bids 6NT with 17/good 16. (4NT is natural precisely because 4♣ Gerber exists for aces) | INV |
| 6NT | 17–18 **[standard practice]** | S/O |

**Stayman continuations.** Opener: 2♦ = no 4-card major; **2♥ = 4 hearts (bid 2♥ holding 4-4 in the majors)**; 2♠ = 4 spades, denies 4 hearts. Responder then:
- Raise opener's major to 3 = INV (8–9); to 4 = to play (10–14).
- 2NT = INV; 3NT = to play. After a 2♥ reply, responder's 2NT/3NT implies 4 spades (Stayman promised a major); opener corrects to spades with 4 **[standard inference]**.
- **3♣/3♦ by responder after Stayman = slam interest with a 5+ card minor** (official).
- After 2♦: a 2♥/2♠ rebid by responder = INV with a 5-card suit **[standard practice]**.
- **Garbage Stayman [standard practice — the booklet says only that Stayman is non-forcing]:** only with tolerance for *every* reply — the classic shapes are 4=4 in the majors with 4+ diamonds and short clubs (4=4=4=1, 4=4=5=0): responder passes 2♦, 2♥, or 2♠. Do not use it with only one 4-card major.

**Transfer continuations** (after 1NT–2♦; 2♥, symmetric for spades). Opener normally accepts; **with 17 points and 4-card support opener jumps (super-accept: 1NT–2♦; 3♥)** — official. Responder's rebids:
- Pass = content to play 2♥ (0–7).
- **2NT or 3♥ = invitational** (8–9; 2NT = 5-card suit, 3♥ = 6+). Opener: pass or 3♥ with a minimum; 3NT or 4♥ with a maximum.
- **New suit (3♣/3♦/3♠) = natural and game-forcing.**
- 3NT = choice of games with exactly 5 hearts (opener passes or corrects to 4♥ with 3+ support).
- 4♥ = placing the contract, 6+ card suit.

**Interference over our 1NT** (official): over their **double, all systems ON** (Stayman, transfers unchanged). Over their **bid, Stayman and transfers are OFF**: bids are natural; a **cue-bid of their suit = game-forcing Stayman substitute**; double = penalty-oriented **[standard practice]**. Bids made voluntarily in later competition show real fits.

---

## 9. The 2NT (20–21) and 3NT (25–27) Openings

**Over 2NT:** 3♣ = **Stayman**; 3♦/3♥ = **Jacoby transfers** to hearts/spades; 3NT = to play; **4♣ = Gerber**; **4NT = quantitative slam invite** (invite with ~12, since 21 + 12 = 33; drive with 13+; pass 3NT with less). 3♠ is undefined — do not assign it in pure SAYC.

**Over 3NT (25–27):** **4♣ = Stayman; 4♦/4♥ = Jacoby transfers** (official — note 4♣ is Stayman here, *not* Gerber); 4NT = quantitative **[standard practice]**.

*(Balanced 22–24 opens 2♣ then 2NT; balanced 28+ opens 2♣ then 3NT+.)*

---

## 10. The Strong 2♣ Opening

**2♣ = artificial:** 22+ points **or the playing equivalent** (within about one trick of game). Says nothing about clubs.

**Responses:** **2♦ = conventional waiting** — may hide a good hand not suited to a positive; **2♥/2♠/3♣/3♦ = natural, GAME-FORCING positives:** 8+ points and a good 5+ card suit; **2NT = balanced 8+ HCP positive**.

**After 2♣–2♦:**
- **2NT = 22–24 balanced, non-forcing;** the entire 2NT-opening system then applies (3♣ Stayman, 3♦/3♥ transfers, 4♣ Gerber, 4NT quantitative).
- **A suit rebid is forcing to 3 of opener's major or 4 of opener's minor — not automatically to game** (official). Example: 2♣–2♦; 2♥–2♠(natural F); 3♥ may now be passed. Responder raises with support, bids a 5+ suit, or marks time with the cheapest NT; below the force level nobody passes.
- 3NT rebid = 28–30 balanced **[standard practice — arithmetic fill; booklet silent]** (25–27 opens 3NT directly).

After a positive response the auction is game-forced and natural; slam is likely — cue-bids and Blackwood apply (§13).

---

## 11. Weak Two-Bids: 2♦, 2♥, 2♠

**5–11 HCP with a 6-card suit of reasonable quality**; rarely a very good 5-card suit; a poor 7-card suit (not good enough for a 3-level preempt) is possible. Judgment: avoid a side 4-card major or void; sounder vulnerable/2nd seat.

**Responses ("RONF" — Raise Only Non-Force):**
- **Any raise is to play** (may be preemptive); opener never bids again.
- **2NT = the one forcing inquiry, game interest** — applies **even over their double or overcall** (official). Opener: with a **minimum (5–8), rebid the suit**; with a **maximum (9–11), bid a new suit containing a "feature"** (ace or king); **with a maximum but no feature, bid 3NT** and let responder place the contract.
- **New suit = forcing one round, 5+ cards** (unpassed hand). Opener raises a major-suit response with 3-card support (even a doubleton honor); otherwise: minimum → rebid the suit cheaply; maximum → new suit or NT. Their double does not cancel this: a new suit stays natural and positive (official example: 2♥–(X)–2♠).
- **3NT = to play.**

---

## 12. Preemptive Openings at the 3-Level and Higher

- **3-level = good 7-card suit** below opening values; **4-level = 8-card suit** **[standard practice — the booklet's only official preempt rule is the 2-3-4 soundness scale]**.
- **Official soundness scale (rule of 2-3-4):** be within **2 tricks** of your bid vulnerable vs. not, **3 tricks** at equal vulnerability, **4 tricks** at favorable.
- Responses **[standard practice — booklet silent; modeled on the weak-two scheme]:** raises to play (opener passes); **new suit forcing**; 3NT to play. Responder counts opener for ~6 tricks and needs ~3–4 quick tricks to raise a major preempt to game constructively.
- 4th-seat 3-level openings are sound, tactical hands **[standard practice]**.

---

## 13. Slam Bidding

**Prerequisites:** ~33/37 combined points (or equivalent playing strength), plus ace security.

**Blackwood 4NT** (regular, NOT keycard), after a suit is at least implicitly agreed: **5♣ = 0 or 4 aces; 5♦ = 1; 5♥ = 2; 5♠ = 3.** Then **5NT asks kings and guarantees the partnership holds all four aces:** 6♣ = 0, 6♦ = 1, 6♥ = 2, 6♠ = 3. Missing two aces → sign off at five of the trump suit.

**Grand Slam Force (official):** a **jump to 5NT** (bypassing 4NT) asks partner to bid **seven of the agreed suit with two of the top three trump honors**, else six.

**Gerber 4♣ — over ANY 1NT or 2NT bid by partner, including rebids** (official): 4♦ = 0 or 4 aces; 4♥ = 1; 4♠ = 2; 4NT = 3. A follow-up **5♣ asks kings** (5♦ = 0 or 4, … 5NT = 3). **Any other bid by the Gerber-user is to play — including 4NT.**

**Quantitative raises:** direct 4NT over a natural NT bid invites 6NT (§8–9): it is natural precisely because 4♣ is available to ask aces.

**Control cue-bids [standard practice]:** with a fit agreed and GF values, a new suit at the 4-level shows a first-round control, up the line; Blackwood usually follows. Teach to advancing students only.

---

## 14. Competitive Bidding: When THEY Open

### 14.1 Simple overcalls
**Overcalls show 8–16 points and a good 5+ card suit** (official range); a 2-level overcall wants nearer 10–16 and usually 6 cards **[standard practice]**. With 17+, **double first**, then bid your suit.
**Advances:** **the ONLY forcing response is a cue-bid of opener's suit**, which asks about overcall quality: overcaller **rebids the suit with a minimum; anything else shows extra strength (~11–12+)**. The cue-bid is also the route with a limit-raise-or-better fit. Otherwise: raises = natural, ~6–10 with 3+ support (jump raise preemptive); new suit = natural, constructive, NF; 1NT = 8–11 with a stopper; 2NT = 12–14 with a stopper **[all non-cue advance ranges are standard practice — the booklet defines only the cue-bid]**.

### 14.2 The 1NT overcall
**(1x)–1NT = 15–18, balanced, preferably a stopper in their suit.** **No conventional advances except 2♣ = Stayman** (official — transfers are OFF). All other advances natural.

### 14.3 Jump overcalls — WEAK
**Preemptive, worth an opening preempt at the same level:** (1♦)–2♠ = a weak two in spades; (1♣)–3♥ = a 3♥ opening. Advances as over preempts (new suit F; 2NT feature ask **[standard practice]**).

### 14.4 Takeout doubles
A double of their suit opening (partner silent) = **takeout**: (a) opening values with shortness in their suit and 3+ (ideally 4) cards in each unbid suit, or (b) **17+ any shape** (then bid your own suit/NT next). **[Shape/strength requirements are standard practice — the booklet defines takeout doubles only by the through-4♦ rule (§14.7); the 17+ figure follows from "overcalls show 8–16 (double and bid the long suit with a stronger hand)."]**
**Advances (bid something with 0–8; pass only to convert with a trump stack):** cheapest suit = 0–8 (prefer majors); **jump in a suit = 9–11 INV, not forcing**; **cue-bid = 12+, forcing** to suit agreement; 1NT = 6–10 with a stopper; 2NT = 11–12; 3NT = 13+. **[Official: jump advance = INV, cue-bid = the force; the specific point bands are standard practice.]**
**Doubler's rebids:** new suit = the 17+ hand; raise = ~16–18 support points; pass the advance with a minimum takeout **[standard practice]**.

### 14.5 Michaels cue-bid
A direct cue-bid of their suit = **5-5 two-suiter (or more)**:
- **(1♣)/(1♦)–2♣/2♦ = both majors, 8+ points** (official floor).
- **(1♥)–2♥ = spades + an unspecified minor; (1♠)–2♠ = hearts + a minor; 10+ points** (official floor).
- **Advancer's 2NT over a major-suit Michaels asks for the minor** (official): 3♣/3♦ answers.
- **When they have bid TWO suits, a cue-bid of either suit is natural** (official) — Michaels applies only when exactly one suit has been shown.
- Style: wide-ranging above the floors; classical weak-or-very-strong style is common **[standard practice]**.

### 14.6 Unusual 2NT
Jump to 2NT over their one-of-a-suit opening = **at least 5-5 in the two LOWEST unbid suits** (over 1M: the minors; over 1♦: ♣+♥; over 1♣: ♦+♥). Advancer picks a suit at the cheapest sensible level; jumps preemptive.

### 14.7 Acting over their preempts (official scheme)
- **Double = takeout over any opening partscore bid (through 4♦); penalty over opening game bids (4♥ and higher).**
- A **below-game jump advance of the takeout double = invitational; a cue-bid forces.**
- **Suit or NT overcalls of a preempt = natural** (sound values; "borrow a king" judgment **[standard practice]**); **a cue-bid of their preempt = Michaels.**
- 2NT over a weak two = 15–18 with a stopper **[standard practice]**; 3NT = to play.

### 14.8 Acting over their 1NT opening
Natural defense: **double = penalty-oriented** (~15+ or equivalent); suit overcalls = natural, good 5–6+ suits. Advances natural. **[The booklet defines no gadget here; do not import Cappelletti/DONT.]**

### 14.9 Balancing (pass-out seat)
Reopening bids mean about the same as direct-seat bids **but may be lighter at the minimum end** (official). **A reopening 1NT after their opening = 10–15** (official wide range). Balancing doubles from ~10–11 **[standard practice]**. Partner allows for the lighter range when advancing.

---

## 15. Competitive Bidding: When THEY Interfere Over OUR Opening

**Master rule (official): bids mean what they meant without the interference**, though second-choice calls are sometimes necessary — and **any opponent bid or double cancels conventions designed for non-competitive auctions** (e.g., after 1♥–(2♠ weak jump), 2NT by responder is natural 12–14, not Jacoby).

### 15.1 Negative doubles (through 2♠)
After our suit opening and their suit overcall **through 2♠**, responder's double = **negative**, promising **4+ cards in an unbid major**:
- 1♣–(1♦)–X = **4-4 or better in both majors**.
- 1♣/1♦–(1♥)–X = **exactly four spades** (a 1♠ bid = 5+).
- 1♦–(1♠)–X = **four hearts with 6+ points, OR five hearts with 5–10 points** (official — with 5 hearts and 11+, bid 2♥ instead: **bidding a major at the two level or higher in competition = 11+ and a 5+ card suit** (official); the same logic is standardly extended to any new suit **[standard practice]**).
- Doubles above 2♠ = penalty-oriented/optional.
- **Opener's duty:** short in their suit, opener strains to **reopen with a double** when responder passes (responder may hold a penalty stack) **[standard practice taught with the convention]**.
- Opener answers like a takeout double: cheap with a minimum, jump 16–18, cue/game 19+ **[standard practice]**.

### 15.2 Responding to our opening over their overcall
- New suits by responder remain forcing; free bids keep normal meanings; 1NT = 6–9(10) and 3NT = 13+, both **with a stopper** in their suit.
- **2NT = natural 12–14 with a stopper** (the booklet's stated range — its example is 1♥–(2♠ weak jump)–2NT; over a mere 1-level overcall, many play 2NT as 11–12 INV **[standard practice alternative]**).
- Raises unchanged (single 6–10; jump = limit 10–11).
- **Cue-bid of their suit = values for game without clear direction — most often a game-forcing raise of opener's suit** (official): 1♥–(2♦)–3♦ = GF, usually a raise.

### 15.3 When they make a takeout double of our opening (official scheme)
- **New suit at the one level = forcing, unlimited.** **New suit at the two level (non-jump) = NF, 6–10, usually a 6-card suit.**
- **Jump shift = preemptive, to play** (a 6+ card suit, like a weak two/three).
- **2NT = limit raise or better (10+ points)** of opener's suit — the "Jordan/truscott" treatment is official SAYC.
- **Jump raise = preemptive:** good trump support, fewer than 10 points.
- **Redouble = 10+**, but prefer a more descriptive call (1-level suit, 2NT) when available; redouble leans toward penalizing them.
- 1NT = 6–9(10) natural.

### 15.4 Other doubles and redoubles (official notes)
- Over their 1NT overcall of our opening: double = penalty (~9+; the balance of power is ours) **[standard practice]**.
- If they double a conventional bid (e.g., our transfer), **pass = nothing special; redouble = penalty interest in that suit; completing the convention shows a real fit**.
- **Redouble is SOS** (requesting rescue) only when our side is doubled for penalty in a trump suit at the 3-level or lower and the redoubler wants out; redouble is to play at the 4-level+.
- If they use Michaels/unusual NT against us: **double = 10+; a cue-bid of one of their shown suits = game force.**

---

## 16. Passed-Hand Bidding

- **New-suit responses by a passed hand are not forcing** (opener may pass with a minimum and a fit) **[standard practice — the booklet implies it only via the "unpassed hand" qualifier on the two-over-one rebid promise]**.
- Jump shift by a passed hand = maximum pass (~10–12), good suit, NF **[standard practice]**.
- Raises and NT responses keep their ranges; the 2/1 "promise to rebid" (§7) applies only to unpassed hands.
- SAYC has **no Drury**; 2♣ by a passed hand over a 3rd/4th-seat major is natural.

---

## 17. What SAYC Does NOT Include (guard against system contamination)

- **No 2/1 Game Force** (a two-over-one = 10+, forcing one round, promising a rebid).
- **No forcing 1NT** response (it is 6–9, NF).
- **No splinters, Bergen raises, or inverted minors.** (But note: **Jacoby 2NT IS official SAYC** over major openings — a common misconception is that it isn't, based on pre-2006 versions.)
- **No Texas transfers, Smolen, lebensohl, or 4-suit transfers** (the only minor gadget over 1NT is the 2♠ bust relay).
- **No Drury, no New Minor Forcing/checkback** (see §7 for the official 1NT-rebid follow-ups).
- **No Roman Keycard Blackwood** (plain Blackwood; plus Gerber and the Grand Slam Force).
- **No responsive or support doubles.**
- **No conventional defense to their 1NT** (double is penalty-oriented).
- **No gambling 3NT** (the 3NT opening = 25–27 balanced).
- The 1NT overcall carries **Stayman only — no transfers**.

---

## 18. Bidding Procedure for an LLM (deterministic checklist)

1. **Evaluate.** HCP; add length points for suit-oriented actions; switch to dummy points upon raising partner. Note shape class and suit quality.
2. **Reconstruct the auction.** Attach to every prior call its range, lengths shown/denied, and forcing status; maintain running pictures of all four hands.
3. **Combine.** Compute the partnership's min–max and identify proven/likely 8-card fits.
4. **Check obligations.** If partner's last call is forcing (§20), passing is not an option: choose the cheapest truthful call. Never pull a sign-off without undisclosed extras.
5. **Set the goal** (26 game / 29 minor game / 33 slam / 37 grand): stop, invite, force, or try for slam accordingly.
6. **Choose the strain:** 8+ major fit > NT with stoppers > minors.
7. **Select the system bid** from the relevant table; among truthful options prefer showing a major, conserving space with strength, consuming space with weak shape, and keeping the auction forcing with game values.
8. **Competitive checks:** respect the rule of 2-3-4 for preempts; don't outbid them at the 3-level+ without a 9-card fit or extras ("Law of Total Tricks" guideline) **[standard practice]**; remember interference cancels non-competitive conventions.
9. **Teaching output:** the call; "shows X–Y and [shape]; it is [F/GF/INV/NF]"; partner's expected continuations; one sentence on why alternatives are inferior.

---

## 19. Worked Examples

**Example 1 — Stayman to game.**
Opener: ♠A5 ♥KQ106 ♦KJ4 ♣Q1052 — HCP: 4 + 5 + 4 + 2 = 15 (the ♥10 and ♣10 count zero) → **1NT**.
Responder: ♠76 ♥AJ85 ♦Q1076 ♣K43 (10 HCP, 4 hearts).
Auction: 1NT – 2♣; 2♥ – 4♥. Combined 25–27 with an 8-card fit: game, no more.

**Example 2 — Transfer sign-off.**
Opener: ♠KQ4 ♥A73 ♦KQ85 ♣J96 (15 HCP) → **1NT**.
Responder: ♠J9765 ♥K84 ♦92 ♣Q75 (6 HCP, 5 spades).
Auction: 1NT – 2♥ (transfer); 2♠ – Pass. A weak hand still improves the contract by playing its suit, and the strong hand stays concealed.

**Example 3 — Limit raise accepted.**
Opener: ♠AQ873 ♥K5 ♦A742 ♣86 (13 HCP + 1 length = 14) → **1♠**.
Responder: ♠K964 ♥86 ♦KQ53 ♣Q42 (10 HCP + 1 for the doubleton = 11 dummy points, 4 trumps).
Auction: 1♠ – 3♠ (limit raise, 10–11, INV); 4♠. Arithmetic: 14 + (10–11) = 24–25 — game is on when responder is maximum and a fair gamble otherwise, so the standard rule is **accept with 14+, decline with a bare 13** (13 + 10–11 = 23–24).

**Example 4 — Strong 2♣.**
Opener: ♠AKQJ76 ♥A5 ♦AK3 ♣94 (21 HCP + 2 length = 23; ~9½ tricks) → **2♣**.
Responder: ♠85 ♥K9762 ♦854 ♣Q73 (5 HCP) → 2♦ (waiting).
Auction: 2♣ – 2♦; 2♠ (natural; forcing to at least 3♠) – 3♠ (raise; weakness is fine, the force protects responder); 4♠ (opener's extras carry on to game — with a minimum 2♣ bid opener could pass 3♠).

**Example 5 — Negative double.**
Auction: 1♦ by partner, (1♠) on your right.
Responder: ♠85 ♥KJ76 ♦942 ♣AQ53 (10 HCP, four hearts) → **Double** (negative: four hearts, 6+; a 2♥ bid instead would promise five hearts and 11+ in competition).
Opener: ♠A4 ♥Q853 ♦AKJ65 ♣92 (14 HCP + 1 = 15) → 2♥. Responder: 3♥ (INV, 10–11). Opener: 4♥ (15 accepts).

**Example 6 — Weak two with the 2NT feature ask.**
Opener: ♠KQJ975 ♥84 ♦K52 ♣63 (9 HCP, good 6-card suit) → **2♠**.
Responder: ♠A3 ♥AK65 ♦A976 ♣854 (15 HCP) → 2NT (forcing, game interest).
Opener: 3♦ (maximum, 9–11, diamond feature). Responder: 4♠. With a minimum (5–8) opener would have rebid 3♠, and responder would pass.

---

## 20. Forcing Index (quick reference)

| Call | Status |
|---|---|
| Single raise / jump raise / game raise of a suit (uncontested) | NF (6–10) / INV limit (10–11) / S-O preemptive (1M–4M) |
| Jacoby 2NT response to 1♥/1♠ | GF raise, 13+ dummy points |
| 3NT response to 1♥/1♠ | 15–17 bal., 2-card support; opener places |
| New suit by unpassed responder | Forcing 1 round (fourth suit may be artificial) |
| Two-over-one response | Forcing; 10+; responder promises a rebid |
| Responder's new suit after opener's 1NT rebid | **NF** at the cheapest level; jump shift/reverse = GF |
| Jump shift by responder | GF, slam invite (~17+) |
| 2NT / 3NT responses to 1♣/1♦ | GF (13–15) / to play (16–18) |
| 1NT response to a major | NF (6–9) |
| Opener's lowest-level NT rebid | NF (13–15) |
| Opener's jump 2NT rebid | 18–19, near-forcing |
| Opener's non-reverse new suit | NF (13–18) |
| Opener's reverse | F 1 round (16–18+) |
| Opener's jump shift | GF (19+) |
| Opener's jump rebid of own suit | INV (16–18) |
| 2♣ opening | F; suit rebids force to 3M/4m; only 2NT (22–24) may be passed early |
| Positive responses to 2♣ | GF (8+, good 5-card suit / 8 bal.) |
| Weak twos; all raises of them | NF / to play ("RONF") |
| 2NT over partner's weak two | F, feature ask (even over interference) |
| New suit over partner's weak two / preempt (unpassed) | F 1 round, 5+ cards |
| Stayman 2♣ / transfers 2♦ 2♥ / relay 2♠ over 1NT | F 1 round (then per schedule) |
| 2NT; 3♣/3♦ over 1NT | INV |
| 3♥/3♠ over 1NT | GF, slam interest |
| 4NT over any natural NT | Quantitative INV |
| Jump to 4NT with a suit agreed | Blackwood (F) |
| Jump to 5NT (no 4NT first) | Grand Slam Force (F) |
| 4♣ over partner's 1NT/2NT (incl. rebids) | Gerber (F); but 4♣ over a 3NT *opening* = Stayman |
| Takeout / negative double | F on partner (advance with 0–8+) |
| Cue-bid of their suit by our side | F: quality-ask of an overcall; GF raise over their overcall; 12+ over their double... i.e., always the strong, forcing route |
| 2NT after their takeout double of our opening | Limit raise or better (10+) |
| Jump raise or jump shift after their takeout double | Preemptive, to play |
| Redouble after their takeout double | 10+ (descriptive bids preferred) |
| New suit by a passed hand | NF |
| Simple overcall; new-suit advance | NF / NF-constructive |
| Michaels / Unusual 2NT | F on advancer to choose; 2NT asks the minor after major-suit Michaels |

---

## 21. Opening-Bid Summary Card

| Opening | Meaning |
|---|---|
| 1♣ | 13–21, 3+ clubs (3-3 minors → 1♣) |
| 1♦ | 13–21, 3+ diamonds (4+ except exactly 4=4=3=2) |
| 1♥ / 1♠ | 13–21, 5+ cards |
| 1NT | 15–17 balanced (5-card major/minor OK) |
| 2♣ | Artificial: 22+ or the playing equivalent |
| 2♦ / 2♥ / 2♠ | Weak: 5–11 HCP, good 6-card suit |
| 2NT | 20–21 balanced |
| 3 of a suit | Preempt: good 7-card suit (rule of 2-3-4) |
| 3NT | 25–27 balanced |
| 4 of a suit | Preempt: 8-card suit |

**Balanced ladder:** 13–15 open a suit → lowest NT rebid; 15–17 open 1NT; 18–19 open a suit → jump 2NT; 20–21 open 2NT; 22–24 open 2♣ → 2NT; 25–27 open 3NT; 28+ open 2♣ → 3NT+.

---

## 22. Teaching Notes: Common Student Errors

1. **Passing a forcing bid** — drill §20; "new suit by an unpassed responder = forcing" prevents most accidents, and the two big exceptions (after opener's 1NT rebid; by a passed hand) deserve their own drill.
2. **Wrong raise arithmetic** — dummy points, not length points, when raising; 3+ trumps for major raises; four to raise 1♦, five to raise 1♣.
3. **Treating two-over-one as game-forcing** — it is 10+, forcing once, and *promises a rebid*.
4. **Believing SAYC lacks Jacoby 2NT** — the 2006 booklet includes it over majors (2NT to a *minor* stays natural 13–15).
5. **Using 4NT as Blackwood over notrump** — over natural NT it is quantitative; aces are asked with Gerber 4♣ (but over a 3NT *opening*, 4♣ is Stayman).
6. **Bidding a longer minor before a 4-card major, or skipping up-the-line order.**
7. **Direct 1M–4M with a strong hand** — the direct game raise is weak; strong raises go via Jacoby 2NT.
8. **Negative-double promises** (1m–(1♥)–X = exactly four spades; 1♠ = five; a 2-level major in competition = 11+ and five cards).
9. **Showing a weak-two feature on a minimum** — features show only with 9–11; and with a maximum but no feature, the official rebid is 3NT.
10. **Misdefining the reverse** — the *second* suit must outrank the *first*; 1♠ then 2♥ is not a reverse.
11. **Playing transfers over a 1NT overcall** — officially only 2♣ Stayman applies there.
12. **Forgetting that interference cancels non-competitive conventions** (Jacoby 2NT, transfers over a doubled 1NT excepted — over a double, 1NT systems stay on).

*End of reference. Everything unmarked follows the ACBL SAYC System Booklet (revised January 2006) and yellow card; **[standard practice]** marks default fill-ins where they are silent. When a question falls outside both, answer from general Standard American logic and say so explicitly.*
