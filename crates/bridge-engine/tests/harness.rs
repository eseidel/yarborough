use bridge_core::auction::Auction;
use bridge_core::board::{Board, Position, Vulnerability};
use bridge_core::call::Call;
use bridge_core::hand::Hand;
use bridge_core::io::identifier;
use bridge_core::rank::Rank;
use bridge_core::suit::Suit;
use bridge_engine::get_next_bid;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

fn parse_hand(s: &str) -> Hand {
    let suits: Vec<&str> = s.split('.').collect();
    let mut cards = Vec::new();
    let suit_order = [Suit::Clubs, Suit::Diamonds, Suit::Hearts, Suit::Spades];
    for (i, suit_str) in suits.iter().enumerate() {
        let suit = suit_order[i];
        for c in suit_str.chars() {
            if let Some(rank) = Rank::from_char(c) {
                cards.push(bridge_core::card::Card { suit, rank });
            }
        }
    }
    Hand { cards }
}

fn parse_auction(history: &str, dealer: Position) -> Auction {
    let mut auction = Auction::new(dealer);
    if history.trim().is_empty() {
        return auction;
    }
    for call_str in history.split_whitespace() {
        if let Ok(call) = call_str.parse::<Call>() {
            auction.add_call(call);
        }
    }
    auction
}

fn create_dummy_full_deal(h: &Hand, pos: Position) -> HashMap<Position, Hand> {
    let mut hands = HashMap::new();
    hands.insert(pos, h.clone());

    // Fill other hands with remaining cards
    let mut used_cards = std::collections::HashSet::new();
    for card in &h.cards {
        used_cards.insert(*card);
    }

    let mut remaining_cards = Vec::new();
    for suit in Suit::ALL {
        for rank in Rank::ALL {
            let card = bridge_core::card::Card { suit, rank };
            if !used_cards.contains(&card) {
                remaining_cards.push(card);
            }
        }
    }

    let other_positions: Vec<Position> = Position::ALL
        .iter()
        .filter(|&&p| p != pos)
        .cloned()
        .collect();

    for (i, card) in remaining_cards.into_iter().enumerate() {
        let p = other_positions[i % 3];
        hands
            .entry(p)
            .or_insert(Hand { cards: Vec::new() })
            .cards
            .push(card);
    }

    hands
}

#[test]
fn run_sayc_test_vectors() {
    let test_file = "../../tests/bidding/standard_bidding_with_sayc.yaml";
    let file_content = fs::read_to_string(test_file).expect("Failed to read test vectors");
    let test_suites: HashMap<String, Vec<Vec<serde_yaml::Value>>> =
        serde_yaml::from_str(&file_content).expect("Failed to parse YAML");

    let expectations_path = "tests/expectations.yaml";
    let expectations: HashMap<String, HashMap<String, String>> =
        if Path::new(expectations_path).exists() {
            let content = fs::read_to_string(expectations_path).unwrap();
            serde_yaml::from_str(&content).unwrap_or_default()
        } else {
            HashMap::new()
        };

    let update_mode = std::env::var("UPDATE_EXPECTATIONS").is_ok();
    let mut new_expectations = HashMap::new();
    let mut failures = Vec::new();

    for (suite_name, cases) in test_suites {
        let mut suite_results = HashMap::new();
        for case in cases.iter() {
            let hand_str = case[0].as_str().unwrap();
            let expected_call = case[1].as_str().unwrap();
            let history_str = if case.len() > 2 {
                case[2].as_str().unwrap_or("")
            } else {
                ""
            };
            let vuln_str = if case.len() > 3 {
                case[3].as_str().unwrap_or("None")
            } else {
                "None"
            };

            let hand = parse_hand(hand_str);
            let dealer = Position::North; // Default
            let history_auction = parse_auction(history_str, dealer);
            let our_position = history_auction.current_player();

            let mut full_calls = history_auction.calls.clone();
            if let Ok(c) = expected_call.parse::<Call>() {
                full_calls.push(c);
            }

            let mut status = "PASS".to_string();
            let mut temp_auction = Auction::new(dealer);

            for (idx, call) in full_calls.iter().enumerate() {
                if temp_auction.current_player() == our_position {
                    let hands = create_dummy_full_deal(&hand, our_position);
                    let board = Board {
                        dealer,
                        vulnerability: match vuln_str {
                            "Both" => Vulnerability::Both,
                            "N-S" => Vulnerability::NS,
                            "E-W" => Vulnerability::EW,
                            _ => Vulnerability::None,
                        },
                        hands,
                    };

                    let ident = identifier::export_board(&board, 1, Some(&temp_auction));
                    let actual_call = get_next_bid(&ident);
                    let expected_str = call.render();

                    if actual_call != expected_str {
                        status = format!(
                            "FAIL: step {}, expected {}, got {}",
                            idx, expected_str, actual_call
                        );
                        break;
                    }
                }
                temp_auction.add_call(*call);
            }

            let key = format!("{}:{}:{}", hand_str, history_str, vuln_str);
            suite_results.insert(key.clone(), status.clone());

            let prev_status = expectations.get(&suite_name).and_then(|s| s.get(&key));

            if !update_mode {
                if let Some(expected_status) = prev_status {
                    if expected_status != &status {
                        failures.push(format!(
                            "{}: {} -> Status changed from {} to {}",
                            suite_name, key, expected_status, status
                        ));
                    }
                } else {
                    // New test case not in expectations
                    if status != "PASS" {
                        failures.push(format!(
                            "{}: {} -> New test failed: {}",
                            suite_name, key, status
                        ));
                    }
                }
            }
        }
        new_expectations.insert(suite_name, suite_results);
    }

    if update_mode {
        let yaml = serde_yaml::to_string(&new_expectations).unwrap();
        fs::write(expectations_path, yaml).unwrap();
        println!("Updated expectations.yaml");
    } else if !failures.is_empty() {
        for f in failures {
            println!("{}", f);
        }
        panic!("Tests failed or status changed. Run with UPDATE_EXPECTATIONS=1 to update expectations.");
    }
}
