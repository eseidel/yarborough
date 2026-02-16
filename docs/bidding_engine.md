# Design Document: Bridge Bidding Engine (Web/WASM)

**Version:** 1.0
**Target Platform:** WebAssembly (Rust)
**Primary Goal:** To create a performant, explainable, and rigorous bridge bidding engine supporting SAYC and 2/1 Game Force systems.

## 1. Architectural Overview

The engine utilizes a **Hybrid Constraint-Based Architecture**. It rejects the traditional "decision tree" model in favor of a data-driven approach where bids are defined as **Variants** composed of **Constraints**.

The system operates in three layers:

1. **The Context Manager:** Determines which set of rules (Opening, Response, Competitive) is currently active based on the auction history.
2. **The Constraint Solver:** Filters the active rules against the user's hand to find valid legal calls.
3. **The Valuation Fallback:** If no specific convention applies, it uses heuristics (Law of Total Tricks) or Double Dummy Simulation to determine the optimal "Natural" bid.

## 2. Core Data Structures

### 2.1 The Bid Rule Schema (JSON/YAML)

A `BidRule` does not represent a single logic path. It represents a **Call** (e.g., "1 Spade") that contains multiple **Variants** (logic paths).

```rust
// Conceptual Schema
struct BidRule {
    call: String,           // e.g., "1S", "2H", "Dbl"
    type: String,           // e.g., "Opening", "Overcall", "Response"
    variants: Vec<Variant>  // The "OR" logic paths
}

struct Variant {
    name: String,           // e.g., "Standard 5-card", "Weak Michaels"
    priority: u8,           // Higher checks first (100 > 1). Used for exceptions.
    description: String,    // Human-readable explanation for UI.
    constraints: Vec<Constraint> // All must be TRUE (AND logic)
}

enum Constraint {
    MinHCP(u8),
    MaxHCP(u8),
    MinLength { suit: Suit, count: u8 },
    ExactShape { distribution: [u8; 4] }, // e.g., [4, 4, 3, 2]
    SuitQuality { suit: Suit, quality: Quality }, // e.g., "Good" (2 of top 3)
    IsBalanced,
    Stopper { suit: Suit }
}

```

### 2.2 The Hand & History

```rust
struct Hand {
    cards: [Card; 13],
    hcp: u8,
    distribution: [u8; 4], // Spades, Hearts, Diamonds, Clubs
}

struct AuctionHistory {
    calls: Vec<Call>,
    vulnerability: Vulnerability,
    dealer: Position,
}

```

---

## 3. The Solver Logic (The Brain)

The solver does **not** traverse a tree. It iterates through the `BidRule` list provided by the Context Manager.

### Algorithm: `get_best_bid(hand, context_rules)`

1. **Initialize Candidates:** Create an empty list `valid_bids`.
2. **Iterate Rules:** For each `BidRule` in `context_rules`:

- **Sort Variants:** Sort `variants` by `priority` (Descending).
- **Check Variants:**
  - For each `Variant`:
    - Check if `hand` satisfies _all_ `constraints`.
- **Optimization:** If a high-priority variant matches, stop checking lower-priority variants for _this specific bid_.
- **Store Match:** If a variant matches, push `(Bid, Variant, Score)` to `valid_bids`.

3. **Selection:**

- If `valid_bids` is empty -> Trigger **Natural Fallback** (Section 5).
- If `valid_bids` has items -> Return the one with the highest `Variant.priority`.

---

## 4. The Context Manager (State Machine)

The engine must know _which_ rules to load. The `ContextManager` analyzes the `AuctionHistory` to determine the current state.

**State Definitions:**

- `Context::Opening`: No bids yet (or all Pass). -> Load `rules/opening.json`
- `Context::Response`: Partner opened, RHO (Right Hand Opponent) passed. -> Load `rules/responses.json`
- `Context::Overcall`: RHO opened. -> Load `rules/competitive.json`
- `Context::Balancing`: Auction is about to pass out. -> Load `rules/balancing.json`

