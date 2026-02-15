pub mod dsl;
pub mod nbk;
pub mod rules;

use bridge_core::auction::Auction;
use bridge_core::board::Position;
use bridge_core::call::Call;
use bridge_core::io::identifier;
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
pub struct CallInterpretation {
    pub call_name: String,
    pub rule_name: String,
    pub description: String,
}

/// Parse a comma-separated call string (e.g. "1C,P,1D") into a Vec<Call>.
#[allow(dead_code)]
fn parse_calls(calls_string: &str) -> Vec<Call> {
    if calls_string.is_empty() {
        return Vec::new();
    }
    calls_string
        .split(',')
        .filter_map(|s| s.trim().parse::<Call>().ok())
        .collect()
}

/// Given a call history string, dealer position, and vulnerability, return
/// possible next calls with their interpretations from the NBK bidding system.
#[wasm_bindgen]
pub fn get_interpretations(calls_string: &str, dealer: &str, _vulnerability: &str) -> JsValue {
    let dealer_pos = dealer
        .chars()
        .next()
        .and_then(Position::from_char)
        .unwrap_or(Position::North);
    let mut auction = Auction::new(dealer_pos);
    for call in parse_calls(calls_string) {
        auction.add_call(call);
    }

    let auction_model = nbk::AuctionModel::from_auction(&auction, auction.current_player());
    let menu = nbk::call_menu::CallMenu::from_auction_model(&auction_model);

    let mut items = Vec::new();
    for group in menu.groups {
        for item in group.items {
            items.push(item);
        }
    }

    items.sort_by_key(|item| item.call);

    let interpretations: Vec<CallInterpretation> = items
        .into_iter()
        .map(|item| CallInterpretation {
            call_name: item.call.render(),
            rule_name: item.semantics.rule_name,
            description: item.semantics.description,
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

    // Use NBK bidding logic
    match nbk::select_bid(hand, &auction, current_player) {
        Some(call) => call.render(),
        None => "P".to_string(),
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

    // Use NBK bidding logic with trace
    let trace = nbk::select_bid_with_trace(hand, &auction, current_player);
    let interpretation = match trace.selected_call {
        Some(call) => {
            let step = trace
                .selection_steps
                .iter()
                .find(|s| s.satisfied && Some(s.call) == trace.selected_call)
                .expect("No satisfied step found for selected call");
            CallInterpretation {
                call_name: call.render(),
                rule_name: step.semantics.rule_name.clone(),
                description: step.semantics.description.clone(),
            }
        }
        None => CallInterpretation {
            call_name: "P".into(),
            rule_name: "Pass (Limit)".into(),
            description: "No better bid found; passing as a limit bid".into(),
        },
    };

    serde_wasm_bindgen::to_value(&interpretation).unwrap()
}

#[wasm_bindgen]
pub fn generate_filtered_board(_deal_type: &str) -> String {
    let mut rng = rand::thread_rng();
    let board_number = rand::Rng::gen_range(&mut rng, 1..=16);
    let board = generate_random_board(board_number, &mut rng);
    identifier::export_board(&board, board_number, None)
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
