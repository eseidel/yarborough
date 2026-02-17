use clap::Parser;
use engine::{generate_random_board, select_bid};
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use serde::Deserialize;
use std::collections::BTreeMap;
use types::auction::Auction;
use types::board::{Board, Position, Vulnerability};
use types::call::Call;
use types::hand::Hand;
use types::io::identifier;
use types::suit::Suit;

#[derive(Parser, Debug)]
#[command(
    author,
    version,
    about = "Batch-compare yarborough bidder against z3b with statistics and categorization"
)]
struct Args {
    /// Board identifier(s) to test (detailed output per board)
    identifiers: Vec<String>,

    /// Number of random boards to compare
    #[arg(short = 'n', long, default_value_t = 200)]
    count: usize,

    /// Random seed for reproducible runs (random if omitted, always printed)
    #[arg(short, long)]
    seed: Option<u64>,

    /// Show all individual differences, not just top examples
    #[arg(short, long)]
    verbose: bool,

    /// Max examples shown per category
    #[arg(long, default_value_t = 3)]
    examples: usize,

    /// Only show examples whose category contains this substring
    #[arg(long)]
    category: Option<String>,

    /// Use kbb (old) instead of z3b
    #[arg(long)]
    kbb: bool,
}

// ── types ──────────────────────────────────────────────────────────────

struct Difference {
    board_id: String,
    position: Position,
    hand_str: String,
    auction_so_far: String,
    remote_bid: Call,
    local_bid: Call,
    category: String,
}

enum BoardResult {
    Agree,
    Differ(Difference),
    Error(String),
}

#[derive(Deserialize)]
struct AutobidResponse {
    calls_string: String,
}

// ── helpers ────────────────────────────────────────────────────────────

fn format_hand_cdhs(hand: &Hand) -> String {
    Suit::ALL
        .iter()
        .map(|&suit| {
            hand.cards
                .iter()
                .filter(|c| c.suit == suit)
                .map(|c| c.rank.to_char().to_string())
                .collect::<Vec<_>>()
                .join("")
        })
        .collect::<Vec<_>>()
        .join(".")
}

fn render_auction(auction: &Auction) -> String {
    auction
        .calls
        .iter()
        .map(|c| c.render())
        .collect::<Vec<_>>()
        .join(" ")
}

/// Classify the bidding context for the current player.
fn categorize(auction: &Auction, bidder: Position) -> String {
    let partner = bidder.partner();

    let count_bids = |pos: Position| -> usize {
        auction
            .iter()
            .filter(|(p, c)| *p == pos && c.is_bid())
            .count()
    };

    let my = count_bids(bidder);
    let partners = count_bids(partner);
    let opp = count_bids(bidder.lho()) + count_bids(bidder.rho());
    let opener = auction.opener();
    let we_opened = opener.is_some_and(|o| o == bidder || o == partner);

    match (my, partners, opp, we_opened) {
        (0, 0, 0, _) => "Opening".into(),
        (0, p, 0, _) if p > 0 => "Response".into(),
        (0, 0, o, _) if o > 0 => "Overcall".into(),
        (0, _, _, true) => "Contested Response".into(),
        (0, _, _, false) => "Advance".into(),
        (_, _, 0, _) if opener == Some(bidder) => "Opener Rebid".into(),
        (_, _, 0, _) => "Responder Rebid".into(),
        _ => "Competitive".into(),
    }
}

// ── remote API ─────────────────────────────────────────────────────────

fn get_remote_auction(
    client: &reqwest::blocking::Client,
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

    let response = client
        .get(remote_url)
        .query(&params)
        .send()
        .map_err(|e| format!("HTTP: {e}"))?;

    let autobid: AutobidResponse = response.json().map_err(|e| format!("JSON: {e}"))?;

    Ok(autobid
        .calls_string
        .split_whitespace()
        .filter_map(|s| s.parse().ok())
        .collect())
}

// ── board comparison ───────────────────────────────────────────────────

