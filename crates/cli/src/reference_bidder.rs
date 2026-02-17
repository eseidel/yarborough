use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::Duration;
use types::board::{Board, Position, Vulnerability};
use types::call::Call;
use types::hand::Hand;
use types::suit::Suit;

/// A reference bidding engine to compare against yarborough.
///
/// Z3b is the local saycbridge implementation (subprocess to z3b_cli.py).
/// Kbb is the legacy remote implementation (HTTP to saycbridge.com).
pub enum ReferenceBidder {
    Z3b(PathBuf),
    Kbb(reqwest::blocking::Client),
}

/// Interpretation of a call from the reference bidder.
#[derive(Deserialize, Debug)]
pub struct Interpretation {
    pub call_name: String,
    #[serde(default)]
    pub rule_name: Option<String>,
    #[serde(default)]
    pub knowledge_string: Option<String>,
}

#[derive(Deserialize)]
struct AutobidResponse {
    calls_string: String,
}

/// Returns the default path to the saycbridge submodule.
pub fn default_z3b_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../saycbridge")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from("saycbridge"))
}

impl ReferenceBidder {
    /// Auto-bid an entire deal, returning the sequence of calls.
    pub fn autobid(&self, board: &Board, board_number: u32) -> Result<Vec<Call>, String> {
        match self {
            Self::Z3b(path) => autobid_z3b(path, board, board_number),
            Self::Kbb(client) => autobid_kbb(client, board, board_number),
        }
    }

    /// Get interpretations for all legal calls at a given auction position.
    pub fn interpret(
        &self,
        calls_string: &str,
        dealer: &str,
        vulnerability: &str,
        delay: Duration,
    ) -> Result<Vec<Interpretation>, String> {
        match self {
            Self::Z3b(path) => interpret_z3b(path, calls_string, dealer, vulnerability),
            Self::Kbb(client) => interpret_kbb(client, calls_string, dealer, vulnerability, delay),
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
            Self::Z3b(_) => "z3b",
            Self::Kbb(_) => "kbb",
        }
    }
}

// ── hand formatting ───────────────────────────────────────────────────

pub fn format_hand_cdhs(hand: &Hand) -> String {
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

// ── vulnerability format mapping ──────────────────────────────────────

fn vulnerability_z3b(v: Vulnerability) -> &'static str {
    match v {
        Vulnerability::None => "None",
        Vulnerability::NS => "N-S",
        Vulnerability::EW => "E-W",
        Vulnerability::Both => "Both",
    }
}

fn vulnerability_kbb(v: Vulnerability) -> &'static str {
    match v {
        Vulnerability::None => "NO",
        Vulnerability::NS => "NS",
        Vulnerability::EW => "EW",
        Vulnerability::Both => "BOTH",
    }
}

// ── z3b (local subprocess) ────────────────────────────────────────────

fn run_z3b_cli(z3b_path: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let python = z3b_path.join(".venv/bin/python");
    let cli = z3b_path.join("z3b_cli.py");

    let output = Command::new(&python)
        .env("PYTHONPATH", z3b_path.join("src"))
        .arg(&cli)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run z3b_cli.py: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("z3b_cli.py failed: {stderr}"));
    }

    Ok(output.stdout)
}

fn autobid_z3b(z3b_path: &Path, board: &Board, board_number: u32) -> Result<Vec<Call>, String> {
    let number = board_number.to_string();
    let dealer = board.dealer.to_char().to_string();
    let vuln = vulnerability_z3b(board.vulnerability);
    let north = board
        .hands
        .get(&Position::North)
        .map(format_hand_cdhs)
        .unwrap_or_default();
    let east = board
        .hands
        .get(&Position::East)
        .map(format_hand_cdhs)
        .unwrap_or_default();
    let south = board
        .hands
        .get(&Position::South)
        .map(format_hand_cdhs)
        .unwrap_or_default();
    let west = board
        .hands
        .get(&Position::West)
        .map(format_hand_cdhs)
        .unwrap_or_default();

    let stdout = run_z3b_cli(
        z3b_path,
        &[
            "autobid",
            "--number",
            &number,
            "--dealer",
            &dealer,
            "--vulnerability",
            vuln,
            "--north",
            &north,
            "--east",
            &east,
            "--south",
            &south,
            "--west",
            &west,
        ],
    )?;

    let autobid: AutobidResponse =
        serde_json::from_slice(&stdout).map_err(|e| format!("JSON: {e}"))?;

    Ok(autobid
        .calls_string
        .split_whitespace()
        .filter_map(|s| s.parse().ok())
        .collect())
}

fn interpret_z3b(
    z3b_path: &Path,
    calls_string: &str,
    dealer: &str,
    vulnerability: &str,
) -> Result<Vec<Interpretation>, String> {
    let stdout = run_z3b_cli(
        z3b_path,
        &[
            "interpret",
            "--calls",
            calls_string,
            "--dealer",
            dealer,
            "--vulnerability",
            vulnerability,
        ],
    )?;

    serde_json::from_slice(&stdout).map_err(|e| format!("JSON: {e}"))
}

// ── kbb (remote HTTP) ─────────────────────────────────────────────────

fn autobid_kbb(
    client: &reqwest::blocking::Client,
    board: &Board,
    board_number: u32,
) -> Result<Vec<Call>, String> {
    let params = [
        ("number", board_number.to_string()),
        (
            "vulnerability",
            vulnerability_kbb(board.vulnerability).to_string(),
        ),
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
        .get("https://www.saycbridge.com/json/autobid")
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

fn interpret_kbb(
    client: &reqwest::blocking::Client,
    calls_string: &str,
    dealer: &str,
    vulnerability: &str,
    delay: Duration,
) -> Result<Vec<Interpretation>, String> {
    thread::sleep(delay);

    // Build URL manually to avoid reqwest encoding commas in calls_string
    let url = format!(
        "https://www.saycbridge.com/json/interpret2?calls_string={calls_string}&dealer={dealer}&vulnerability={vulnerability}"
    );

    let response = client.get(&url).send().map_err(|e| format!("HTTP: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    response
        .json::<Vec<Interpretation>>()
        .map_err(|e| format!("JSON: {e}"))
}
