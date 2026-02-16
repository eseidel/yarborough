// Type declarations for the wasm-pack generated wasm module.
// wasm-pack generates its own .d.ts but this ensures TS is happy
// before the first build.
declare module "../../crates/wasm/pkg/wasm" {
  export default function init(): Promise<void>;
  export function get_interpretations(
    calls_string: string,
    dealer: string,
  ): unknown;
  export function get_next_bid(identifier: string): string;
  export function get_suggested_bid(identifier: string): unknown;
  export function generate_filtered_board(deal_type: string): string;
}
