use bridge_core::auction::Auction;
use bridge_core::board::Position;
use bridge_core::call::Call;
use bridge_core::io::identifier;
use serde::Serialize;
use wasm_bindgen::prelude::*;

mod engine;
mod schema;

use engine::Engine;
use schema::System;

#[derive(Serialize)]
pub struct CallInterpretation {
    pub call_name: String,
    pub rule_name: String,
    pub description: String,
}

/// Parse a comma-separated call string (e.g. "1C,P,1D") into a Vec<Call>.
fn parse_calls(calls_string: &str) -> Vec<Call> {
    if calls_string.is_empty() {
        return Vec::new();
    }
    calls_string
        .split(',')
        .filter_map(|s| Call::from_str(s.trim()))
        .collect()
}

fn load_engine() -> Engine {
    let yaml_data = include_str!("rules/sayc.yaml");
    let system: System = serde_yaml::from_str(yaml_data).expect("Failed to parse SAYC rules");
    Engine::new(system)
}

/// Given a call history string, dealer position, and vulnerability, return
/// possible next calls with their interpretations from the SAYC bidding system.
#[wasm_bindgen]
pub fn get_interpretations(calls_string: &str, dealer: &str, vulnerability: &str) -> JsValue {
    let dealer_pos =
        Position::from_char(dealer.chars().next().unwrap_or('N')).unwrap_or(Position::North);
    let _vulnerability = vulnerability; // Will be used when rules need it
    let calls = parse_calls(calls_string);

    let mut auction = Auction::new(dealer_pos);
    auction.calls = calls;

    let engine = load_engine();
    let interpretations: Vec<CallInterpretation> = engine
        .get_interpretations(&auction)
        .into_iter()
        .map(|interp| CallInterpretation {
            call_name: interp.call.render(),
            rule_name: interp.rule_name,
            description: interp.description,
        })
        .collect();

    serde_wasm_bindgen::to_value(&interpretations).unwrap()
}

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

    let engine = load_engine();

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

        // If the engine returns "P" for unknown situations (like passed hand or response):
        assert_eq!(get_next_bid("1-00000000000000000000000000:1C"), "P"); // We haven't implemented responses yet
    }

    #[test]
    fn test_parse_calls() {
        assert_eq!(parse_calls(""), Vec::new());
        assert_eq!(parse_calls("P"), vec![Call::Pass]);
        assert_eq!(
            parse_calls("1C,P"),
            vec![
                Call::Bid {
                    level: 1,
                    strain: bridge_core::strain::Strain::Clubs
                },
                Call::Pass,
            ]
        );
    }

    /// Helper: get call names from interpretations for a given auction state.
    fn interp_call_names(calls_string: &str, dealer: &str) -> Vec<String> {
        let dealer_pos =
            Position::from_char(dealer.chars().next().unwrap_or('N')).unwrap_or(Position::North);
        let calls = parse_calls(calls_string);

        let mut auction = Auction::new(dealer_pos);
        auction.calls = calls;

        let engine = load_engine();
        engine
            .get_interpretations(&auction)
            .into_iter()
            .map(|i| i.call.render())
            .collect()
    }

    #[test]
    fn test_get_interpretations_opening() {
        // With no history, returns all opening bids from SAYC rules
        let names = interp_call_names("", "N");
        assert!(names.contains(&"P".to_string()));
        assert!(names.contains(&"1C".to_string()));
        assert!(names.contains(&"1H".to_string()));
        assert!(names.contains(&"1N".to_string()));
        assert!(names.contains(&"2C".to_string()));
        // Weak twos should also be there
        assert!(names.contains(&"2D".to_string()));
        assert!(names.contains(&"2H".to_string()));
        assert!(names.contains(&"2S".to_string()));
        assert!(names.contains(&"2N".to_string()));
    }

    #[test]
    fn test_get_interpretations_filters_illegal_bids() {
        // After 1H, lower bids are excluded
        let names = interp_call_names("1H", "N");
        assert!(names.contains(&"P".to_string()));
        assert!(!names.contains(&"1C".to_string()));
        assert!(!names.contains(&"1D".to_string()));
        assert!(!names.contains(&"1H".to_string()));
        assert!(names.contains(&"1S".to_string()));
        assert!(names.contains(&"1N".to_string()));
        assert!(names.contains(&"2C".to_string()));
    }

    #[test]
    fn test_get_interpretations_after_bid() {
        // After an opening bid + response context, no response rules exist yet
        // so only Pass and legal bids with no rule info should appear
        let names = interp_call_names("1C", "N");
        assert!(names.contains(&"P".to_string()));
        // All higher bids are legal but won't have rule names
        assert!(names.contains(&"1D".to_string()));
        assert!(!names.contains(&"1C".to_string())); // Can't rebid 1C
    }

    #[test]
    fn test_get_interpretations_has_rule_names() {
        let dealer_pos = Position::North;
        let auction = Auction::new(dealer_pos);
        let engine = load_engine();
        let interps = engine.get_interpretations(&auction);

        // Opening 1C should have a rule name
        let one_club = interps.iter().find(|i| i.call.render() == "1C").unwrap();
        assert!(!one_club.rule_name.is_empty());
        assert!(!one_club.description.is_empty());
    }
}
