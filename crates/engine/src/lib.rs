mod dsl;
mod kernel;
mod rules;

pub use kernel::{select_bid, select_bid_with_trace};
pub use kernel::{AuctionModel, BidTrace, CallSemantics, HandConstraint, HandModel};

use serde::Serialize;
use types::auction::Auction;
use types::board::Position;
use types::call::Call;
use types::io::identifier;

#[derive(Serialize)]
pub struct CallInterpretation {
    pub call_name: String,
    pub rule_name: String,
    pub description: String,
}

/// Parse a comma-separated call string (e.g. "1C,P,1D") into a Vec<Call>.
pub fn parse_calls(calls_string: &str) -> Vec<Call> {
    if calls_string.is_empty() {
        return Vec::new();
    }
    calls_string
        .split(',')
        .filter_map(|s| s.trim().parse::<Call>().ok())
        .collect()
}

/// Given a call history string, dealer position, and vulnerability, return
/// possible next calls with their interpretations from the Kernel bidding system.
pub fn get_interpretations(
    calls_string: &str,
    dealer: &str,
    _vulnerability: &str,
) -> Vec<CallInterpretation> {
    let dealer_pos = dealer
        .chars()
        .next()
        .and_then(Position::from_char)
        .unwrap_or(Position::North);
    let mut auction = Auction::new(dealer_pos);
    for call in parse_calls(calls_string) {
        auction.add_call(call);
    }

    let auction_model = kernel::AuctionModel::from_auction(&auction);

    let mut legal_calls = auction.legal_calls();
    legal_calls.sort();

    legal_calls
        .into_iter()
        .map(|call| {
            let semantics = kernel::CallInterpreter::interpret(&auction_model, &call);
            let description = if let Some(semantics) = &semantics {
                let mut bidder_hand = auction_model.bidder_hand().clone();
                for constraint in &semantics.shows {
                    bidder_hand.apply_constraint(*constraint);
                }
                bidder_hand.to_string()
            } else {
                String::new()
            };
            CallInterpretation {
                call_name: call.render(),
                rule_name: semantics
                    .as_ref()
                    .map(|s| s.rule_name.clone())
                    .unwrap_or_default(),
                description,
            }
        })
        .collect()
}

/// Receives a board and auction state in the "identifier" format
/// and returns the next bid as a call string.
/// Uses the SAYC bidding engine.
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

    // Use Kernel bidding logic
    match kernel::select_bid(hand, &auction) {
        Some(call) => call.render(),
        None => "P".to_string(),
    }
}

/// Like get_next_bid, but returns the bid along with its rule name and description.
pub fn get_suggested_bid(identifier: &str) -> CallInterpretation {
    let (board, auction) = match identifier::import_board(identifier) {
        Some(val) => val,
        None => {
            return CallInterpretation {
                call_name: "P".into(),
                rule_name: String::new(),
                description: String::new(),
            }
        }
    };

    let auction = auction.unwrap_or_else(|| Auction::new(board.dealer));

    let current_player = auction.current_player();
    let hand = match board.hands.get(&current_player) {
        Some(h) => h,
        None => {
            return CallInterpretation {
                call_name: "P".into(),
                rule_name: String::new(),
                description: String::new(),
            }
        }
    };

    let trace = kernel::select_bid_with_trace(hand, &auction);
    match trace.selected_call {
        Some(call) => {
            let step = trace
                .selection_steps
                .iter()
                .find(|s| s.satisfied && Some(s.call) == trace.selected_call)
                .expect("No satisfied step found for selected call");

            let mut bidder_hand = trace.auction_model.bidder_hand().clone();
            for constraint in &step.semantics.shows {
                bidder_hand.apply_constraint(*constraint);
            }

            CallInterpretation {
                call_name: call.render(),
                rule_name: step.semantics.rule_name.clone(),
                description: bidder_hand.to_string(),
            }
        }
        None => {
            let auction_model = kernel::AuctionModel::from_auction(&auction);
            CallInterpretation {
                call_name: "P".into(),
                rule_name: "Pass (Limit)".into(),
                description: auction_model.bidder_hand().to_string(),
            }
        }
    }
}

pub fn generate_filtered_board(_deal_type: &str) -> String {
    let mut rng = rand::thread_rng();
    let board_number = rand::Rng::gen_range(&mut rng, 1..=16);
    let board = generate_random_board(board_number, &mut rng);
    identifier::export_board(&board, board_number, None)
}

