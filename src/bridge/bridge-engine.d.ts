// Type declarations for the wasm-pack generated bridge-engine module.
// wasm-pack generates its own .d.ts but this ensures TS is happy
// before the first build.
declare module "../../crates/bridge-engine/pkg/bridge_engine" {
  export default function init(): Promise<void>;
  export function get_interpretations(
    calls_string: string,
    dealer: string,
  ): unknown;
  export function get_next_bid(identifier: string): string;
}
