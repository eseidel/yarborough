use clap::Parser;
use engine::{get_interpretations, CallInterpretation};
use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
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

    /// Only show local (yarborough) interpretations, skip z3b calls
    #[arg(long)]
    local_only: bool,

    /// Path to saycbridge repo (for local z3b). Defaults to the saycbridge submodule.
    #[arg(long)]
    z3b_path: Option<PathBuf>,
}

fn default_z3b_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../saycbridge")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from("saycbridge"))
}

// ── z3b types ─────────────────────────────────────────────────────────

#[derive(Deserialize, Debug)]
struct Z3bInterpretation {
    call_name: String,
    #[serde(default)]
    rule_name: Option<String>,
    #[serde(default)]
    knowledge_string: Option<String>,
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
    /// Only z3b recognizes the call
    Z3bOnly {
        call: String,
        z3b_rule: String,
        z3b_constraints: String,
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
            Self::Both { call, .. } | Self::Z3bOnly { call, .. } | Self::OursOnly { call, .. } => {
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
    z3b_only: usize,
    ours_only: usize,
}

// ── z3b source: local CLI or remote HTTP ──────────────────────────────

enum Z3bSource {
    Local(PathBuf),
    Remote(reqwest::blocking::Client, String),
}

fn get_z3b_interpretations_local(
    z3b_path: &Path,
    calls_string: &str,
    dealer: &str,
    vulnerability: &str,
) -> Result<Vec<Z3bInterpretation>, String> {
    let python = z3b_path.join(".venv/bin/python");
    let cli = z3b_path.join("z3b_cli.py");

    let output = Command::new(&python)
        .env("PYTHONPATH", z3b_path.join("src"))
        .arg(&cli)
        .arg("interpret")
        .arg("--calls")
        .arg(calls_string)
        .arg("--dealer")
        .arg(dealer)
        .arg("--vulnerability")
        .arg(vulnerability)
        .output()
        .map_err(|e| format!("Failed to run z3b_cli.py: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("z3b_cli.py failed: {stderr}"));
    }

    serde_json::from_slice(&output.stdout).map_err(|e| format!("JSON: {e}"))
}

fn get_z3b_interpretations_remote(
    client: &reqwest::blocking::Client,
    remote_url: &str,
    calls_string: &str,
    dealer: &str,
    vulnerability: &str,
    delay: Duration,
) -> Result<Vec<Z3bInterpretation>, String> {
    thread::sleep(delay);

    // Build URL manually to avoid reqwest encoding commas in calls_string
    let url = format!(
        "{remote_url}?calls_string={calls_string}&dealer={dealer}&vulnerability={vulnerability}"
    );

    let response = client.get(&url).send().map_err(|e| format!("HTTP: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    response
        .json::<Vec<Z3bInterpretation>>()
        .map_err(|e| format!("JSON: {e}"))
}

fn get_z3b_interpretations(
    source: &Z3bSource,
    calls_string: &str,
    dealer: &str,
    vulnerability: &str,
    delay: Duration,
) -> Result<Vec<Z3bInterpretation>, String> {
    match source {
        Z3bSource::Local(path) => {
            get_z3b_interpretations_local(path, calls_string, dealer, vulnerability)
        }
        Z3bSource::Remote(client, url) => {
            get_z3b_interpretations_remote(client, url, calls_string, dealer, vulnerability, delay)
        }
    }
}

// ── comparison logic ──────────────────────────────────────────────────

fn compare_position(
    source: &Z3bSource,
    calls_string: &str,
    dealer: &str,
    vulnerability: &str,
    delay: Duration,
    local_only: bool,
) -> Result<PositionResult, String> {
    let z3b = if local_only {
        Vec::new()
    } else {
        get_z3b_interpretations(source, calls_string, dealer, vulnerability, delay)?
    };
    let z3b_map: BTreeMap<&str, &Z3bInterpretation> =
        z3b.iter().map(|i| (i.call_name.as_str(), i)).collect();

    let ours: Vec<CallInterpretation> = get_interpretations(calls_string, dealer, vulnerability);
    let ours_map: BTreeMap<&str, &CallInterpretation> =
        ours.iter().map(|i| (i.call_name.as_str(), i)).collect();

    let all_calls: BTreeSet<&str> = z3b_map.keys().chain(ours_map.keys()).copied().collect();

    let mut comparisons = Vec::new();
    for call in all_calls {
        let z3b_entry = z3b_map.get(call);
        let ours_entry = ours_map.get(call);

        let z3b_recognized = z3b_entry
            .and_then(|e| e.rule_name.as_deref())
            .is_some_and(|r| !r.is_empty());
        let ours_recognized = ours_entry.is_some_and(|e| !e.rule_name.is_empty());

        if !z3b_recognized && !ours_recognized {
            continue;
        }

        let comparison = match (z3b_recognized, ours_recognized) {
            (true, true) => {
                let z3b_e = z3b_entry.unwrap();
                let ours_e = ours_entry.unwrap();
                CallComparison::Both {
                    call: call.to_string(),
                    z3b_rule: z3b_e.rule_name.clone().unwrap_or_default(),
                    z3b_constraints: z3b_e.knowledge_string.clone().unwrap_or_default(),
                    ours_rule: ours_e.rule_name.clone(),
                    ours_constraints: ours_e.description.clone(),
                }
            }
            (true, false) => {
                let z3b_e = z3b_entry.unwrap();
                CallComparison::Z3bOnly {
                    call: call.to_string(),
                    z3b_rule: z3b_e.rule_name.clone().unwrap_or_default(),
                    z3b_constraints: z3b_e.knowledge_string.clone().unwrap_or_default(),
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
    source: &Z3bSource,
    dealer: &str,
    vulnerability: &str,
    max_depth: usize,
    delay: Duration,
    local_only: bool,
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

        match compare_position(source, &history, dealer, vulnerability, delay, local_only) {
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

fn print_position(result: &PositionResult, verbose: bool, call_filter: Option<&str>) {
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
        "Call", "z3b rule", "z3b constraints", "ours rule", "ours constraints"
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
            CallComparison::Z3bOnly {
                call,
                z3b_rule,
                z3b_constraints,
            } => {
                println!(
                    "  {:<6} {:<20} {:<28} {:<20} {:<28}  \x1b[31m← z3b only\x1b[0m",
                    call,
                    truncate(z3b_rule, 20),
                    truncate(z3b_constraints, 28),
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
                    "  {:<6} {:<20} {:<28} {:<20} {:<28}  \x1b[32m← ours only\x1b[0m",
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

fn print_summary(results: &[PositionResult]) {
    let mut stats = Stats {
        positions_explored: results.len(),
        both_recognized: 0,
        z3b_only: 0,
        ours_only: 0,
    };

    let mut z3b_only_by_history: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut ours_only_by_history: BTreeMap<String, Vec<String>> = BTreeMap::new();

    for result in results {
        for comp in &result.comparisons {
            match comp {
                CallComparison::Both { .. } => stats.both_recognized += 1,
                CallComparison::Z3bOnly { call, .. } => {
                    stats.z3b_only += 1;
                    z3b_only_by_history
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

    let total = stats.both_recognized + stats.z3b_only + stats.ours_only;

    println!("=== Summary ===");
    println!("Positions explored: {}", stats.positions_explored);
    println!("Recognized calls:  {} total", total);
    println!(
        "  Both:            {:>4} ({:.1}%)",
        stats.both_recognized,
        pct(stats.both_recognized, total)
    );
    println!(
        "  z3b only:        {:>4} ({:.1}%)",
        stats.z3b_only,
        pct(stats.z3b_only, total)
    );
    println!(
        "  ours only:       {:>4} ({:.1}%)",
        stats.ours_only,
        pct(stats.ours_only, total)
    );
    println!();

    if !z3b_only_by_history.is_empty() {
        println!("Calls z3b recognizes that we don't:");
        for (history, calls) in &z3b_only_by_history {
            println!("  [{history}] -> {}", calls.join(", "));
        }
        println!();
    }

    if !ours_only_by_history.is_empty() {
        println!("Calls we recognize that z3b doesn't:");
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
        format!("{truncated}…")
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

    let source = if args.kbb {
        Z3bSource::Remote(
            reqwest::blocking::Client::new(),
            "https://www.saycbridge.com/json/interpret2".into(),
        )
    } else if args.local_only {
        // local_only doesn't need z3b at all, use a dummy
        Z3bSource::Local(PathBuf::new())
    } else {
        let path = args.z3b_path.clone().unwrap_or_else(default_z3b_path);
        Z3bSource::Local(path)
    };

    let delay = Duration::from_millis(args.delay_ms);

    let results = if !args.histories.is_empty() {
        args.histories
            .iter()
            .filter_map(|h| {
                match compare_position(
                    &source,
                    h,
                    &args.dealer,
                    &args.vulnerability,
                    delay,
                    args.local_only,
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
            &source,
            &args.dealer,
            &args.vulnerability,
            args.depth,
            delay,
            args.local_only,
        )
    };

    for result in &results {
        print_position(result, args.verbose, args.call.as_deref());
    }

    print_summary(&results);
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
        assert_eq!(truncate("hello world", 8), "hello w…");
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
        let ours = get_interpretations("", "N", "NO");
        assert!(!ours.is_empty());
        assert!(ours.iter().any(|i| i.call_name == "P"));
    }

    #[test]
    fn test_local_interpretations_after_opening() {
        let ours = get_interpretations("1C", "N", "NO");
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

        let z3b = CallComparison::Z3bOnly {
            call: "2N".into(),
            z3b_rule: "Rule".into(),
            z3b_constraints: "".into(),
        };
        assert_eq!(z3b.call_name(), "2N");

        let ours = CallComparison::OursOnly {
            call: "X".into(),
            ours_rule: "Rule".into(),
            ours_constraints: "".into(),
        };
        assert_eq!(ours.call_name(), "X");
    }
}
