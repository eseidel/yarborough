# Yarborough

A modern bridge bidding tool and tutor. Successor to [saycbridge](https://github.com/eseidel/saycbridge).

## Getting Started

### Prerequisites

To build and run this project, you will need:

- [Node.js](https://nodejs.org/) (Latest LTS recommended)
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)

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

3. Build the WASM bridge engine:
   ```bash
   pnpm wasm:dev
   ```

### Running Locally

To start the development server:

```bash
pnpm dev
```

The application will be available at `http://localhost:5173`.

### Building for Production

To create a production build:

```bash
pnpm build
```
