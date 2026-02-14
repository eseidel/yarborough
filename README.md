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
