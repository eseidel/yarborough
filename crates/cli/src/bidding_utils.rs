use engine::nbk;
use std::collections::HashMap;
use std::fmt::Write;
use types::auction::Auction;
use types::board::{Board, Position, Vulnerability};
use types::call::Call;
use types::hand::Hand;
use types::suit::Suit;

pub fn get_hand_suits(hand: &Hand) -> Vec<String> {
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

pub fn format_hands_table(hands: &HashMap<Position, Hand>) -> String {
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

pub fn pos_char(pos: Position) -> char {
    match pos {
        Position::North => 'N',
        Position::East => 'E',
        Position::South => 'S',
        Position::West => 'W',
    }
}

pub fn parse_calls(s: &str) -> Vec<Call> {
    s.split(|c: char| c == ',' || c == ' ' || c.is_whitespace())
        .filter(|part| !part.is_empty())
        .filter_map(|part| part.parse::<Call>().ok())
        .collect()
}

pub fn parse_test_case(test_case_json: &str) -> (Board, Vec<Call>, Option<String>) {
    let parts: Vec<String> = serde_json::from_str(test_case_json).expect("Invalid test case JSON");
    if parts.is_empty() {
        panic!("Error: Empty test case.");
    }

    let hand_str = &parts[0];
    let expected_bid = parts.get(1).cloned();
    let history_str = parts.get(2).map(|s| s.as_str()).unwrap_or("");
    let vuln_str = parts.get(3).map(|s| s.as_str()).unwrap_or("None");

    let hand = types::io::hand_parser::parse_hand(hand_str);
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
        types::board::Board {
            dealer,
            vulnerability,
            hands: board_hands,
        },
        history,
        expected_bid,
    )
}

pub fn format_row(idx: usize, pos: char, call: &str, rule: &str, desc: &str) -> String {
    format!(
        "{:<3} | {:<3} | {:<5} | {:<25} | {}",
        idx, pos, call, rule, desc
    )
}

pub fn format_table_header() -> String {
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

pub fn format_partner_model(model: &nbk::PartnerModel) -> String {
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

pub fn format_full_trace(bid_num: usize, trace: &nbk::BidTrace) -> String {
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

pub fn replay_history(auction: &mut Auction, history: &[Call], bid_idx: &mut usize) -> String {
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
