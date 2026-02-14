/// Compare the yarborough bidder against z3b or kbb.
/// Similar to saycbridge/scripts/bidder-fight
use bridge_core::auction::Auction;
use bridge_core::board::{Board, Position, Vulnerability};
use bridge_core::call::Call;
use bridge_core::hand::Hand;
use bridge_core::io::identifier;
use bridge_core::suit::Suit;
use bridge_engine::load_engine;
use rand::Rng;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Deserialize)]
struct AutobidResponse {
    calls_string: String,
}

struct BidderFight {
    remote_url: String,
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

impl BidderFight {
    fn new(remote_url: String) -> Self {
        Self { remote_url }
    }

    fn get_remote_auction(&self, board: &Board, board_number: u32) -> Result<Vec<Call>, String> {
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
            .get(&self.remote_url)
            .query(&params)
            .send()
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        let autobid: AutobidResponse = response
            .json()
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        // Parse the calls string (format: "1C P 1D P ...")
        let calls: Vec<Call> = autobid
            .calls_string
            .split_whitespace()
            .filter_map(|s| s.parse().ok())
            .collect();

        Ok(calls)
    }

    fn bid_board(&self, board: &Board, board_number: u32) {
        // Get remote auction first
        let remote_calls = match self.get_remote_auction(board, board_number) {
            Ok(calls) => calls,
            Err(e) => {
                eprintln!("Failed to get remote auction: {}", e);
                return;
            }
        };

        let mut local_auction = Auction::new(board.dealer);
        let mut remote_index = 0;

        // Bid until complete
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

            let engine = load_engine();
            let local_call = engine
                .get_best_bid(hand, &local_auction)
                .map(|(call, _variant)| call)
                .unwrap_or(Call::Pass);

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

    fn run_random(&self) {
        println!("Comparing yarborough vs remote at {}\n", self.remote_url);
        println!("Press Ctrl+C to stop\n");

        let mut rng = rand::thread_rng();
        loop {
            let board_number = rng.gen_range(1..=16);
            let board = generate_random_board(board_number, &mut rng);
            self.bid_board(&board, board_number);
        }
    }

    fn run_identifier(&self, identifier: &str) {
        match identifier::import_board(identifier) {
            Some((board, auction)) => {
                // Extract board number from identifier if possible
                let board_number = identifier
                    .split('-')
                    .next()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(1);

                // If there's an existing auction in the identifier, we'd need to handle that
                // For now, just bid from the start
                if auction.is_some() {
                    eprintln!("Warning: identifier contains existing auction, will bid from start");
                }

                self.bid_board(&board, board_number);
            }
            None => {
                eprintln!("Failed to parse identifier: {}", identifier);
            }
        }
    }
}

fn render_auction(auction: &Auction) -> String {
    auction
        .calls
        .iter()
        .map(|c| c.render())
        .collect::<Vec<_>>()
        .join(" ")
}

fn generate_random_board(board_number: u32, rng: &mut impl rand::Rng) -> Board {
    use bridge_core::card::Card;
    use bridge_core::rank::Rank;
    use rand::seq::SliceRandom;

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

    Board {
        dealer: Position::dealer_from_board_number(board_number),
        vulnerability: Vulnerability::from_board_number(board_number),
        hands,
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();

    // Default to z3b
    let remote_url = if args.len() > 1 && args[1] == "--kbb" {
        "https://www.saycbridge.com/json/autobid"
    } else {
        "https://sayc.abortz.net/json/autobid"
    };

    let fight = BidderFight::new(remote_url.to_string());

    // If identifiers provided, test those specific boards
    let identifiers: Vec<&str> = args
        .iter()
        .skip(1)
        .filter(|s| s.as_str() != "--kbb")
        .map(|s| s.as_str())
        .collect();

    if !identifiers.is_empty() {
        for identifier in identifiers {
            fight.run_identifier(identifier);
        }
    } else {
        // Otherwise run random boards
        fight.run_random();
    }
}
