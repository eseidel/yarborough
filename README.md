# Yarborough

A modern bridge bidding tool and tutor. Successor to [saycbridge](https://github.com/eseidel/saycbridge).

**Try it now:** https://eseidel.github.io/yarborough/

## Getting Started

### Prerequisites

To build and run this project, you will need:

- [Node.js](https://nodejs.org/) (Latest LTS recommended)
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/)

Note: `wasm-pack` is handled automatically as a development dependency via `pnpm install`.

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/eseidel/yarborough.git
   cd yarborough
   ```

2. Install JavaScript dependencies:

   ```bash
   pnpm install
   ```

### Running Locally

To start the development server (this will also build and watch the WASM engine):

```bash
pnpm dev
```

The application will be available at `http://localhost:5173`. Rust and YAML files in the `crates` directory will automatically trigger a WASM rebuild on change.

### Building for Production

To create a production build:

```bash
pnpm build
```

## Development Tools

### Bidding Debugger

The `bidding-debug` tool shows the complete bidding sequence for any board with detailed information about which rules fired and why. This is essential for:

- Understanding why the engine makes specific bids
- Debugging bidding logic and rule priorities
- Seeing which constraints are satisfied or failed
- Learning how the bidding system works

**Usage:**

```bash
# Show complete bidding sequence for a board
cargo run --bin bidding-debug -- "1-decde22e0d283f55b36244ab45"

# Show detailed trace for a specific bid (e.g., bid #3)
cargo run --bin bidding-debug -- "1-decde22e0d283f55b36244ab45" --bid 3
```

**Basic output includes:**

- Board details (dealer, vulnerability)
- All four hands displayed in a table
- Complete auction with rule names and descriptions

**Example:**

```
Idx | Pos | Call  | Rule Name                 | Description
----+-----+-------+---------------------------+---------------------------
1   | N   | 1N    | Opening 1NT               | 15-17 HCP, Balanced
2   | E   | Pass  | No rule matched           |
3   | S   | 2C    | Stayman (4S)              | 8+ HCP, 4 Spades
```

**Detailed trace (--bid flag) shows:**

- Partner profile (HCP range, suit lengths, stoppers inferred from prior bids)
- All rules considered, sorted by priority
- For each rule: which constraints passed (✓) or failed (✗)

This helps you understand exactly why a specific bid was chosen over alternatives.

### Bidder Comparison Tool

The `bidder_fight` tool compares the yarborough bidder against previous bidders (z3b or kbb) to find differences. This is useful for:

- Finding missing rules in yarborough
- Regression testing against established bidders
- Understanding where yarborough's bidding differs from z3b/kbb

**Usage:**

```bash
# Compare against z3b (default)
cargo run --bin bidder_fight

# Compare against kbb
cargo run --bin bidder_fight --kbb

# Test a specific board identifier
cargo run --bin bidder_fight 15-e46a3ab1d0b8664c5f053639cf
```

The tool will continuously generate random boards and report the first difference found on each board, including:

- Board identifier (for reproducing the scenario)
- Position and hand where the difference occurred
- Auction history up to that point
- Both bidders' suggested bids

**Example output:**

```
Difference found!
Board: 15-e46a3ab1d0b8664c5f053639cf
Position: West
Hand: J2.25T.TJ6.48KAJ
Auction so far: 1C
Remote bid: 1S
Yarborough bid: P
```
