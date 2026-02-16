// cspell:ignore AKQJT
use bridge_core::auction::Auction;
use bridge_core::board::{Board, Position, Vulnerability};
use bridge_core::call::Call;
use bridge_core::hand::Hand;
use bridge_core::io::identifier;
use bridge_core::suit::Suit;
use bridge_engine::nbk;
use clap::Parser;
use std::collections::HashMap;
use std::fmt::Write;

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

fn format_hands_table(hands: &HashMap<Position, Hand>) -> String {
    let mut out = String::new();
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
    writeln!(out, "{}North", indent).unwrap();
    for s in n_suits {
        writeln!(out, "{}{}", indent, s).unwrap();
    }
    writeln!(out).unwrap();

    // West and East
    writeln!(out, "{:<20} East", "West").unwrap();
    for i in 0..4 {
        writeln!(out, "{:<20} {}", w_suits[i], e_suits[i]).unwrap();
    }
    writeln!(out).unwrap();

    // South
    writeln!(out, "{}South", indent).unwrap();
    for s in s_suits {
        writeln!(out, "{}{}", indent, s).unwrap();
    }
    out
}

fn pos_char(pos: Position) -> char {
    match pos {
        Position::North => 'N',
        Position::East => 'E',
        Position::South => 'S',
        Position::West => 'W',
    }
}

/// Splits call names on both commas or whitespace.
fn parse_calls(s: &str) -> Vec<Call> {
    s.split(|c: char| c == ',' || c == ' ' || c.is_whitespace())
        .filter(|part| !part.is_empty())
        .filter_map(|part| part.parse::<Call>().ok())
        .collect()
}

fn parse_test_case(test_case_json: &str) -> (bridge_core::board::Board, Vec<Call>, Option<String>) {
    let parts: Vec<String> = serde_json::from_str(test_case_json).expect("Invalid test case JSON");
    if parts.is_empty() {
        panic!("Error: Empty test case.");
    }

    let hand_str = &parts[0];
    let expected_bid = parts.get(1).cloned();
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
        expected_bid,
    )
}

fn format_row(idx: usize, pos: char, call: &str, rule: &str, desc: &str) -> String {
    format!(
        "{:<3} | {:<3} | {:<5} | {:<25} | {}",
        idx, pos, call, rule, desc
    )
}

fn format_table_header() -> String {
    let mut out = String::new();
    writeln!(
        out,
        "{:<3} | {:<3} | {:<5} | {:<25} | Description",
        "Idx", "Pos", "Call", "Rule Name"
    )
    .unwrap();
    writeln!(
        out,
        "{:-<3}-+-{:-<3}-+-{:-<5}-+-{:-<25}-+---------------------------",
        "", "", "", ""
    )
    .unwrap();
    out
}

fn format_partner_model(model: &nbk::PartnerModel) -> String {
    let mut out = String::new();
    if let Some(max_hcp) = model.max_hcp {
        writeln!(out, "  HCP: {} - {}", model.min_hcp.unwrap_or(0), max_hcp).unwrap();
    } else {
        let min_hcp = model.min_hcp.unwrap_or(0);
        if min_hcp == 0 {
            writeln!(out, "  HCP: ?").unwrap();
        } else {
            writeln!(out, "  HCP: {}+", min_hcp).unwrap();
        }
    }
    if let Some(shape) = model.max_shape {
        writeln!(out, "  Shape: {:?}", shape).unwrap();
    }
    write!(out, "  Length: ").unwrap();
    let mut known_length = false;
    for suit in Suit::ALL {
        let min_length = model.min_length(suit);
        let max_length = model.max_length(suit);
        if max_length == 13 {
            if min_length > 0 {
                write!(out, "{}:{}+ ", suit.to_char(), min_length).unwrap();
                known_length = true;
            }
        } else {
            write!(out, "{}:{}-{} ", suit.to_char(), min_length, max_length).unwrap();
            known_length = true;
        }
    }
    if !known_length {
        writeln!(out, "?").unwrap();
    } else {
        writeln!(out).unwrap();
    }
    out
}

