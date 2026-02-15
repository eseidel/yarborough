use bridge_core::auction::Auction;
use bridge_core::board::Position;
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
    identifier: String,

    /// Optional bid number to show full trace for
    #[arg(short, long)]
    bid: Option<usize>,
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
    let n_suits = get_hand_suits(hands.get(&Position::North).unwrap());
    let e_suits = get_hand_suits(hands.get(&Position::East).unwrap());
    let s_suits = get_hand_suits(hands.get(&Position::South).unwrap());
    let w_suits = get_hand_suits(hands.get(&Position::West).unwrap());

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

fn main() {
    let args = Args::parse();

    let (board, _maybe_auction) = match identifier::import_board(&args.identifier) {
        Some(res) => res,
        None => {
            eprintln!("Error: Invalid identifier.");
            return;
        }
    };

    let dealer = board.dealer;
    let mut auction = Auction::new(dealer);

    println!("Board: {}", args.identifier);
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

    loop {
        let current_player = auction.current_player();
        let hand = board
            .hands
            .get(&current_player)
            .expect("Missing hand for player");

        let trace = nbk::select_bid_with_trace(hand, &auction, current_player);

        current_bid_idx += 1;

        if let Some(bid_num) = args.bid {
            if bid_num == current_bid_idx {
                print_full_trace(current_bid_idx, &trace);
            }
        }

        match trace.selected_call {
            Some(call) => {
                let rule_trace = trace
                    .selection_steps
                    .iter()
                    .find(|s| s.satisfied && s.call == call)
                    .expect("No satisfied rule found for selected call");

                println!(
                    "{:<3} | {:<3} | {:<5} | {:<25} | {}",
                    current_bid_idx,
                    pos_char(current_player),
                    call.render(),
                    rule_trace.semantics.rule_name,
                    rule_trace.semantics.description
                );

                auction.add_call(call);
                if auction.is_finished() {
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
                auction.add_call(Call::Pass);
                if auction.is_finished() {
                    break;
                }
            }
        }
    }
}

fn print_full_trace(bid_num: usize, trace: &nbk::BidTrace) {
    println!("\nFull Trace for Bid {}:", bid_num);
    println!("=======================");
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
