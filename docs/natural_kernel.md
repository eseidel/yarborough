# Technical Specification: Natural Bidding Kernel (NBK)

## 1. System Overview

The NBK operates on a **Priority-Based Heuristic** model. Unlike rigid state machines that hard-code every sequence (e.g., `1H - 1S - 2D`), the NBK evaluates the current hand against two primary protocols:

1. **Discovery Protocol:** Used to introduce new strains (suits) and force the auction to continue.
2. **Limit Protocol:** Used to define the hand's total value relative to a known strain (suit fit or No Trump).

## 2. State Management

### 2.1. Hand Evaluation Object (`HandEval`)

This object is derived from the raw card data at the start of every turn.

- **`HCP` (High Card Points):** A = 4, K = 3, Q = 2, J = 1.
- **`Distribution`:** Map of `Suit -> Count` (e.g., `{Spades: 5, Hearts: 3...}`).
- **`Shape`:** Enum [`Balanced`, `SemiBalanced`, `Unbalanced`].
  - _Definition:_ `Balanced` = No singletons, no voids, max one doubleton.
- **`TotalPoints`:** `HCP` + Distribution Points (Shortage for suit contracts, Length for NT).

### 2.2. Auction State Object (`AuctionState`)

This object tracks the context of the bidding table.

- **`PartnerHasOpened`**: Boolean.
- **`PartnerSuit`**: The suit partner opened or showed length in (if any).
- **`WeHaveFit`**: Boolean. True if `PartnerLength + MyLength >= 8`.
- **`IsForcing`**: Boolean. True if the previous bid demands a response (e.g., New Suit by opener).
- **`MinimumPartnerPoints`**: Integer. Inferred minimum strength of partner (e.g., 12 if opener, 6 if responder).

---

## 3. Configuration Constants (Point Ranges)

These ranges are the "Standard American" defaults. They should be stored in a config file to allow for "2/1" or "Acol" toggling.

| Constant Name       | HCP Range | Description                                                                                      |
| ------------------- | --------- | ------------------------------------------------------------------------------------------------ |
| `RANGE_OPEN_MIN`    | 12        | Minimum to open the bidding.                                                                     |
| `RANGE_RESP_MIN`    | 6         | Minimum to respond to an opening.                                                                |
| `RANGE_NEW_SUIT_L1` | 6+        | Points required to bid a new suit at the 1-level.                                                |
| `RANGE_NEW_SUIT_L2` | 10+       | Points required to bid a new suit at the 2-level (Natural). _Note: In 2/1, this becomes 12+ GF._ |
| `RANGE_LIMIT_WEAK`  | 6–9       | "Minimum" response (e.g., simple raise, 1NT).                                                    |
| `RANGE_LIMIT_INV`   | 10–11     | "Invitational" response (e.g., jump raise, 2NT).                                                 |
| `RANGE_LIMIT_GAME`  | 12–15     | "Game Forcing" response (e.g., game jump).                                                       |

---

## 4. The Logic Core: Two Protocols

The engine evaluates valid bids using the following logic flow:

1. **Check Discovery:** Can I show a new efficient suit?
2. **Check Limit:** Can I support partner or define my hand in NT?
3. **Selection:** Choose the bid that describes the hand most accurately without overstating values.

### 4.1. Protocol A: The Discovery Protocol (Forcing)

- **Objective:** Find a fit. Keep the auction alive.
- **Semantic Meaning:** "I have length in this suit (4+). I have not limited my hand strength yet."
- **Forcing Status:** **Forcing (1 Round).**

**Logic Implementation:**
Iterate through all 4 suits. A suit is a valid **Discovery Bid** if:

1. **Length:** You hold 4 cards in the suit.
2. **Not Partner's Suit:** It is not the suit partner bid.
3. **Level Safety:** You possess the HCP to bid at the required level:

- _1-Level:_ Requires `HCP >= RANGE_NEW_SUIT_L1` (6).
- _2-Level:_ Requires `HCP >= RANGE_NEW_SUIT_L2` (10).

4. **Priority:**

- Bid **Longest** suit first.
- If equal length, bid **Higher Ranking** suit (if 5-5).
- If equal length (4-4), bid **Cheaper** suit (up-the-line) to conserve space. _Exception: 4-4 Majors, bid Spades first in response._