pub fn generate_random_board(board_number: u32, rng: &mut impl rand::Rng) -> types::board::Board {
    use rand::seq::SliceRandom;
    use std::collections::HashMap;
    use types::card::Card;
    use types::hand::Hand;
    use types::rank::Rank;
    use types::suit::Suit;

    let mut deck = Vec::with_capacity(52);
    for suit in Suit::ALL {
        for rank in Rank::ALL {
            deck.push(Card::new(suit, rank));
        }
    }
    deck.shuffle(rng);

    let mut hands = HashMap::new();
    let positions = [
        Position::North,
        Position::East,
        Position::South,
        Position::West,
    ];
    for (i, chunk) in deck.chunks(13).enumerate() {
        hands.insert(positions[i], Hand::new(chunk.to_vec()));
    }

    types::board::Board {
        dealer: Position::dealer_from_board_number(board_number),
        vulnerability: types::board::Vulnerability::from_board_number(board_number),
        hands,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use types::call::Call;
    use types::strain::Strain;

    #[test]
    fn test_parse_calls_empty() {
        let calls = parse_calls("");
        assert!(calls.is_empty());
    }

    #[test]
    fn test_parse_calls_single() {
        let calls = parse_calls("1C");
        assert_eq!(calls.len(), 1);
        assert!(matches!(
            calls[0],
            Call::Bid {
                level: 1,
                strain: Strain::Clubs
            }
        ));
    }

    #[test]
    fn test_parse_calls_multiple() {
        let calls = parse_calls("1C,P,1D");
        assert_eq!(calls.len(), 3);
        assert!(matches!(
            calls[0],
            Call::Bid {
                level: 1,
                strain: Strain::Clubs
            }
        ));
        assert!(matches!(calls[1], Call::Pass));
        assert!(matches!(
            calls[2],
            Call::Bid {
                level: 1,
                strain: Strain::Diamonds
            }
        ));
    }

    #[test]
    fn test_parse_calls_with_whitespace() {
        let calls = parse_calls("1C, P, 1D");
        assert_eq!(calls.len(), 3);
    }

    #[test]
    fn test_parse_calls_skips_invalid() {
        let calls = parse_calls("1C,INVALID,P");
        assert_eq!(calls.len(), 2);
    }

    #[test]
    fn test_generate_random_board_has_four_hands() {
        let mut rng = rand::thread_rng();
        let board = generate_random_board(1, &mut rng);
        assert_eq!(board.hands.len(), 4);
        for hand in board.hands.values() {
            assert_eq!(hand.cards.len(), 13);
        }
    }

    #[test]
    fn test_generate_random_board_dealer_matches_board_number() {
        let mut rng = rand::thread_rng();
        for board_number in 1..=4 {
            let board = generate_random_board(board_number, &mut rng);
            assert_eq!(
                board.dealer,
                Position::dealer_from_board_number(board_number)
            );
        }
    }

    #[test]
    fn test_generate_random_board_all_52_cards() {
        let mut rng = rand::thread_rng();
        let board = generate_random_board(1, &mut rng);
        let total_cards: usize = board.hands.values().map(|h| h.cards.len()).sum();
        assert_eq!(total_cards, 52);
    }

    #[test]
    fn test_get_next_bid_with_valid_identifier() {
        // Generate a board and export it to get a valid identifier.
        let mut rng = rand::thread_rng();
        let board = generate_random_board(1, &mut rng);
        let id = identifier::export_board(&board, 1, None);
        let result = get_next_bid(&id);
        // Should return a valid call string (not empty).
        assert!(!result.is_empty());
    }

    #[test]
    fn test_get_next_bid_invalid_identifier() {
        let result = get_next_bid("garbage");
        assert_eq!(result, "P");
    }

    #[test]
    fn test_generate_filtered_board_returns_valid_identifier() {
        let id = generate_filtered_board("any");
        // Identifier format: "<board_number>-<26 hex chars>"
        assert!(id.contains('-'));
        let parts: Vec<&str> = id.split('-').collect();
        assert_eq!(parts.len(), 2);
        // Board number should be parseable.
        let _board_number: u32 = parts[0].parse().expect("board number should be a u32");
        // Hex deal should be 26 characters.
        assert_eq!(parts[1].len(), 26);
    }

    #[test]
    fn test_get_interpretations_empty_auction() {
        let results = get_interpretations("", "N", "None");
        // With no calls yet, all opening bids + pass should be available.
        assert!(!results.is_empty());
        // Pass should always be a legal call.
        assert!(results.iter().any(|r| r.call_name == "P"));
        // 1C should be a legal opening bid.
        assert!(results.iter().any(|r| r.call_name == "1C"));
        // Every result should have a call_name.
        for r in &results {
            assert!(!r.call_name.is_empty());
        }
    }

    #[test]
    fn test_get_interpretations_after_opening() {
        let results = get_interpretations("1C", "N", "None");
        // After 1C, the next player (East) should have legal responses.
        assert!(!results.is_empty());
        // Pass is always legal.
        assert!(results.iter().any(|r| r.call_name == "P"));
        // 1C should NOT be legal (can't bid at or below the current level in same strain).
        assert!(!results.iter().any(|r| r.call_name == "1C"));
    }

    #[test]
    fn test_get_interpretations_default_dealer() {
        // Invalid dealer string should default to North.
        let results = get_interpretations("", "Z", "None");
        assert!(!results.is_empty());
    }

    #[test]
    fn test_get_interpretations_has_rule_names() {
        let results = get_interpretations("", "N", "None");
        // At least some opening bids should have rule names from the bidding system.
        let with_rules: Vec<_> = results.iter().filter(|r| !r.rule_name.is_empty()).collect();
        assert!(
            !with_rules.is_empty(),
            "Expected some calls to have rule_name interpretations"
        );
    }

    #[test]
    fn test_get_suggested_bid_valid_identifier() {
        let mut rng = rand::thread_rng();
        let board = generate_random_board(1, &mut rng);
        let id = identifier::export_board(&board, 1, None);
        let result = get_suggested_bid(&id);
        // Should return a non-empty call name.
        assert!(!result.call_name.is_empty());
        // Should have a rule name (either a matched rule or "Pass (Limit)").
        assert!(!result.rule_name.is_empty());
        // Should have a description.
        assert!(!result.description.is_empty());
    }

    #[test]
    fn test_get_suggested_bid_invalid_identifier() {
        let result = get_suggested_bid("garbage");
        assert_eq!(result.call_name, "P");
        assert!(result.rule_name.is_empty());
        assert!(result.description.is_empty());
    }

    #[test]
    fn test_get_suggested_bid_matches_get_next_bid() {
        // The suggested bid's call_name should match get_next_bid for the same identifier.
        let mut rng = rand::thread_rng();
        let board = generate_random_board(1, &mut rng);
        let id = identifier::export_board(&board, 1, None);
        let next = get_next_bid(&id);
        let suggested = get_suggested_bid(&id);
        assert_eq!(suggested.call_name, next);
    }
}
