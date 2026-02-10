use bridge_core::auction::Auction;
use bridge_core::io::identifier;
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
pub struct CallInterpretation {
    pub call_name: String,
    pub rule_name: String,
    pub description: String,
}

/// Given a call history string and dealer position, return possible next calls
/// with their interpretations.
///
/// This is a stub — it returns hardcoded data regardless of input.
/// The real bidding engine will replace this logic.
#[wasm_bindgen]
pub fn get_interpretations(calls_string: &str, dealer: &str) -> JsValue {
    let _ = (calls_string, dealer); // suppress unused warnings

    let interpretations = vec![
        CallInterpretation {
            call_name: "Pass".into(),
            rule_name: "Pass".into(),
            description: "Nothing to say".into(),
        },
        CallInterpretation {
            call_name: "1C".into(),
            rule_name: "Opening 1\u{2663}".into(),
            description: "12-21 HCP, 3+ clubs".into(),
        },
        CallInterpretation {
            call_name: "1D".into(),
            rule_name: "Opening 1\u{2666}".into(),
            description: "12-21 HCP, 3+ diamonds".into(),
        },
        CallInterpretation {
            call_name: "1H".into(),
            rule_name: "Opening 1\u{2665}".into(),
            description: "12-21 HCP, 5+ hearts".into(),
        },
        CallInterpretation {
            call_name: "1S".into(),
            rule_name: "Opening 1\u{2660}".into(),
            description: "12-21 HCP, 5+ spades".into(),
        },
        CallInterpretation {
            call_name: "1N".into(),
            rule_name: "Opening 1NT".into(),
            description: "15-17 HCP, balanced".into(),
        },
        CallInterpretation {
            call_name: "2C".into(),
            rule_name: "Strong 2\u{2663}".into(),
            description: "22+ HCP or 9+ tricks".into(),
        },
    ];

    serde_wasm_bindgen::to_value(&interpretations).unwrap()
}

mod engine;
mod schema;

use engine::Engine;
use schema::System;

/// Receives a board and auction state in the "identifier" format
/// and returns the next bid.
/// Uses the SAYC bidding engine.
#[wasm_bindgen]
pub fn get_next_bid(identifier: &str) -> String {
    let (board, auction) = match identifier::import_board(identifier) {
        Some(val) => val,
        None => return "P".to_string(), // Fallback for invalid input
    };

    let auction = auction.unwrap_or_else(|| {
        // If no auction in identifier, create one from the dealer (derived from board number)
        Auction::new(board.dealer)
    });

    let current_player = auction.current_player();
    let hand = match board.hands.get(&current_player) {
        Some(h) => h,
        None => return "P".to_string(), // Should not happen if board is valid
    };

    // Load constraints
    let yaml_data = include_str!("rules/sayc.yaml");
    let system: System = serde_yaml::from_str(yaml_data).expect("Failed to parse SAYC rules");
    let engine = Engine::new(system);

    match engine.get_best_bid(hand, &auction) {
        Some((call, _variant)) => {
            // We could return variant info too if we change the return type to JsValue
            call.render()
        }
        None => {
            // Fallback: mostly pass if no rule matches
            "P".into()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_next_bid() {
        // Board 1, all cards to North (00..00), no calls.
        // North has 40 HCP (all high cards).
        // SAYC "Strong 2C" rule requires 22+ HCP.
        assert_eq!(get_next_bid("1-00000000000000000000000000"), "2C");

        // Test a hand suitable for 1NT (15-17 HCP, balanced).
        // Let's modify the hex deal string slightly or mock it differently.
        // Or just rely on Board 1 for now ensuring engine is hooked up.

        // If the engine returns "P" for unknown situations (like passed hand or response):
        assert_eq!(get_next_bid("1-00000000000000000000000000:1C"), "P"); // We haven't implemented responses yet
    }
}
