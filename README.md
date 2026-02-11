# Yarborough

A modern bridge bidding tool and tutor. Successor to [saycbridge](https://github.com/eseidel/saycbridge).

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
