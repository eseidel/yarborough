use clap::Parser;
use cli::reference_bidder::{default_z3b_path, Interpretation, ReferenceBidder};
use engine::{get_call_interpretations, CallInterpretation};
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::path::PathBuf;
use std::time::Duration;

#[derive(Parser, Debug)]
#[command(
    author,
    version,
    about = "Compare bid interpretations between yarborough and z3b"
)]
struct Args {
    /// Call histories to compare (comma-separated, e.g. "1C,P")
    histories: Vec<String>,

    /// Walk the bid tree up to this many bids deep (default mode when no histories given)
    #[arg(short, long, default_value_t = 2)]
    depth: usize,

    /// Dealer position (N, E, S, W)
    #[arg(long, default_value = "N")]
    dealer: String,

    /// Vulnerability (None, N-S, E-W, Both)
    #[arg(long, default_value = "None")]
    vulnerability: String,

    /// Delay between z3b requests in milliseconds
    #[arg(long, default_value_t = 100)]
    delay_ms: u64,

    /// Use kbb (remote) instead of z3b
    #[arg(long)]
    kbb: bool,

    /// Show all calls including matches, not just differences
    #[arg(short, long)]
    verbose: bool,

    /// Only show positions where this call appears (e.g. "1N", "X")
    #[arg(long)]
    call: Option<String>,

    /// Only show local (yarborough) interpretations, skip reference bidder calls
    #[arg(long)]
    local_only: bool,

    /// Path to saycbridge repo (for local z3b). Defaults to the saycbridge submodule.
    #[arg(long)]
    z3b_path: Option<PathBuf>,
}

// ── comparison types ──────────────────────────────────────────────────

#[derive(Debug)]
enum CallComparison {
    /// Both sides recognize the call (have a rule for it)
    Both {
        call: String,
        z3b_rule: String,
        z3b_constraints: String,
        ours_rule: String,
        ours_constraints: String,
    },
    /// Only the reference bidder recognizes the call
    RefOnly {
        call: String,
        ref_rule: String,
        ref_constraints: String,
    },
    /// Only yarborough recognizes the call
    OursOnly {
        call: String,
        ours_rule: String,
        ours_constraints: String,
    },
}

impl CallComparison {
    fn call_name(&self) -> &str {
        match self {
            Self::Both { call, .. } | Self::RefOnly { call, .. } | Self::OursOnly { call, .. } => {
                call
            }
        }
    }
}

struct PositionResult {
    history: String,
    comparisons: Vec<CallComparison>,
}

struct Stats {
    positions_explored: usize,
    both_recognized: usize,
    ref_only: usize,
    ours_only: usize,
}

// ── comparison logic ──────────────────────────────────────────────────

fn compare_position(
    ref_bidder: Option<&ReferenceBidder>,
    calls_string: &str,
    dealer: &str,
    vulnerability: &str,
    delay: Duration,
) -> Result<PositionResult, String> {
    let ref_interps: Vec<Interpretation> = match ref_bidder {
        Some(bidder) => bidder.interpret(calls_string, dealer, vulnerability, delay)?,
        None => Vec::new(),
    };
    let ref_map: BTreeMap<&str, &Interpretation> = ref_interps
        .iter()
        .map(|i| (i.call_name.as_str(), i))
        .collect();

    let ours: Vec<CallInterpretation> =
        get_call_interpretations(calls_string, dealer, vulnerability);
    let ours_map: BTreeMap<&str, &CallInterpretation> =
        ours.iter().map(|i| (i.call_name.as_str(), i)).collect();

    let all_calls: BTreeSet<&str> = ref_map.keys().chain(ours_map.keys()).copied().collect();

    let mut comparisons = Vec::new();
    for call in all_calls {
        let ref_entry = ref_map.get(call);
        let ours_entry = ours_map.get(call);

        let ref_recognized = ref_entry
            .and_then(|e| e.rule_name.as_deref())
            .is_some_and(|r| !r.is_empty());
        let ours_recognized = ours_entry.is_some_and(|e| !e.rule_name.is_empty());

        if !ref_recognized && !ours_recognized {
            continue;
        }

        let comparison = match (ref_recognized, ours_recognized) {
            (true, true) => {
                let ref_e = ref_entry.unwrap();
                let ours_e = ours_entry.unwrap();
                CallComparison::Both {
                    call: call.to_string(),
                    z3b_rule: ref_e.rule_name.clone().unwrap_or_default(),
                    z3b_constraints: ref_e.knowledge_string.clone().unwrap_or_default(),
                    ours_rule: ours_e.rule_name.clone(),
                    ours_constraints: ours_e.description.clone(),
                }
            }
            (true, false) => {
                let ref_e = ref_entry.unwrap();
                CallComparison::RefOnly {
                    call: call.to_string(),
                    ref_rule: ref_e.rule_name.clone().unwrap_or_default(),
                    ref_constraints: ref_e.knowledge_string.clone().unwrap_or_default(),
                }
            }
            (false, true) => {
                let ours_e = ours_entry.unwrap();
                CallComparison::OursOnly {
                    call: call.to_string(),
                    ours_rule: ours_e.rule_name.clone(),
                    ours_constraints: ours_e.description.clone(),
                }
            }
            (false, false) => unreachable!(),
        };
        comparisons.push(comparison);
    }

    Ok(PositionResult {
        history: if calls_string.is_empty() {
            "(opening)".to_string()
        } else {
            calls_string.replace(',', " ")
        },
        comparisons,
    })
}

