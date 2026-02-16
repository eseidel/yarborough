/// Compare the yarborough bidder against z3b or kbb.
/// Similar to saycbridge/scripts/bidder-fight
use bridge_core::auction::Auction;
use bridge_core::board::{Board, Position, Vulnerability};
use bridge_core::call::Call;
use bridge_core::hand::Hand;
use bridge_core::io::identifier;
use bridge_core::suit::Suit;
use bridge_engine::{generate_random_board, nbk};
use clap::Parser;
use rand::Rng;
use serde::Deserialize;

#[derive(Parser, Debug)]
#[command(
    author,
    version,
    about = "Compare yarborough bidder against z3b or kbb"
)]
struct Args {
    /// Board identifier(s) to test (e.g. "11-decde22e0d283f55b36244ab45")
    identifiers: Vec<String>,

    /// Compare against kbb instead of z3b
    #[arg(long)]
    kbb: bool,
}

#[derive(Deserialize)]
struct AutobidResponse {
    calls_string: String,
}

/// Format a hand as "C.D.H.S" (e.g., "AK5.QJ3.T92.8743")
/// This matches the format expected by saycbridge.
fn format_hand_cdhs(hand: &Hand) -> String {
    let mut suits_strings = Vec::new();
    for suit in [Suit::Clubs, Suit::Diamonds, Suit::Hearts, Suit::Spades] {
        let cards: Vec<String> = hand
            .cards
            .iter()
            .filter(|c| c.suit == suit)
            .map(|c| c.rank.to_char().to_string())
            .collect();
        suits_strings.push(if cards.is_empty() {
            String::new()
        } else {
            cards.join("")
        });
    }
    suits_strings.join(".")
}

fn render_auction(auction: &Auction) -> String {
    auction
        .calls
        .iter()
        .map(|c| c.render())
        .collect::<Vec<_>>()
        .join(" ")
}

fn get_remote_auction(
    remote_url: &str,
    board: &Board,
    board_number: u32,
) -> Result<Vec<Call>, String> {
    let vulnerability = match board.vulnerability {
        Vulnerability::None => "NO",
        Vulnerability::NS => "NS",
        Vulnerability::EW => "EW",
        Vulnerability::Both => "BOTH",
    };

    let params = [
        ("number", board_number.to_string()),
        ("vulnerability", vulnerability.to_string()),
        ("dealer", board.dealer.to_char().to_string()),
        ("calls_string", String::new()),
        (
            "deal[north]",
            board
                .hands
                .get(&Position::North)
                .map(format_hand_cdhs)
                .unwrap_or_default(),
        ),
        (
            "deal[east]",
            board
                .hands
                .get(&Position::East)
                .map(format_hand_cdhs)
                .unwrap_or_default(),
        ),
        (
            "deal[south]",
            board
                .hands
                .get(&Position::South)
                .map(format_hand_cdhs)
                .unwrap_or_default(),
        ),
        (
            "deal[west]",
            board
                .hands
                .get(&Position::West)
                .map(format_hand_cdhs)
                .unwrap_or_default(),
        ),
    ];

    let client = reqwest::blocking::Client::new();
    let response = client
        .get(remote_url)
        .query(&params)
        .send()
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let autobid: AutobidResponse = response
        .json()
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let calls: Vec<Call> = autobid
        .calls_string
        .split_whitespace()
        .filter_map(|s| s.parse().ok())
        .collect();

    Ok(calls)
}

fn bid_board(remote_url: &str, board: &Board, board_number: u32) {
    let remote_calls = match get_remote_auction(remote_url, board, board_number) {
        Ok(calls) => calls,
        Err(e) => {
            eprintln!("Failed to get remote auction: {}", e);
            return;
        }
    };

    let mut local_auction = Auction::new(board.dealer);
    let mut remote_index = 0;

    while !local_auction.is_finished() && remote_index < remote_calls.len() {
        let current_player = local_auction.current_player();
        let hand = match board.hands.get(&current_player) {
            Some(h) => h,
            None => {
                eprintln!("No hand for position {:?}", current_player);
                return;
            }
        };

        let remote_call = remote_calls[remote_index];
        remote_index += 1;

        let local_call =
            nbk::select_bid(hand, &local_auction, current_player).unwrap_or(Call::Pass);

        if local_call != remote_call {
            println!("Difference found!");
            println!(
                "Board: {}",
                identifier::export_board(board, board_number, None)
            );
            println!("Position: {:?}", current_player);
            println!("Hand: {}", format_hand_cdhs(hand));
            println!("Auction so far: {}", render_auction(&local_auction));
            println!("Remote bid: {}", remote_call.render());
            println!("Yarborough bid: {}", local_call.render());
            println!();
            return;
        }

        local_auction.add_call(local_call);
    }
}

fn run_random(remote_url: &str) {
    println!("Comparing yarborough vs remote at {}\n", remote_url);
    println!("Press Ctrl+C to stop\n");

    let mut rng = rand::thread_rng();
    loop {
        let board_number = rng.gen_range(1..=16);
        let board = generate_random_board(board_number, &mut rng);
        bid_board(remote_url, &board, board_number);
    }
}

fn run_identifier(remote_url: &str, id: &str) {
    match identifier::import_board(id) {
        Some((board, auction)) => {
            let board_number = id
                .split('-')
                .next()
                .and_then(|s| s.parse().ok())
                .unwrap_or(1);

            if auction.is_some() {
                eprintln!("Warning: identifier contains existing auction, will bid from start");
            }

            bid_board(remote_url, &board, board_number);
        }
        None => {
            eprintln!("Failed to parse identifier: {}", id);
        }
    }
}

fn main() {
    let args = Args::parse();

    let remote_url = if args.kbb {
        "https://www.saycbridge.com/json/autobid"
    } else {
        "https://sayc.abortz.net/json/autobid"
    };

    if !args.identifiers.is_empty() {
        for id in &args.identifiers {
            run_identifier(remote_url, id);
        }
    } else {
        run_random(remote_url);
    }
}