fn compare_board(
    client: &reqwest::blocking::Client,
    remote_url: &str,
    board: &Board,
    board_number: u32,
) -> BoardResult {
    let remote_calls = match get_remote_auction(client, remote_url, board, board_number) {
        Ok(c) => c,
        Err(e) => return BoardResult::Error(e),
    };

    let mut local_auction = Auction::new(board.dealer);
    let mut remote_index = 0;

    while !local_auction.is_finished() && remote_index < remote_calls.len() {
        let current_player = local_auction.current_player();
        let hand = match board.hands.get(&current_player) {
            Some(h) => h,
            None => return BoardResult::Error("Missing hand".into()),
        };

        let remote_call = remote_calls[remote_index];
        remote_index += 1;

        let local_call = select_bid(hand, &local_auction).unwrap_or(Call::Pass);

        if local_call != remote_call {
            let category = categorize(&local_auction, current_player);
            return BoardResult::Differ(Difference {
                board_id: identifier::export_board(board, board_number, None),
                position: current_player,
                hand_str: format_hand_cdhs(hand),
                auction_so_far: render_auction(&local_auction),
                remote_bid: remote_call,
                local_bid: local_call,
                category,
            });
        }

        local_auction.add_call(local_call);
    }

    BoardResult::Agree
}

// ── identifier mode ────────────────────────────────────────────────────

fn run_identifiers(remote_url: &str, ids: &[String]) {
    let client = reqwest::blocking::Client::new();
    for id in ids {
        let Some((board, _auction)) = identifier::import_board(id) else {
            eprintln!("Failed to parse: {id}");
            continue;
        };
        let board_number = id
            .split('-')
            .next()
            .and_then(|s| s.parse().ok())
            .unwrap_or(1);

        match compare_board(&client, remote_url, &board, board_number) {
            BoardResult::Agree => println!("{id}: Agree"),
            BoardResult::Differ(d) => {
                println!("{id}: DIFFER [{}]", d.category);
                println!("  {:?} hand: {}", d.position, d.hand_str);
                println!(
                    "  Auction: {}",
                    if d.auction_so_far.is_empty() {
                        "-"
                    } else {
                        &d.auction_so_far
                    }
                );
                println!(
                    "  z3b: {} | ours: {}",
                    d.remote_bid.render(),
                    d.local_bid.render()
                );
            }
            BoardResult::Error(e) => eprintln!("{id}: Error: {e}"),
        }
    }
}

// ── batch mode ─────────────────────────────────────────────────────────

fn run_batch(args: &Args, remote_url: &str) {
    let seed = args.seed.unwrap_or_else(|| rand::thread_rng().gen());
    eprintln!("Seed: {seed} | Boards: {}", args.count);

    // Generate all boards deterministically from the seed.
    let mut rng = StdRng::seed_from_u64(seed);
    let client = reqwest::blocking::Client::new();
    let total = args.count;

    // Compare sequentially (z3b is a single server, no parallelism benefit).
    let results: Vec<BoardResult> = (0..total)
        .map(|i| {
            let n = rng.gen_range(1..=16);
            let board = generate_random_board(n, &mut rng);
            let r = compare_board(&client, remote_url, &board, n);
            eprint!("\rProgress: {}/{total}", i + 1);
            r
        })
        .collect();
    eprintln!("\r\x1b[K"); // clear progress line

    // Tally.
    let mut agrees = 0usize;
    let mut errors = 0usize;
    let mut diffs: Vec<Difference> = Vec::new();
    for r in results {
        match r {
            BoardResult::Agree => agrees += 1,
            BoardResult::Differ(d) => diffs.push(d),
            BoardResult::Error(_) => errors += 1,
        }
    }

    // Group by category.
    let mut by_cat: BTreeMap<&str, Vec<&Difference>> = BTreeMap::new();
    for d in &diffs {
        by_cat.entry(&d.category).or_default().push(d);
    }

    // ── summary line ───────────────────────────────────────────────────
    println!("Seed: {seed}");
    println!(
        "Boards: {total} | Agree: {agrees} ({:.1}%) | Differ: {} ({:.1}%) | Errors: {errors}",
        pct(agrees, total),
        diffs.len(),
        pct(diffs.len(), total),
    );
    println!();

    if diffs.is_empty() {
        println!("Perfect agreement!");
        return;
    }

    // ── category table ─────────────────────────────────────────────────
    let mut cats: Vec<_> = by_cat.iter().collect();
    cats.sort_by(|a, b| b.1.len().cmp(&a.1.len()));

    let max_count = cats.first().map(|(_, v)| v.len()).unwrap_or(1);
    let bar_width = 20;

    println!("Differences by category:");
    for (cat, items) in &cats {
        let n = items.len();
        let bar_len = (n * bar_width / max_count).max(1);
        let bar: String = "\u{2588}".repeat(bar_len);
        println!(
            "  {:<24} {:>3}  {:<20} ({:>4.1}%)",
            cat,
            n,
            bar,
            pct(n, diffs.len())
        );
    }
    println!();

    // ── per-category detail ────────────────────────────────────────────
    for (cat, items) in &cats {
        if let Some(ref filter) = args.category {
            if !cat.to_lowercase().contains(&filter.to_lowercase()) {
                continue;
            }
        }

        // Bid-pair patterns.
        let mut pairs: BTreeMap<String, usize> = BTreeMap::new();
        for d in *items {
            let key = format!(
                "ours:{} z3b:{}",
                d.local_bid.render(),
                d.remote_bid.render()
            );
            *pairs.entry(key).or_default() += 1;
        }
        let mut pair_list: Vec<_> = pairs.iter().collect();
        pair_list.sort_by(|a, b| b.1.cmp(a.1));
        let pairs_str: String = pair_list
            .iter()
            .take(5)
            .map(|(k, v)| format!("{k} ({v})"))
            .collect::<Vec<_>>()
            .join(", ");

        println!("{cat} ({}):", items.len());
        println!("  Patterns: {pairs_str}");

        let limit = if args.verbose {
            items.len()
        } else {
            args.examples
        };
        for d in items.iter().take(limit) {
            let auc = if d.auction_so_far.is_empty() {
                "-"
            } else {
                &d.auction_so_far
            };
            println!(
                "    {} {:?}: {} after [{}] \u{2192} z3b: {}, ours: {}",
                d.board_id,
                d.position,
                d.hand_str,
                auc,
                d.remote_bid.render(),
                d.local_bid.render(),
            );
        }
        if !args.verbose && items.len() > args.examples {
            println!("    ... and {} more", items.len() - args.examples);
        }
        println!();
    }
}

