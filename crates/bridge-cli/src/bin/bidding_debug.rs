// cspell:ignore AKQJT
use bridge_cli::bidding_utils::*;
use bridge_core::auction::Auction;
use bridge_core::board::Board;
use bridge_core::call::Call;
use bridge_core::io::identifier;
use bridge_engine::nbk;
use clap::Parser;

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
