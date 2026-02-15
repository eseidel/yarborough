use bridge_core::auction::Auction;
use bridge_core::board::{Position, Vulnerability};
use bridge_core::call::Call;
use bridge_core::hand::Hand;
use bridge_core::io::identifier;
use bridge_core::suit::Suit;
use bridge_engine::nbk;
use clap::Parser;
use std::collections::HashMap;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// The hand identifier (e.g. 11-decde22e0d283f55b36244ab45)
    identifier: Option<String>,

    /// Optional bid number to show full trace for
    #[arg(short, long)]
    bid: Option<usize>,

    /// A test case string in JSON format: '["Hand", "ExpectedBid", "Auction"?, "Vulnerability"?]'
    #[arg(short, long)]
    test_case: Option<String>,
}

fn get_hand_suits(hand: &Hand) -> Vec<String> {
    let mut hand = hand.clone();
    hand.sort();

    let mut suits = Vec::new();
    for suit in [Suit::Spades, Suit::Hearts, Suit::Diamonds, Suit::Clubs] {
        let cards: String = hand
            .cards
            .iter()
            .filter(|c| c.suit == suit)
            .map(|c| c.rank.to_char())
            .collect();
        suits.push(format!(
            "{}: {}",
            suit.to_char(),
            if cards.is_empty() { "-" } else { &cards }
        ));
    }
    suits
}

fn print_hands_table(hands: &HashMap<Position, Hand>) {
    let n = hands.get(&Position::North).map(get_hand_suits);
    let e = hands.get(&Position::East).map(get_hand_suits);
    let s = hands.get(&Position::South).map(get_hand_suits);
    let w = hands.get(&Position::West).map(get_hand_suits);

    let empty = vec!["-".to_string(); 4];
    let n_suits = n.as_ref().unwrap_or(&empty);
    let e_suits = e.as_ref().unwrap_or(&empty);
    let s_suits = s.as_ref().unwrap_or(&empty);
    let w_suits = w.as_ref().unwrap_or(&empty);

    let indent = "        "; // 8 spaces

    // North
    println!("{}North", indent);
    for s in n_suits {
        println!("{}{}", indent, s);
    }
    println!();

    // West and East
    println!("{:<20} East", "West");
    for i in 0..4 {
        println!("{:<20} {}", w_suits[i], e_suits[i]);
    }
    println!();

    // South
    println!("{}South", indent);
    for s in s_suits {
        println!("{}{}", indent, s);
    }
}

fn pos_char(pos: Position) -> char {
    match pos {
        Position::North => 'N',
        Position::East => 'E',
        Position::South => 'S',
        Position::West => 'W',
    }
}

fn parse_calls(s: &str) -> Vec<Call> {
    s.split(|c: char| c == ',' || c == ' ' || c.is_whitespace())
        .filter(|part| !part.is_empty())
        .filter_map(|part| part.parse::<Call>().ok())
        .collect()
}

