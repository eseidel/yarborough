use bridge_core::auction::Auction;
use bridge_core::board::Position;
use bridge_core::call::Call;
use bridge_core::io::identifier;
use serde::Serialize;
use wasm_bindgen::prelude::*;

pub mod engine;
pub mod inference;
pub mod schema;
pub mod trace;

pub use engine::Engine;
use schema::System;
use std::sync::OnceLock;

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
        .filter_map(|s| s.trim().parse::<Call>().ok())
        .collect()
}

pub fn load_engine() -> &'static Engine {
    static ENGINE: OnceLock<Engine> = OnceLock::new();
    ENGINE.get_or_init(|| {
        let mut system = System {
            opening: Vec::new(),
            responses: Vec::new(),
            natural: Vec::new(),
        };

        let shards = [
            include_str!("rules/openings.yaml"),
            include_str!("rules/notrump/stayman.yaml"),
            include_str!("rules/notrump/jacoby.yaml"),
            include_str!("rules/notrump/responses.yaml"),
            include_str!("rules/majors/raises.yaml"),
            include_str!("rules/majors/jacoby_2nt.yaml"),
            include_str!("rules/majors/responses.yaml"),
            include_str!("rules/majors/rebids.yaml"),
            include_str!("rules/minors/raises.yaml"),
            include_str!("rules/minors/responses.yaml"),
            include_str!("rules/minors/rebids.yaml"),
            include_str!("rules/preemptive/responses.yaml"),
            include_str!("rules/strong/responses.yaml"),
            include_str!("rules/natural/sound.yaml"),
            include_str!("rules/natural/law_of_total_tricks.yaml"),
        ];

        for shard in shards {
            let partial_system: System =
                serde_yaml::from_str(shard).expect("Failed to parse rule shard");
            system.merge(partial_system);
        }

        Engine::new(system)
    })
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
        Some((call, _variant)) => call.render(),
        None => "P".into(),
    }
}

/// Like get_next_bid, but returns the bid along with its rule name and description.
#[wasm_bindgen]
pub fn get_suggested_bid(identifier: &str) -> JsValue {
    let (board, auction) = match identifier::import_board(identifier) {
        Some(val) => val,
        None => {
            return serde_wasm_bindgen::to_value(&CallInterpretation {
                call_name: "P".into(),
                rule_name: String::new(),
                description: String::new(),
            })
            .unwrap()
        }
    };

    let auction = auction.unwrap_or_else(|| Auction::new(board.dealer));

    let current_player = auction.current_player();
    let hand = match board.hands.get(&current_player) {
        Some(h) => h,
        None => {
            return serde_wasm_bindgen::to_value(&CallInterpretation {
                call_name: "P".into(),
                rule_name: String::new(),
                description: String::new(),
            })
            .unwrap()
        }
    };

    let engine = load_engine();

    let interp = match engine.get_best_bid(hand, &auction) {
        Some((call, variant)) => CallInterpretation {
            call_name: call.render(),
            rule_name: variant.name,
            description: variant.description,
        },
        None => CallInterpretation {
            call_name: "P".into(),
            rule_name: "Pass".into(),
            description: String::new(),
        },
    };

    serde_wasm_bindgen::to_value(&interp).unwrap()
}

#[wasm_bindgen]
pub fn generate_filtered_board(deal_type: &str) -> String {
    let engine = load_engine();
    let mut rng = rand::thread_rng();

    for _ in 0..1000 {
        let board_number = rand::Rng::gen_range(&mut rng, 1..=16);
        let board = generate_random_board(board_number, &mut rng);

        if deal_type == "Random" {
            return identifier::export_board(&board, board_number, None);
        }

        if matches_deal_type(&board, deal_type, engine) {
            return identifier::export_board(&board, board_number, None);
        }
    }

    // Fallback to random if no match found
    let board_number = rand::Rng::gen_range(&mut rng, 1..=16);
    let board = generate_random_board(board_number, &mut rng);
    identifier::export_board(&board, board_number, None)
}

#[wasm_bindgen]
pub fn get_double_dummy_solution(identifier: &str) -> JsValue {
    let (board, _auction) = match identifier::import_board(identifier) {
        Some(val) => val,
        None => return JsValue::NULL,
    };

    let solution = bridge_solver::solve(&board);
    serde_wasm_bindgen::to_value(&solution).unwrap()
}

fn generate_random_board(board_number: u32, rng: &mut impl rand::Rng) -> bridge_core::board::Board {
    use bridge_core::card::Card;
    use bridge_core::hand::Hand;
    use bridge_core::rank::Rank;
    use bridge_core::suit::Suit;
    use rand::seq::SliceRandom;
    use std::collections::HashMap;

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

    bridge_core::board::Board {
        dealer: Position::dealer_from_board_number(board_number),
        vulnerability: bridge_core::board::Vulnerability::from_board_number(board_number),
        hands,
    }
}

fn matches_deal_type(board: &bridge_core::board::Board, deal_type: &str, engine: &Engine) -> bool {
    let mut auction = Auction::new(board.dealer);

    for _ in 0..4 {
        let current_player = auction.current_player();
        let hand = board.hands.get(&current_player).unwrap();
        let (call, _) = match engine.get_best_bid(hand, &auction) {
            Some((c, v)) => (c, v),
            None => (
                Call::Pass,
                schema::Variant {
                    name: "Pass".into(),
                    description: "".into(),
                    priority: 0,
                    constraints: vec![],
                },
            ),
        };

        if let Call::Bid { .. } = call {
            if current_player == Position::North || current_player == Position::South {
                let call_str = call.render();
                return match deal_type {
                    "Notrump" => call_str == "1N" || call_str == "2N",
                    "Strong2C" => call_str == "2C",
                    "Preempt" => {
                        (call_str.starts_with('2') && call_str != "2C" && call_str != "2N")
                            || (call_str.starts_with('3') && call_str != "3N")
                            || call_str.starts_with('4')
                            || call_str.starts_with('5')
                    }
                    _ => false,
                };
            } else {
                return false;
            }
        }

        auction.add_call(call);
    }
    false
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

    /// Helper: get a suggested bid interpretation for a given identifier (non-WASM version).
    fn suggest_bid(identifier: &str) -> (String, String, String) {
        let (board, auction) = identifier::import_board(identifier).unwrap();
        let auction = auction.unwrap_or_else(|| Auction::new(board.dealer));
        let current_player = auction.current_player();
        let hand = board.hands.get(&current_player).unwrap();
        let engine = load_engine();
        match engine.get_best_bid(hand, &auction) {
            Some((call, variant)) => (call.render(), variant.name, variant.description),
            None => ("P".into(), "Pass".into(), String::new()),
        }
    }

    #[test]
    fn test_get_suggested_bid() {
        // Board 1, all cards to North → 40 HCP → Strong 2C
        let (call, rule, desc) = suggest_bid("1-00000000000000000000000000");
        assert_eq!(call, "2C");
        assert!(!rule.is_empty());
        assert!(!desc.is_empty());

        // After an opening bid, no response rules → falls back to Pass
        let (call, rule, _) = suggest_bid("1-00000000000000000000000000:1C");
        assert_eq!(call, "P");
        assert_eq!(rule, "Pass");
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