// ── tree walking ──────────────────────────────────────────────────────

fn walk_tree(
    ref_bidder: Option<&ReferenceBidder>,
    dealer: &str,
    vulnerability: &str,
    max_depth: usize,
    delay: Duration,
) -> Vec<PositionResult> {
    let mut results = Vec::new();
    let mut queue: VecDeque<(String, usize)> = VecDeque::new();
    queue.push_back((String::new(), 0));

    let mut explored = 0usize;

    while let Some((history, depth)) = queue.pop_front() {
        explored += 1;
        eprint!(
            "\rExploring position {explored} (depth {depth}): {:<40}",
            if history.is_empty() {
                "(opening)"
            } else {
                &history
            }
        );

        match compare_position(ref_bidder, &history, dealer, vulnerability, delay) {
            Ok(result) => {
                if depth < max_depth {
                    // Expand recognized calls + Pass
                    let recognized_calls: Vec<String> = result
                        .comparisons
                        .iter()
                        .map(|c| c.call_name().to_string())
                        .collect();

                    for call in &recognized_calls {
                        let next = if history.is_empty() {
                            call.clone()
                        } else {
                            format!("{history},{call}")
                        };
                        queue.push_back((next, depth + 1));
                    }

                    // Always follow Pass to continue down the tree
                    if !recognized_calls.iter().any(|c| c == "P") {
                        let next = if history.is_empty() {
                            "P".to_string()
                        } else {
                            format!("{history},P")
                        };
                        queue.push_back((next, depth + 1));
                    }
                }

                results.push(result);
            }
            Err(e) => {
                eprintln!("\rError at [{history}]: {e}");
            }
        }
    }
    eprintln!("\r\x1b[K");

    results
}

// ── display ───────────────────────────────────────────────────────────

fn print_position(
    result: &PositionResult,
    ref_name: &str,
    verbose: bool,
    call_filter: Option<&str>,
) {
    let has_differences = result
        .comparisons
        .iter()
        .any(|c| !matches!(c, CallComparison::Both { .. }));

    if !verbose && !has_differences {
        return;
    }

    if let Some(filter) = call_filter {
        if !result.comparisons.iter().any(|c| c.call_name() == filter) {
            return;
        }
    }

    println!("History: {}", result.history);
    println!(
        "  {:<6} {:<20} {:<28} {:<20} {:<28}",
        "Call",
        format!("{ref_name} rule"),
        format!("{ref_name} constraints"),
        "ours rule",
        "ours constraints"
    );
    println!("  {}", "-".repeat(104));

    for comp in &result.comparisons {
        if let Some(filter) = call_filter {
            if comp.call_name() != filter {
                continue;
            }
        }

        match comp {
            CallComparison::Both {
                call,
                z3b_rule,
                z3b_constraints,
                ours_rule,
                ours_constraints,
            } => {
                if verbose {
                    println!(
                        "  {:<6} {:<20} {:<28} {:<20} {:<28}",
                        call,
                        truncate(z3b_rule, 20),
                        truncate(z3b_constraints, 28),
                        truncate(ours_rule, 20),
                        truncate(ours_constraints, 28),
                    );
                }
            }
            CallComparison::RefOnly {
                call,
                ref_rule,
                ref_constraints,
            } => {
                println!(
                    "  {:<6} {:<20} {:<28} {:<20} {:<28}  \x1b[31m\u{2190} {ref_name} only\x1b[0m",
                    call,
                    truncate(ref_rule, 20),
                    truncate(ref_constraints, 28),
                    "",
                    "",
                );
            }
            CallComparison::OursOnly {
                call,
                ours_rule,
                ours_constraints,
            } => {
                println!(
                    "  {:<6} {:<20} {:<28} {:<20} {:<28}  \x1b[32m\u{2190} ours only\x1b[0m",
                    call,
                    "",
                    "",
                    truncate(ours_rule, 20),
                    truncate(ours_constraints, 28),
                );
            }
        }
    }
    println!();
}

