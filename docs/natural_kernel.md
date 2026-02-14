# Natural Bidding Kernel (NBK)

## 1. System Overview

The NBK operates on a **Priority-Based Heuristic** model. Unlike rigid state machines that hard-code every sequence (e.g., `1H - 1S - 2D`), the NBK evaluates the current hand against two primary protocols:

1. **Discovery Protocol:** Used to introduce new strains (suits) and force the auction to continue.
2. **Limit Protocol:** Used to define the hand's total value relative to a known strain (suit fit or No Trump).

The NBK is designed to respond to the auction state at the start of every turn. All opening bids are handled by specific conventions outside of the NBK.

## 2. State Management

### 2.1. Hand Model (`HandModel`)

This object is derived from the caller's hand.

- **`HCP` (High Card Points):** A = 4, K = 3, Q = 2, J = 1.
- **`Lengths`:** Length of each suit (e.g., `{Spades: 5, Hearts: 3...}`).
- **`Shape`:** Enum [`Balanced`, `SemiBalanced`, `Unbalanced`].
  - _Definition:_ `Balanced` = No singletons, no voids, max one doubleton.

### 2.2. Partner Model (`PartnerModel`)

This object is derived from the auction state and represents the partner's contribution to the auction.

- **`MinLengths`**: The minimum length partner has shown in each suit in the auction.
- **`MinHCP`**: The lower bound on the number of HCP partner has shown in the auction, if any.
- **`MaxHCP`**: The upper bound on the number of HCP partner has shown in the auction, if any.

### 2.3. Auction Model (`AuctionModel`)

This object is derived from the auction state and represents constraints on the auction.

- **`IsForcing`**: Boolean. True if the previous bid demands a response (e.g., New Suit by opener).

---

## 3. Point Ranges

### 3.1. Suited Bids

To make a suited bid at a given level, caller and partner must have at least the points shown in the table below.

| Level | Points |
| ----- | ------ |
| 1     | 16     |
| 2     | 19     |
| 3     | 22     |
| 4     | 25     |
| 5     | 28     |
| 6     | 33     |
| 7     | 37     |

### 3.2. Notrump Bids

To make a notrump bid at a given level, caller and partner must have at least the points shown in the table below.

| Level | Points |
| ----- | ------ |
| 1     | 19     |
| 2     | 22     |
| 3     | 25     |
| 4     | 28     |
| 5     | 30     |
| 6     | 33     |
| 7     | 37     |

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
2. **Not Partner's Suit:** It is not a suit partner has shown length in.
3. **Level Safety:** You possess the HCP to bid at the required level.
4. **Priority:**
  - Bid **Longest** suit first.
  - If equal length (5-5), bid **Higher Ranking** suit.
  - If equal length (4-4), bid **Lower Ranking** suit (up-the-line).

### 4.2. Protocol B: The Limit Protocol (Non-Forcing / Invitational)

- **Objective:** Define the final contract level.
- **Semantic Meaning:** "I am describing my exact strength relative to our known (or implied) fit."
- **Forcing Status:** **Not Forcing** (unless the bid is a "Game Force" convention).

**Logic Implementation:**
Determine the **Target Level** by summing `Hand.HCP + Partner.MinHCP`:

- **< 25:** Partscore Zone
- **25–29:** Game Zone
- **30+:** Slam Zone

Select the bid that matches the zone:

**B1. The Support Limit (We have a fit)**

- _Weak:_ Raise to Level 2 (e.g., `1H` -> `2H`).
- _Invitational:_ Jump Raise to Level 3 (e.g., `1H` -> `3H`).
- _Game:_ Raise to Game (e.g., `1H` -> `4H`).

**B2. The No-Trump Limit (We have no fit + Balanced or SemiBalanced Hand)**

- _Weak:_ Bid `1NT`.
- _Invitational:_ Bid `2NT` (requires stoppers in unbid suits).
- _Game:_ Bid `3NT`.

**B3. The Rebid Limit (Self-Sufficient Suit)**

- _Condition:_ You have a 6+ card suit and no fit with partner.
- _Weak:_ Rebid suit at minimum level.
- _Invitational:_ Jump rebid suit.

---

## 5. Execution Flow & Conflict Resolution

When the engine runs, it will often find multiple valid bids. It must select one based on the **Hierarchy of Objectives**.

**The Priority Stack:**

1. **Primary:** **Support Majors.** (If 8-card Major fit found, `Limit Protocol` takes absolute precedence).
2. **Secondary:** **Show Major Length.** (If no fit, `Discovery Protocol` on Major suits takes precedence).
3. **Tertiary:** **Show Strength.** (If no Major actions available, fallback to `Limit Protocol` in NT or `Discovery` in Minor).