### 4.2. Protocol B: The Limit Protocol (Non-Forcing / Invitational)

- **Objective:** Define the final contract level.
- **Semantic Meaning:** "I am describing my exact strength relative to our known (or implied) fit."
- **Forcing Status:** **Not Forcing** (unless the bid is a "Game Force" convention).

**Logic Implementation:**
Determine the **Target Level** by summing `MyTotalPoints + MinimumPartnerPoints`:

- **< 25 Points:** Partscore Zone (Level 1 or 2).
- **25–29 Points:** Game Zone (Level 3NT or 4Major).
- **30+ Points:** Slam Zone (Level 6 – _Out of scope for this spec_).

Select the bid that matches the zone:

**B1. The Support Limit (We have a fit)**

- _Weak (6-9):_ Raise to Level 2 (e.g., `1H` -> `2H`).
- _Invitational (10-11):_ Jump Raise to Level 3 (e.g., `1H` -> `3H`).
- _Game (12+):_ Raise to Game (e.g., `1H` -> `4H`).

**B2. The No-Trump Limit (We have no fit + Balanced Hand)**

- _Weak (6-9):_ Bid `1NT`.
- _Invitational (10-11):_ Bid `2NT` (requires stoppers in unbid suits).
- _Game (12-15):_ Bid `3NT`.

**B3. The Rebid Limit (Self-Sufficient Suit)**

- _Condition:_ You have a 6+ card suit and no fit with partner.
- _Weak:_ Rebid suit at minimum level.
- _Inv:_ Jump rebid suit.

---

## 5. Execution Flow & Conflict Resolution

When the engine runs, it will often find multiple valid bids. It must select one based on the **Hierarchy of Objectives**.

**The Priority Stack:**

1. **Primary:** **Support Majors.** (If 8-card Major fit found, `Limit Protocol` takes absolute precedence).
2. **Secondary:** **Show Major Length.** (If no fit, `Discovery Protocol` on Major suits takes precedence).
3. **Tertiary:** **Show Strength.** (If no Major actions available, fallback to `Limit Protocol` in NT or `Discovery` in Minor).

### Pseudocode Implementation

```python
def select_bid(hand, auction):
    # 1. SPECIAL CASE: Support Partner's Major (The "Golden Fit")
    if auction.partner_bid_major and hand.has_support(auction.partner_suit):
        return apply_limit_protocol(hand, suit=auction.partner_suit)

    # 2. DISCOVERY: Show a new 4+ card Major
    # (Standard American: Always show 4-card spades over 1H)
    for suit in [Spades, Hearts]:
        if hand.length(suit) >= 4 and is_legal_bid(suit, level=1):
            return Bid(suit, level=1, type="Forcing")

    # 3. LIMIT: Balanced Hand? (No fit, no major to show)
    if hand.is_balanced and not hand.is_opener:
        # Check HCP ranges for NT
        if 6 <= hand.hcp <= 9: return Bid("1NT", type="Limit")
        if 10 <= hand.hcp <= 11: return Bid("2NT", type="Limit") # Invite
        if 12 <= hand.hcp <= 15: return Bid("3NT", type="Limit") # Game

    # 4. DISCOVERY: Show Minor Suit (The "Fallback")
    # If we are here, we are unbalanced but have no major fit
    best_minor = hand.longest_suit([Diamonds, Clubs])
    if can_bid_at_current_level(best_minor):
        return Bid(best_minor, type="Forcing")

    # 5. DEFAULT: Pass
    return Bid("Pass")

```

## 6. Conventions Overlay (Extensibility)

This kernel is designed to be intercepted. The SAYC/2-over-1 engine should wrap this kernel:

1. **Check Convention Library:** (e.g., Is this a Jacoby 2NT situation? Is this a Strong 2 Club?)
2. **If Match:** Return Convention Bid.
3. **If No Match:** Execute **Natural Bidding Kernel** (above).

### Example: Implementing 2-Over-1 Game Force

The `2-over-1` system is simply a modification of the **Discovery Protocol** constraints:

- _Standard Rule:_ 2-level response requires 10+ HCP.
- _2/1 Rule:_ 2-level response requires 12+ HCP (and sets `GameForcing` state to TRUE).

By adjusting the `RANGE_NEW_SUIT_L2` constant and the `IsForcing` flag, the kernel adapts without code rewriting.