fn format_full_trace(bid_num: usize, trace: &nbk::BidTrace) -> String {
    let mut out = String::new();
    writeln!(out, "\nFull Trace for Bid {}:", bid_num).unwrap();
    writeln!(out, "=======================").unwrap();

    writeln!(out, "\nBidder Model (What partner thinks we have):").unwrap();
    write!(
        out,
        "{}",
        format_partner_model(&trace.auction_model.bidder_model)
    )
    .unwrap();

    writeln!(out, "\nPartner Model (What we think partner has):").unwrap();
    write!(
        out,
        "{}",
        format_partner_model(&trace.auction_model.partner_model)
    )
    .unwrap();

    writeln!(out, "\nSelection Process:").unwrap();

    let mut current_group = String::new();
    for step in &trace.selection_steps {
        if step.group_name != current_group {
            writeln!(out, "\n--- Group: {} ---", step.group_name).unwrap();
            current_group = step.group_name.clone();
        }

        let status = if step.satisfied { "MATCHED" } else { "FAILED " };
        writeln!(
            out,
            "[{}] {} ({})",
            status,
            step.call.render(),
            step.semantics.rule_name,
        )
        .unwrap();
        for ct in &step.semantics.shows {
            let is_failed = step.failed_constraints.contains(ct);
            let c_status = if is_failed { "✗" } else { "✓" };
            writeln!(out, "  {} {:?}", c_status, ct).unwrap();
        }
    }
    writeln!(out, "=======================\n").unwrap();
    out
}

fn resolve_inputs(args: &Args) -> Result<(Board, Vec<Call>, Option<String>), String> {
    if let Some(test_case_json) = &args.test_case {
        Ok(parse_test_case(test_case_json))
    } else if let Some(id) = &args.identifier {
        match identifier::import_board(id) {
            Some((b, a)) => Ok((b, a.map(|a| a.calls).unwrap_or_default(), None)),
            None => Err("Error: Invalid identifier.".to_string()),
        }
    } else {
        Err("Error: Must provide either an identifier or a --test-case.".to_string())
    }
}

fn print_board_info(args: &Args, board: &Board) {
    if let Some(id) = &args.identifier {
        println!("Board: {}", id);
    } else {
        println!("Test Case: {}", args.test_case.as_ref().unwrap());
    }
    println!("Dealer: {:?}", board.dealer);
    println!("Vulnerability: {:?}", board.vulnerability);

    println!("\nHands:");
    print!("{}", format_hands_table(&board.hands));

    println!();
    print!("{}", format_table_header());
}

fn replay_history(auction: &mut Auction, history: &[Call], bid_idx: &mut usize) -> String {
    let mut out = String::new();
    for call in history {
        let player = auction.current_player();
        *bid_idx += 1;
        writeln!(
            out,
            "{}",
            format_row(*bid_idx, pos_char(player), &call.render(), "", "(History)")
        )
        .unwrap();
        auction.add_call(*call);
    }
    out
}