fn print_summary(results: &[PositionResult], ref_name: &str) {
    let mut stats = Stats {
        positions_explored: results.len(),
        both_recognized: 0,
        ref_only: 0,
        ours_only: 0,
    };

    let mut ref_only_by_history: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut ours_only_by_history: BTreeMap<String, Vec<String>> = BTreeMap::new();

    for result in results {
        for comp in &result.comparisons {
            match comp {
                CallComparison::Both { .. } => stats.both_recognized += 1,
                CallComparison::RefOnly { call, .. } => {
                    stats.ref_only += 1;
                    ref_only_by_history
                        .entry(result.history.clone())
                        .or_default()
                        .push(call.clone());
                }
                CallComparison::OursOnly { call, .. } => {
                    stats.ours_only += 1;
                    ours_only_by_history
                        .entry(result.history.clone())
                        .or_default()
                        .push(call.clone());
                }
            }
        }
    }

    let total = stats.both_recognized + stats.ref_only + stats.ours_only;

    println!("=== Summary ===");
    println!("Positions explored: {}", stats.positions_explored);
    println!("Recognized calls:  {} total", total);
    println!(
        "  Both:            {:>4} ({:.1}%)",
        stats.both_recognized,
        pct(stats.both_recognized, total)
    );
    println!(
        "  {ref_name} only:        {:>4} ({:.1}%)",
        stats.ref_only,
        pct(stats.ref_only, total)
    );
    println!(
        "  ours only:       {:>4} ({:.1}%)",
        stats.ours_only,
        pct(stats.ours_only, total)
    );
    println!();

    if !ref_only_by_history.is_empty() {
        println!("Calls {ref_name} recognizes that we don't:");
        for (history, calls) in &ref_only_by_history {
            println!("  [{history}] -> {}", calls.join(", "));
        }
        println!();
    }

    if !ours_only_by_history.is_empty() {
        println!("Calls we recognize that {ref_name} doesn't:");
        for (history, calls) in &ours_only_by_history {
            println!("  [{history}] -> {}", calls.join(", "));
        }
        println!();
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let truncated: String = s.chars().take(max - 1).collect();
        format!("{truncated}\u{2026}")
    }
}

fn pct(n: usize, total: usize) -> f64 {
    if total == 0 {
        0.0
    } else {
        100.0 * n as f64 / total as f64
    }
}

// ── main ──────────────────────────────────────────────────────────────

fn main() {
    let args = Args::parse();

    let ref_bidder = if args.local_only {
        None
    } else if args.kbb {
        Some(ReferenceBidder::Kbb(reqwest::blocking::Client::new()))
    } else {
        let path = args.z3b_path.clone().unwrap_or_else(default_z3b_path);
        Some(ReferenceBidder::Z3b(path))
    };

    let ref_name = ref_bidder.as_ref().map(|b| b.name()).unwrap_or("ref");
    let delay = Duration::from_millis(args.delay_ms);

    let results = if !args.histories.is_empty() {
        args.histories
            .iter()
            .filter_map(|h| {
                match compare_position(
                    ref_bidder.as_ref(),
                    h,
                    &args.dealer,
                    &args.vulnerability,
                    delay,
                ) {
                    Ok(r) => Some(r),
                    Err(e) => {
                        eprintln!("Error at [{h}]: {e}");
                        None
                    }
                }
            })
            .collect()
    } else {
        eprintln!(
            "Walking bid tree (depth {}, dealer {}, vuln {})...",
            args.depth, args.dealer, args.vulnerability
        );
        walk_tree(
            ref_bidder.as_ref(),
            &args.dealer,
            &args.vulnerability,
            args.depth,
            delay,
        )
    };

    for result in &results {
        print_position(result, ref_name, args.verbose, args.call.as_deref());
    }

    print_summary(&results, ref_name);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_truncate_short() {
        assert_eq!(truncate("hello", 10), "hello");
    }

    #[test]
    fn test_truncate_exact() {
        assert_eq!(truncate("hello", 5), "hello");
    }

    #[test]
    fn test_truncate_long() {
        assert_eq!(truncate("hello world", 8), "hello w\u{2026}");
    }

    #[test]
    fn test_pct_zero_total() {
        assert_eq!(pct(0, 0), 0.0);
    }

    #[test]
    fn test_pct_normal() {
        assert!((pct(1, 4) - 25.0).abs() < 0.001);
    }

    #[test]
    fn test_local_interpretations_exist() {
        let ours = get_call_interpretations("", "N", "NO");
        assert!(!ours.is_empty());
        assert!(ours.iter().any(|i| i.call_name == "P"));
    }

    #[test]
    fn test_local_interpretations_after_opening() {
        let ours = get_call_interpretations("1C", "N", "NO");
        assert!(!ours.is_empty());
        // Some responses should have rule names
        assert!(ours.iter().any(|i| !i.rule_name.is_empty()));
    }

    #[test]
    fn test_call_comparison_call_name() {
        let both = CallComparison::Both {
            call: "1C".into(),
            z3b_rule: "Rule".into(),
            z3b_constraints: "12+ hcp".into(),
            ours_rule: "Rule".into(),
            ours_constraints: "12+ hcp".into(),
        };
        assert_eq!(both.call_name(), "1C");

        let ref_only = CallComparison::RefOnly {
            call: "2N".into(),
            ref_rule: "Rule".into(),
            ref_constraints: "".into(),
        };
        assert_eq!(ref_only.call_name(), "2N");

        let ours = CallComparison::OursOnly {
            call: "X".into(),
            ours_rule: "Rule".into(),
            ours_constraints: "".into(),
        };
        assert_eq!(ours.call_name(), "X");
    }
}
