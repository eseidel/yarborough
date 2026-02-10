use bridge_core::auction::Auction;
use bridge_core::call::Call;
use bridge_core::io::identifier;
use bridge_core::strain::Strain;
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

/// Receives a board and auction state in the "identifier" format
/// and returns the next bid. 
/// Dummy implementation: always returns the cheapest available non-pass, non-double call.
#[wasm_bindgen]
pub fn get_next_bid(identifier: &str) -> String {
    let (_, auction) = match identifier::import_board(identifier) {
        Some(val) => val,
        None => return "P".to_string(), // Fallback for invalid input
    };

    let auction = auction.unwrap_or_else(|| {
        // If no auction in identifier, create one from the dealer (derived from board number)
        let components: Vec<&str> = identifier.split('-').collect();
        let board_number: u32 = components[0].parse().unwrap_or(1);
        Auction::new(bridge_core::board::Position::dealer_from_board_number(board_number))
    });

    let last_bid = auction.calls.iter().rev().find_map(|c| match c {
        Call::Bid { level, strain } => Some((*level, *strain)),
        _ => None,
    });

    let next_call = match last_bid {
        None => Call::Bid {
            level: 1,
            strain: Strain::Clubs,
        },
        Some((level, strain)) => {
            let next_strain_idx = Strain::ALL.iter().position(|&s| s == strain).unwrap() + 1;
            if next_strain_idx < Strain::ALL.len() {
                Call::Bid {
                    level,
                    strain: Strain::ALL[next_strain_idx],
                }
            } else if level < 7 {
                Call::Bid {
                    level: level + 1,
                    strain: Strain::Clubs,
                }
            } else {
                Call::Pass
            }
        }
    };

    next_call.render()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_next_bid() {
        // Board 1, all cards to North, no calls. Next should be 1C.
        assert_eq!(get_next_bid("1-00000000000000000000000000"), "1C");
        
        // Last bid 1C -> 1D
        assert_eq!(get_next_bid("1-00000000000000000000000000:1C"), "1D");
        
        // Last bid 1S -> 1N
        assert_eq!(get_next_bid("1-00000000000000000000000000:1S"), "1N");
        
        // Last bid 1N -> 2C
        assert_eq!(get_next_bid("1-00000000000000000000000000:1N"), "2C");
        
        // Last bid 7N -> P (No more bids)
        assert_eq!(get_next_bid("1-00000000000000000000000000:7N"), "P");
        
        // Competitive auction
        assert_eq!(get_next_bid("1-00000000000000000000000000:1H,X,2H"), "2S");
    }
}