**Implementation Note:**
The Context Manager acts as the **Filter** for the Solver. It prevents the engine from checking "Response to 1NT" rules when the auction is actually in "Opening" phase.

---

## 5. Handling Complex & "Tricky" Bids

### 5.1 The "Non-Convexity" Problem (e.g., Michael's Cue Bid)

**Problem:** A bid represents two disjoint hand types (Weak OR Strong).
**Solution:** Use **Multiple Variants**.

- Define `Variant A` (Weak): Constraints `HCP < 10` AND `5-5 Majors`.
- Define `Variant B` (Strong): Constraints `HCP > 16` AND `5-5 Majors`.
- _Note:_ The gap (11-15 HCP) is naturally excluded. If the hand falls in the gap, no variant matches, and the solver moves to the next bid (e.g., Simple Overcall).

### 5.2 The "Exception" Problem (e.g., 1D on 3 cards)

**Problem:** A bid usually implies X, but strictly implies Y in rare cases.
**Solution:** Use **Priority Ordering**.

- **Variant 1 (Priority 100):** "Natural Diamond". Requires `Length >= 4`.
- **Variant 2 (Priority 50):** "Stuck 1D". Requires `Length == 3` AND `Shape == 4-4-3-2` AND `HCP in [12, 21]`.
- _Logic:_ The solver checks Variant 1 first. If it fails (hand has 3 diamonds), it checks Variant 2. If that succeeds, it returns the bid with the description: _"Forced 1D bid (4-4-3-2 shape)."_

---

## 6. The Natural Bidding Fallback

When the defined `BidRules` are exhausted (no convention applies), the engine switches to **Evaluation Mode**.

### 6.1 The Interface

```rust
trait NaturalEvaluator {
    fn evaluate(hand: &Hand, history: &AuctionHistory) -> Call;
}

```

### 6.2 Implementation Strategy

1. **Candidate Generation:** Generate logical natural bids (Pass, Raise Partner, Bid Own Suit, Bid NT).
2. **Heuristic: Law of Total Tricks (LOTT):**

- Calculate `Total Trumps` = (My Suit Length + Partner's Estimated Length).
- Calculate `Safe Level` = `Total Trumps - 6`.
- Adjust for `Combined HCP` (e.g., if HCP > 25, force Game).

3. **Simulation (Advanced/Optional):**

- Generate 20 valid hands for the other 3 players consistent with `AuctionHistory`.
- Solve Double Dummy for all candidates.
- Pick the bid with the highest expected IMP/Matchpoint score.

---

## 7. Technical Implementation Guide (Rust/WASM)

### 7.1 Crate Structure

- `types`: Basic types (`Card`, `Suit`, `Hand`).
- `engine`: The logic engine (`Solver`, `ContextManager`, `Evaluator`).
- `wasm`: The `wasm-bindgen` interface exposing the `get_best_bid` function to JavaScript.

### 7.2 Integration Steps for the Coding Agent

1. **Phase 1: Structs & Parsing:** Implement `BidRule` and `Variant` structs using `serde`. Create a sample `opening.json`.
2. **Phase 2: The Constraint Engine:** Implement the `matches()` function for `Constraint`. Write unit tests for checking HCP ranges and shape distributions.
3. **Phase 3: The Solver Loop:** Implement `get_best_bid`. Test it against the "1D Exception" scenario.
4. **Phase 4: Context Logic:** Implement basic state detection (Opening vs. Response).
5. **Phase 5: Natural Fallback:** Implement a basic LOTT heuristic.

## 8. Requirements Checklist

- [ ] **Strictness:** Engine must never make an illegal bid (e.g., responding to Blackwood without Aces).
- [ ] **Explainability:** Returns _why_ a bid was chosen (e.g., "Matched Variant: Weak Michaels").
- [ ] **Performance:** `get_best_bid` must return in < 50ms via WASM.
- [ ] **Extensibility:** Adding "2/1 Game Force" should only require adding a `2over1.json` rule file, not recompiling code.