fn main() {
    let args = Args::parse();

    let mut expected_bid = None;

    let (board, auction_to_replay) = if let Some(test_case_json) = &args.test_case {
        let parts: Vec<String> =
            serde_json::from_str(test_case_json).expect("Invalid test case JSON");
        if parts.is_empty() {
            eprintln!("Error: Empty test case.");
            return;
        }

        let hand_str = &parts[0];
        expected_bid = parts.get(1).cloned();
        let history_str = parts.get(2).map(|s| s.as_str()).unwrap_or("");
        let vuln_str = parts.get(3).map(|s| s.as_str()).unwrap_or("None");

        let hand = bridge_core::io::hand_parser::parse_hand(hand_str);
        let vulnerability = match vuln_str {
            "N-S" | "NS" => Vulnerability::NS,
            "E-W" | "EW" => Vulnerability::EW,
            "Both" | "All" => Vulnerability::Both,
            _ => Vulnerability::None,
        };

        let history = parse_calls(history_str);
        // For test cases, we assume we are the next player after history.
        // We don't know the exact dealer, so we infer it from history length.
        // Actually, many test cases assume North is dealer or similar.
        // Let's assume North for now if not specified.
        let dealer = Position::North;
        let mut board_hands = HashMap::new();

        let mut temp_auction = Auction::new(dealer);
        for call in &history {
            temp_auction.add_call(*call);
        }
        let current_player = temp_auction.current_player();
        board_hands.insert(current_player, hand);

        (
            bridge_core::board::Board {
                dealer,
                vulnerability,
                hands: board_hands,
            },
            history,
        )
    } else if let Some(id) = &args.identifier {
        match identifier::import_board(id) {
            Some((b, a)) => (b, a.map(|a| a.calls).unwrap_or_default()),
            None => {
                eprintln!("Error: Invalid identifier.");
                return;
            }
        }
    } else {
        eprintln!("Error: Must provide either an identifier or a --test-case.");
        return;
    };

    let dealer = board.dealer;
    let mut auction = Auction::new(dealer);

    if let Some(id) = &args.identifier {
        println!("Board: {}", id);
    } else {
        println!("Test Case: {}", args.test_case.as_ref().unwrap());
    }
    println!("Dealer: {:?}", dealer);
    println!("Vulnerability: {:?}", board.vulnerability);

    println!("\nHands:");
    print_hands_table(&board.hands);

    println!();
    println!(
        "{:<3} | {:<3} | {:<5} | {:<25} | Description",
        "Idx", "Pos", "Call", "Rule Name"
    );
    println!(
        "{:-<3}-+-{:-<3}-+-{:-<5}-+-{:-<25}-+---------------------------",
        "", "", "", ""
    );

    let mut current_bid_idx = 0;

    // Replay history
    for call in &auction_to_replay {
        let player = auction.current_player();
        current_bid_idx += 1;
        println!(
            "{:<3} | {:<3} | {:<5} | {:<25} | (History)",
            current_bid_idx,
            pos_char(player),
            call.render(),
            ""
        );
        auction.add_call(*call);
    }

    // Now run the engine for the next bid(s)
    loop {
        let current_player = auction.current_player();
        let hand = match board.hands.get(&current_player) {
            Some(h) => h,
            None => {
                if expected_bid.is_some()
                    && current_bid_idx >= expected_bid.as_ref().map(|_| 0).unwrap()
                {
                    // If we are debugging a test case and don't have the next hand, stop.
                    break;
                }
                // If we don't have the hand, we can't bid.
                // But we might want to continue the auction if we have other hands.
                // For now, let's just break if we can't find a hand and it's not a specified history.
                break;
            }
        };

        let trace = nbk::select_bid_with_trace(hand, &auction, current_player);

        current_bid_idx += 1;

        if let Some(bid_num) = args.bid {
            if bid_num == current_bid_idx {
                print_full_trace(current_bid_idx, &trace);
            }
        }

        if let Some(expected) = &expected_bid {
            if current_bid_idx == auction_to_replay.len() + 1 {
                println!("EXPECTED: {}", expected);
            }
        }

        match trace.selected_call {
            Some(call) => {
                let rule_trace = trace
                    .selection_steps
                    .iter()
                    .find(|s| s.satisfied && s.call == call)
                    .ok_or_else(|| format!("No satisfied rule found for selected call: {:?}", call))
                    .unwrap();

                println!(
                    "{:<3} | {:<3} | {:<5} | {:<25} | {}",
                    current_bid_idx,
                    pos_char(current_player),
                    call.render(),
                    rule_trace.semantics.rule_name,
                    rule_trace.semantics.description
                );

                if let Some(expected) = &expected_bid {
                    if current_bid_idx == auction_to_replay.len() + 1 {
                        if call.render() == *expected {
                            println!("RESULT: MATCH");
                        } else {
                            println!("RESULT: MISMATCH");
                        }
                    }
                }

                auction.add_call(call);
                if auction.is_finished() || args.test_case.is_some() {
                    break;
                }
            }
            None => {
                println!(
                    "{:<3} | {:<3} | {:<5} | {:<25} | ",
                    current_bid_idx,
                    pos_char(current_player),
                    "Pass",
                    "No rule matched"
                );

                if let Some(expected) = &expected_bid {
                    if current_bid_idx == auction_to_replay.len() + 1 {
                        if expected == "P" || expected == "Pass" {
                            println!("RESULT: MATCH");
                        } else {
                            println!("RESULT: MISMATCH");
                        }
                    }
                }

                auction.add_call(Call::Pass);
                if auction.is_finished() || args.test_case.is_some() {
                    break;
                }
            }
        }
    }
}

fn print_full_trace(bid_num: usize, trace: &nbk::BidTrace) {
    println!("\nFull Trace for Bid {}:", bid_num);
    println!("=======================");

    println!("\nBidder Model (What partner thinks we have):");
    print_partner_model(&trace.auction_model.bidder_model);

    println!("\nPartner Model (What we think partner has):");
    print_partner_model(&trace.auction_model.partner_model);

    println!("\nSelection Process:");

    let mut current_group = String::new();
    for step in &trace.selection_steps {
        if step.group_name != current_group {
            println!("\n--- Group: {} ---", step.group_name);
            current_group = step.group_name.clone();
        }

        let status = if step.satisfied { "MATCHED" } else { "FAILED " };
        println!(
            "[{}] {} ({})",
            status,
            step.call.render(),
            step.semantics.rule_name,
        );
        for ct in &step.semantics.shows {
            let is_failed = step.failed_constraints.contains(ct);
            let c_status = if is_failed { "✗" } else { "✓" };
            println!("  {} {:?}", c_status, ct);
        }
    }
    println!("=======================\n");
}

fn print_partner_model(model: &nbk::PartnerModel) {
    if let Some(max_hcp) = model.max_hcp {
        println!("  HCP: {} - {}", model.min_hcp.unwrap_or(0), max_hcp);
    } else {
        let min_hcp = model.min_hcp.unwrap_or(0);
        if min_hcp == 0 {
            println!("  HCP: ?");
        } else {
            println!("  HCP: {}+", min_hcp);
        }
    }
    if let Some(shape) = model.max_shape {
        println!("  Shape: {:?}", shape);
    }
    print!("  Length: ");
    let mut known_length = false;
    for suit in bridge_core::Suit::ALL {
        let min_length = model.min_length(suit);
        let max_length = model.max_length(suit);
        if max_length == 13 {
            if min_length > 0 {
                print!("{}:{}+ ", suit.to_char(), min_length);
                known_length = true;
            }
        } else {
            print!("{}:{}-{} ", suit.to_char(), min_length, max_length);
            known_length = true;
        }
    }
    if !known_length {
        println!("?");
    } else {
        println!();
    }
}