fn run_bidding_loop(
    board: &Board,
    auction: &mut Auction,
    expected_bid: Option<String>,
    args: &Args,
    bid_idx: &mut usize,
    history_len: usize,
) {
    loop {
        let current_player = auction.current_player();
        let hand = match board.hands.get(&current_player) {
            Some(h) => h,
            None => {
                if expected_bid.is_some() && *bid_idx >= history_len {
                    break;
                }
                break;
            }
        };

        let trace = nbk::select_bid_with_trace(hand, auction, current_player);
        *bid_idx += 1;

        if let Some(trace_bid_num) = args.bid {
            if trace_bid_num == *bid_idx {
                print!("{}", format_full_trace(*bid_idx, &trace));
            }
        }

        if let Some(expected) = &expected_bid {
            if *bid_idx == history_len + 1 {
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
                    "{}",
                    format_row(
                        *bid_idx,
                        pos_char(current_player),
                        &call.render(),
                        &rule_trace.semantics.rule_name,
                        &rule_trace.semantics.description
                    )
                );

                if let Some(expected) = &expected_bid {
                    if *bid_idx == history_len + 1 {
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
                    "{}",
                    format_row(
                        *bid_idx,
                        pos_char(current_player),
                        "Pass",
                        "No rule matched",
                        ""
                    )
                );

                if let Some(expected) = &expected_bid {
                    if *bid_idx == history_len + 1 {
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

fn main() {
    let args = Args::parse();

    let (board, auction_to_replay, expected_bid) = match resolve_inputs(&args) {
        Ok(res) => res,
        Err(e) => {
            eprintln!("{}", e);
            return;
        }
    };

    print_board_info(&args, &board);

    let mut current_bid_idx = 0;
    let mut auction = Auction::new(board.dealer);

    print!(
        "{}",
        replay_history(&mut auction, &auction_to_replay, &mut current_bid_idx)
    );
    run_bidding_loop(
        &board,
        &mut auction,
        expected_bid,
        &args,
        &mut current_bid_idx,
        auction_to_replay.len(),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pos_char() {
        assert_eq!(pos_char(Position::North), 'N');
        assert_eq!(pos_char(Position::East), 'E');
        assert_eq!(pos_char(Position::South), 'S');
        assert_eq!(pos_char(Position::West), 'W');
    }

    #[test]
    fn test_parse_calls() {
        let calls = parse_calls("1C,1D 1H P");
        assert_eq!(calls.len(), 4);
        assert_eq!(calls[0].render(), "1C");
        assert_eq!(calls[1].render(), "1D");
        assert_eq!(calls[2].render(), "1H");
        assert_eq!(calls[3].render(), "P");

        let mixed = parse_calls("1C, 1D\n1H\t1S");
        assert_eq!(mixed.len(), 4);
        assert_eq!(mixed[3].render(), "1S");
    }

    #[test]
    fn test_parse_test_case() {
        let json = r#"["AKQ2.JT9.876.543", "1N", "1C P", "Both"]"#;
        let (board, history, expected) = parse_test_case(json);

        assert_eq!(board.vulnerability, Vulnerability::Both);
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].render(), "1C");
        assert_eq!(expected, Some("1N".to_string()));

        assert!(board.hands.contains_key(&Position::South));
        let hand = board.hands.get(&Position::South).unwrap();
        assert_eq!(hand.cards.len(), 13);
    }

    #[test]
    fn test_get_hand_suits() {
        let hand = bridge_core::io::hand_parser::parse_hand("543.876.JT9.AKQ");
        let suits = get_hand_suits(&hand);
        assert_eq!(suits[0], "S: AKQ");
        assert_eq!(suits[1], "H: JT9");
        assert_eq!(suits[2], "D: 876");
        assert_eq!(suits[3], "C: 543");
    }

    #[test]
    fn test_format_hands_table() {
        let mut hands = HashMap::new();
        hands.insert(
            Position::North,
            bridge_core::io::hand_parser::parse_hand("AKQJT98765432..."),
        );
        let s = format_hands_table(&hands);
        assert!(s.contains("North"));
        assert!(s.contains("C: AKQJT98765432"));
    }

    #[test]
    fn test_format_row() {
        let s = format_row(1, 'N', "1C", "Opening", "12-14 HCP");
        assert_eq!(
            s,
            "1   | N   | 1C    | Opening                   | 12-14 HCP"
        );
    }

    #[test]
    fn test_format_table_header() {
        let s = format_table_header();
        assert!(s.contains("Idx"));
        assert!(s.contains("Call"));
    }

    #[test]
    fn test_format_partner_model() {
        let model = nbk::PartnerModel {
            min_hcp: Some(12),
            max_hcp: Some(14),
            ..Default::default()
        };
        let s = format_partner_model(&model);
        assert!(s.contains("HCP: 12 - 14"));
    }

    #[test]
    fn test_format_full_trace() {
        let hand = bridge_core::io::hand_parser::parse_hand("AKQ.JT9.876.5432");
        let auction = Auction::new(Position::North);
        let trace = nbk::select_bid_with_trace(&hand, &auction, Position::North);
        let s = format_full_trace(1, &trace);
        assert!(s.contains("Full Trace for Bid 1:"));
        assert!(s.contains("Bidder Model"));
    }

    #[test]
    fn test_replay_history() {
        let mut auction = Auction::new(Position::North);
        let history = vec![
            Call::Bid {
                level: 1,
                strain: bridge_core::Strain::Clubs,
            },
            Call::Pass,
        ];
        let mut idx = 0;
        let s = replay_history(&mut auction, &history, &mut idx);
        assert_eq!(idx, 2);
        assert!(s.contains("1C"));
        assert!(s.contains("(History)"));
        assert_eq!(auction.calls.len(), 2);
    }
}
