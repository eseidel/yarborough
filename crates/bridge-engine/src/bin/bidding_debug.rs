use bridge_core::board::Position;
use bridge_core::hand::Hand;
use bridge_core::suit::Suit;
use bridge_core::io::identifier;
use bridge_engine::load_engine;
use bridge_core::auction::Auction;
use bridge_core::call::Call;
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
        let cards: String = hand.cards.iter()
            .filter(|c| c.suit == suit)
            .map(|c| c.rank.to_char())
            .collect();
        suits.push(format!("{}: {}", suit.to_char(), if cards.is_empty() { "-" } else { &cards }));
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

    let engine = load_engine();
    let dealer = board.dealer;
    let mut auction = Auction::new(dealer);

    println!("Board: {}", args.identifier);
    println!("Dealer: {:?}", dealer);
    println!("Vulnerability: {:?}", board.vulnerability);
    
    println!("\nHands:");
    print_hands_table(&board.hands);

    println!("");
    println!("{:<3} | {:<3} | {:<5} | {:<25} | {}", "Idx", "Pos", "Call", "Rule Name", "Description");
    println!("{:-<3}-+-{:-<3}-+-{:-<5}-+-{:-<25}-+---------------------------", "", "", "", "");

    let mut current_bid_idx = 0;
    
    loop {
        let current_player = auction.current_player();
        let hand = board.hands.get(&current_player).expect("Missing hand for player");
        
        let trace = engine.get_full_trace(hand, &auction);
        
        current_bid_idx += 1;
        
        if let Some(bid_num) = args.bid {
            if bid_num == current_bid_idx {
                print_full_trace(current_bid_idx, &trace);
            }
        }

        match trace.selected_call {
            Some(call) => {
                let call: Call = call;
                let rule_trace = trace.rules_considered.iter()
                    .find(|r| r.satisfied && r.call == call)
                    .expect("No satisfied rule found for selected call");

                println!(
                    "{:<3} | {:<3} | {:<5} | {:<25} | {}",
                    current_bid_idx,
                    pos_char(current_player),
                    call.render(),
                    rule_trace.rule_name,
                    rule_trace.description
                );

                auction.add_call(call);
                if auction.is_finished() {
                    break;
                }
            }
            None => {
                println!(
                    "{:<3} | {:<3} | {:<5} | {:25} | {}",
                    current_bid_idx,
                    pos_char(current_player),
                    "Pass",
                    "No rule matched",
                    ""
                );
                auction.add_call(Call::Pass);
                if auction.is_finished() {
                    break;
                }
            }
        }
    }
}

fn print_full_trace(bid_num: usize, trace: &bridge_engine::trace::BidTrace) {
    println!("\nFull Trace for Bid {}:", bid_num);
    println!("=======================");
    println!("Partner Profile: {:?}", trace.profile);
    println!("\nRules Considered:");
    
    let mut sorted_rules = trace.rules_considered.clone();
    sorted_rules.sort_by_key(|r| std::cmp::Reverse(r.priority));

    for rule in sorted_rules {
        let status = if rule.satisfied { "MATCHED" } else { "FAILED " };
        println!(
            "[{}] {} ({}) - Priority: {}",
            status,
            rule.call.render(),
            rule.rule_name,
            rule.priority
        );
        for ct in &rule.constraints {
            let c_status = if ct.satisfied { "✓" } else { "✗" };
            println!("  {} {:?}", c_status, ct.constraint);
        }
        println!();
    }
    println!("=======================\n");
}