fn pct(n: usize, total: usize) -> f64 {
    if total == 0 {
        0.0
    } else {
        100.0 * n as f64 / total as f64
    }
}

// ── main ───────────────────────────────────────────────────────────────

fn main() {
    let args = Args::parse();

    let remote_url = if args.kbb {
        "https://www.saycbridge.com/json/autobid"
    } else {
        "https://sayc.abortz.net/json/autobid"
    };

    if !args.identifiers.is_empty() {
        run_identifiers(remote_url, &args.identifiers);
    } else {
        run_batch(&args, remote_url);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cat(dealer: Position, calls: &str, bidder: Position) -> String {
        let auction = Auction::bidding(dealer, calls);
        assert_eq!(
            auction.current_player(),
            bidder,
            "expected {:?} to bid next after {:?} deals {:?}",
            bidder,
            dealer,
            calls
        );
        categorize(&auction, bidder)
    }

    #[test]
    fn opening_no_prior_bids() {
        // Dealer opens
        assert_eq!(cat(Position::North, "", Position::North), "Opening");
        // After one pass
        assert_eq!(cat(Position::North, "P", Position::East), "Opening");
        // After three passes
        assert_eq!(cat(Position::North, "P P P", Position::West), "Opening");
    }

    #[test]
    fn response_uncontested() {
        // Partner opened 1C, no interference
        assert_eq!(cat(Position::North, "1C P", Position::South), "Response");
        // Partner opened after a pass
        assert_eq!(cat(Position::North, "P 1H P", Position::West), "Response");
    }

    #[test]
    fn overcall_opponent_opened() {
        // RHO opened 1C, our turn (East)
        assert_eq!(cat(Position::North, "1C", Position::East), "Overcall");
        // N passed, E opened 1D, South's turn (opponent opened, partner passed)
        assert_eq!(cat(Position::North, "P 1D", Position::South), "Overcall");
    }

    #[test]
    fn contested_response_partner_opened_opp_interfered() {
        // Partner opened 1C, RHO overcalled 1H, our turn
        assert_eq!(
            cat(Position::North, "1C 1H", Position::South),
            "Contested Response"
        );
    }

    #[test]
    fn advance_partner_overcalled() {
        // Opponents opened, partner overcalled, our turn
        assert_eq!(cat(Position::North, "1C 1S P", Position::West), "Advance");
    }

    #[test]
    fn opener_rebid() {
        // We opened 1H, partner responded 2H, our turn again
        assert_eq!(
            cat(Position::North, "1H P 2H P", Position::North),
            "Opener Rebid"
        );
    }

    #[test]
    fn responder_rebid() {
        // Partner opened 1C, we responded 1H, partner rebid 1N, our turn
        assert_eq!(
            cat(Position::North, "1C P 1H P 1N P", Position::South),
            "Responder Rebid"
        );
    }

    #[test]
    fn competitive_both_sides_bid() {
        // Complex competitive: 1C - 1H - 2C - 2H, it's opener's turn
        assert_eq!(
            cat(Position::North, "1C 1H 2C 2H", Position::North),
            "Competitive"
        );
    }
}
