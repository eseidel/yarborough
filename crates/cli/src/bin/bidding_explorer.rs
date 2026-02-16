use cli::bidding_utils;
use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::{Backend, CrosstermBackend},
    layout::{Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, ListState, Paragraph, Wrap},
    Frame, Terminal,
};
use std::{error::Error, fs, io, path::PathBuf, process::Command};

#[derive(Debug, Clone, PartialEq)]
enum TestStatus {
    NotRun,
    Passed,
    Failed {
        expected: Option<String>,
        actual: String,
    },
    #[allow(dead_code)]
    Error(String),
}

#[derive(Debug, Clone)]
struct TestCase {
    raw_line: String,
    line_number: usize,
    hand: String,
    expected: Option<String>, // The expected bid string (or None if ambiguous/comment)
    history: String,
    vulnerability: String,
    status: TestStatus,
    trace: Option<String>,
}

#[derive(Debug, Clone)]
struct TestSuite {
    name: String,
    tests: Vec<TestCase>,
    expanded: bool,
}

struct App {
    suites: Vec<TestSuite>,
    // We will flattening the list for the UI: Suite Header -> Tests -> Suite Header ...
    // But maybe it's better to just have a selected suite and selected test index.
    // Let's use a flat list representation for navigation.
    items: Vec<ListItemType>,
    list_state: ListState,

    // View state
    show_passing: bool,
    detail_view: bool, // If true, show full trace of selected test

    // Path to the test file
    test_file_path: PathBuf,
}

#[derive(Clone)]
enum ListItemType {
    SuiteHeader(usize),     // Index into App.suites
    TestCase(usize, usize), // (Suite Index, Test Index)
}

impl App {
    fn new(path: PathBuf) -> Result<App, Box<dyn Error>> {
        let content = fs::read_to_string(&path)?;
        let suites = parse_yaml_manual(&content);

        let mut app = App {
            suites,
            items: Vec::new(),
            list_state: ListState::default(),
            show_passing: true,
            detail_view: false,
            test_file_path: path,
        };
        app.update_items();
        if !app.items.is_empty() {
            app.list_state.select(Some(0));
        }
        app.run_all_tests();
        Ok(app)
    }

    fn run_all_tests(&mut self) {
        for s_idx in 0..self.suites.len() {
            for t_idx in 0..self.suites[s_idx].tests.len() {
                self.run_test(s_idx, t_idx);
            }
        }
    }

    fn update_items(&mut self) {
        self.items.clear();
        for (s_idx, suite) in self.suites.iter().enumerate() {
            self.items.push(ListItemType::SuiteHeader(s_idx));
            if suite.expanded {
                for (t_idx, test) in suite.tests.iter().enumerate() {
                    if !self.show_passing {
                        if let TestStatus::Passed = test.status {
                            continue;
                        }
                    }
                    self.items.push(ListItemType::TestCase(s_idx, t_idx));
                }
            }
        }
    }

    fn next(&mut self) {
        let i = match self.list_state.selected() {
            Some(i) => {
                if i >= self.items.len() - 1 {
                    0
                } else {
                    i + 1
                }
            }
            None => 0,
        };
        self.list_state.select(Some(i));
    }

    fn previous(&mut self) {
        let i = match self.list_state.selected() {
            Some(i) => {
                if i == 0 {
                    self.items.len() - 1
                } else {
                    i - 1
                }
            }
            None => 0,
        };
        self.list_state.select(Some(i));
    }

    fn toggle_expand(&mut self) {
        if let Some(selected) = self.list_state.selected() {
            if let Some(ListItemType::SuiteHeader(s_idx)) = self.items.get(selected) {
                self.suites[*s_idx].expanded = !self.suites[*s_idx].expanded;
                self.update_items();
            }
        }
    }

    fn toggle_passing(&mut self) {
        self.show_passing = !self.show_passing;
        self.update_items();
        self.list_state.select(Some(0)); // Reset selection to avoid out of bounds
    }

    fn enter_detail(&mut self) {
        if let Some(selected) = self.list_state.selected() {
            if let Some(ListItemType::TestCase(_, _)) = self.items.get(selected) {
                self.detail_view = true;
            }
        }
    }

    fn exit_detail(&mut self) {
        self.detail_view = false;
    }

    fn run_selected(&mut self) {
        if let Some(selected) = self.list_state.selected() {
            if let Some(item) = self.items.clone().get(selected) {
                match item {
                    ListItemType::SuiteHeader(s_idx) => {
                        // Run all tests in suite
                        let suite_tests_len = self.suites[*s_idx].tests.len();
                        for t_idx in 0..suite_tests_len {
                            self.run_test(*s_idx, t_idx);
                        }
                    }
                    ListItemType::TestCase(s_idx, t_idx) => {
                        self.run_test(*s_idx, *t_idx);
                        // Also auto-enter detail view if it wasn't already Open?
                        // self.detail_view = true;
                    }
                }
            }
        }
    }

    fn run_test(&mut self, s_idx: usize, t_idx: usize) {
        let test = &mut self.suites[s_idx].tests[t_idx];

        // Reconstruct JSON for parse_test_case (a bit hacky but reuses existing logic)
        // We need to parse the raw line carefully or use the fields we manually parsed.
        // Let's rely on bidding_utils::parse_test_case if we can reconstruct the JSON.
        // Actually, let's just use the fields we have to build the inputs directly.

        // Hand
        let hand = types::io::hand_parser::parse_hand(&test.hand);

        // Vulnerability
        let _vulnerability = match test.vulnerability.as_str() {
            "N-S" | "NS" => types::board::Vulnerability::NS,
            "E-W" | "EW" => types::board::Vulnerability::EW,
            "Both" | "All" => types::board::Vulnerability::Both,
            _ => types::board::Vulnerability::None,
        };

        // History
        let history = bidding_utils::parse_calls(&test.history);
        let mut auction = types::auction::Auction::new(types::board::Position::North);
        for call in &history {
            auction.add_call(*call);
        }

        let current_player = auction.current_player();

        // Trace
        let trace = engine::nbk::select_bid_with_trace(&hand, &auction, current_player);

        let actual_bid = trace
            .selected_call
            .map(|c| c.render())
            .unwrap_or_else(|| "P".to_string());
        let trace_str = bidding_utils::format_full_trace(history.len() + 1, &trace);

        test.trace = Some(trace_str);

        if let Some(expected) = &test.expected {
            // Basic comparison. Note: "Pass" vs "P" etc.
            let match_res = expected == &actual_bid
                || ((expected == "P" || expected == "Pass")
                    && (actual_bid == "P" || actual_bid == "Pass"));

            if match_res {
                test.status = TestStatus::Passed;
            } else {
                test.status = TestStatus::Failed {
                    expected: Some(expected.clone()),
                    actual: actual_bid,
                };
            }
        } else {
            // No expectation, just mark as passed (or info?)
            test.status = TestStatus::Passed;
        }
    }

    fn update_expectation(&mut self) {
        if let Some(selected) = self.list_state.selected() {
            if let Some(ListItemType::TestCase(s_idx, t_idx)) = self.items.get(selected) {
                let test = &mut self.suites[*s_idx].tests[*t_idx];
                if let TestStatus::Failed { actual, .. } = &test.status {
                    if let Ok(content) = fs::read_to_string(&self.test_file_path) {
                        let lines: Vec<&str> = content.lines().collect();
                        if test.line_number > 0 && test.line_number <= lines.len() {
                            let line = lines[test.line_number - 1];
                            if let Some(start) = line.find('[') {
                                if let Some(end) = line.rfind(']') {
                                    let json_part = &line[start..=end];
                                    if let Ok(mut parts) =
                                        serde_json::from_str::<Vec<String>>(json_part)
                                    {
                                        if !parts.is_empty() {
                                            if parts.len() < 2 {
                                                parts.push(actual.clone());
                                            } else {
                                                parts[1] = actual.clone();
                                            }
                                            let new_json = serde_json::to_string(&parts).unwrap();
                                            let new_line = format!(
                                                "{}{}{}",
                                                &line[..start],
                                                new_json,
                                                &line[end + 1..]
                                            );
                                            let mut new_content = String::new();
                                            for (i, l) in lines.iter().enumerate() {
                                                if i == test.line_number - 1 {
                                                    new_content.push_str(&new_line);
                                                } else {
                                                    new_content.push_str(l);
                                                }
                                                new_content.push('\n');
                                            }
                                            if fs::write(&self.test_file_path, new_content).is_ok()
                                            {
                                                test.expected = Some(actual.clone());
                                                test.status = TestStatus::Passed;
                                                test.raw_line = new_line;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    fn file_github_issue(&self) {
        if let Some(selected) = self.list_state.selected() {
            if let Some(ListItemType::TestCase(s_idx, t_idx)) = self.items.get(selected) {
                let test = &self.suites[*s_idx].tests[*t_idx];
                if let Some(trace) = &test.trace {
                    let title = format!(
                        "Bidding Error: {} should bid {:?}",
                        test.hand, test.expected
                    );
                    let body = format!(
                        "## Test Case\nHand: {}\nExpected: {:?}\nHistory: {}\nVuln: {}\n\n## Trace\n```\n{}\n```",
                        test.hand, test.expected, test.history, test.vulnerability, trace
                    );
                    let _ = Command::new("gh")
                        .arg("issue")
                        .arg("create")
                        .arg("--title")
                        .arg(title)
                        .arg("--body")
                        .arg(body)
                        .arg("--web")
                        .spawn();
                }
            }
        }
    }
}

// Very basic manual YAML parser to preserve structure
// This is brittle and assumes the specific formatting of sayc_standard.yaml
fn parse_yaml_manual(content: &str) -> Vec<TestSuite> {
    let mut suites = Vec::new();
    let mut current_suite: Option<TestSuite> = None;

    for (line_idx, line) in content.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if !line.starts_with(' ') && line.ends_with(':') {
            // New Suite
            if let Some(s) = current_suite.take() {
                suites.push(s);
            }
            let name = line.trim_end_matches(':').to_string();
            current_suite = Some(TestSuite {
                name,
                tests: Vec::new(),
                expanded: true, // Default expanded?
            });
        } else if trimmed.starts_with("- [") {
            if let Some(ref mut suite) = current_suite {
                // Parse test case line
                // Format: - ["Hand", "Expected"?, "History"?, "Vuln"?] # comments

                // Extract the JSON-like array part
                if let Some(start_bracket) = trimmed.find('[') {
                    if let Some(end_bracket) = trimmed.rfind(']') {
                        let json_part = &trimmed[start_bracket..=end_bracket];
                        if let Ok(parts) = serde_json::from_str::<Vec<String>>(json_part) {
                            if !parts.is_empty() {
                                let hand = parts[0].clone();
                                let expected = parts.get(1).cloned();
                                let history = parts.get(2).cloned().unwrap_or_default();
                                let vulnerability =
                                    parts.get(3).cloned().unwrap_or_else(|| "None".to_string());

                                suite.tests.push(TestCase {
                                    raw_line: line.to_string(),
                                    line_number: line_idx + 1,
                                    hand,
                                    expected,
                                    history,
                                    vulnerability,
                                    status: TestStatus::NotRun,
                                    trace: None,
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    if let Some(s) = current_suite {
        suites.push(s);
    }

    suites
}

fn main() -> Result<(), Box<dyn Error>> {
    // Setup terminal
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    // Load Data
    let _project_root = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    // Assuming running from crate root or workspace root.
    // Let's try to find the file relative to where we might be.
    // The user path was /Users/abarth/git/yarborough/tests/bidding/sayc_standard.yaml
    // We can hardcode absolute for now or try to be smart.
    // Let's use the path from metadata provided in prompt if possible, or relative.
    let test_path = PathBuf::from("../../tests/bidding/sayc_standard.yaml");
    // Note: If running from cargo run --bin associated with engine crate, CWD might be the user workspace root.
    // Let's check if the file exists there.
    let final_path = if test_path.exists() {
        test_path
    } else {
        PathBuf::from("tests/bidding/sayc_standard.yaml")
    };

    if !final_path.exists() {
        // Fallback for absolute path seen in prompt
        PathBuf::from("/Users/abarth/git/yarborough/tests/bidding/sayc_standard.yaml")
    } else {
        final_path
    };

    let mut app = App::new(PathBuf::from(
        "/Users/abarth/git/yarborough/tests/bidding/sayc_standard.yaml",
    ))
    .or_else(|_| App::new(PathBuf::from("tests/bidding/sayc_standard.yaml")))?;

    let res = run_app(&mut terminal, &mut app);

    // Restore terminal
    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    )?;
    terminal.show_cursor()?;

    if let Err(err) = res {
        println!("{:?}", err)
    }

    Ok(())
}

fn run_app<B: Backend>(terminal: &mut Terminal<B>, app: &mut App) -> io::Result<()> {
    loop {
        terminal.draw(|f| ui(f, app))?;

        if let Event::Key(key) = event::read()? {
            match key.code {
                KeyCode::Char('q') => return Ok(()),
                KeyCode::Left | KeyCode::Char('h') if app.detail_view => {
                    app.exit_detail();
                }
                KeyCode::Char('h') => app.toggle_passing(),
                KeyCode::Down | KeyCode::Char('j') => app.next(),
                KeyCode::Up | KeyCode::Char('k') => app.previous(),
                KeyCode::Enter | KeyCode::Right | KeyCode::Char('l') => {
                    if app.detail_view {
                        // maybe nothing?
                    } else {
                        // If header, toggle. If item, enter detail?
                        // User requested "Zoom in or click or go in-depth on one of the test cases"
                        // Maybe Enter runs it?
                        if let Some(selected) = app.list_state.selected() {
                            match app.items.get(selected) {
                                Some(ListItemType::SuiteHeader(_)) => app.toggle_expand(),
                                Some(ListItemType::TestCase(_, _)) => {
                                    app.run_selected(); // Ensure it is run
                                    app.enter_detail();
                                }
                                None => {}
                            }
                        }
                    }
                }
                KeyCode::Esc => {
                    if app.detail_view {
                        app.exit_detail();
                    } else {
                        return Ok(());
                    }
                }
                KeyCode::Char('r') => app.run_selected(),
                KeyCode::Char('u') => app.update_expectation(),
                KeyCode::Char('g') => app.file_github_issue(),
                _ => {}
            }
        }
    }
}

fn ui(f: &mut Frame, app: &mut App) {
    if app.detail_view {
        let size = f.area();
        // Show detail view
        // Maybe split: Top summary, Bottom Trace

        let selected = app.list_state.selected().unwrap_or(0);
        let item = app.items.get(selected);

        if let Some(ListItemType::TestCase(s_idx, t_idx)) = item {
            let test = &app.suites[*s_idx].tests[*t_idx];

            let chunks = Layout::default()
                .direction(Direction::Vertical)
                .constraints([Constraint::Length(6), Constraint::Min(0)].as_ref())
                .split(size);

            let summary_text = vec![
                Line::from(format!("Suite: {}", app.suites[*s_idx].name)),
                Line::from(format!("Hand: {}", test.hand)),
                Line::from(format!(
                    "Expected: {:?} | Actual: {}",
                    test.expected,
                    match &test.status {
                        TestStatus::Failed { actual, .. } => actual,
                        TestStatus::Passed => test.expected.as_deref().unwrap_or("Pass"),
                        _ => "Not Run",
                    }
                )),
                Line::from(format!("History: {}", test.history)),
                Line::from(format!("Vuln: {}", test.vulnerability)),
            ];

            let summary = Paragraph::new(summary_text).block(
                Block::default()
                    .borders(Borders::ALL)
                    .title("Test Case Summary"),
            );
            f.render_widget(summary, chunks[0]);

            let trace_text = test
                .trace
                .as_deref()
                .unwrap_or("No trace available. Run the test first.");
            let trace = Paragraph::new(trace_text)
                .block(Block::default().borders(Borders::ALL).title("Trace"))
                .wrap(Wrap { trim: true }); // Enable wrapping
            f.render_widget(trace, chunks[1]);
        }
    } else {
        // Main List View
        let size = f.area();
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Min(0), Constraint::Length(3)].as_ref())
            .split(size);

        let items: Vec<ListItem> = app
            .items
            .iter()
            .map(|item| match item {
                ListItemType::SuiteHeader(idx) => {
                    let suite = &app.suites[*idx];
                    let prefix = if suite.expanded { "▼" } else { "▶" };
                    let content = format!("{} {}", prefix, suite.name);
                    ListItem::new(Span::styled(
                        content,
                        Style::default().add_modifier(Modifier::BOLD),
                    ))
                }
                ListItemType::TestCase(s_idx, t_idx) => {
                    let test = &app.suites[*s_idx].tests[*t_idx];
                    let status_symbol = match test.status {
                        TestStatus::NotRun => "○",
                        TestStatus::Passed => "✓",
                        TestStatus::Failed { .. } => "✗",
                        TestStatus::Error(_) => "!",
                    };
                    let color = match test.status {
                        TestStatus::NotRun => Color::Gray,
                        TestStatus::Passed => Color::Green,
                        TestStatus::Failed { .. } => Color::Red,
                        TestStatus::Error(_) => Color::Yellow,
                    };

                    let bid_info = match &test.status {
                        TestStatus::Failed { expected, actual } => {
                            format!(
                                "{:?} (got {:?})",
                                expected.as_deref().unwrap_or("?"),
                                actual
                            )
                        }
                        _ => format!("{:?}", test.expected.as_deref().unwrap_or("?")),
                    };

                    let content = format!(
                        "  {} {} -> {} ({})",
                        status_symbol, test.hand, bid_info, test.history
                    );
                    ListItem::new(Span::styled(content, Style::default().fg(color)))
                }
            })
            .collect();

        let list = List::new(items)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title("Bridge Bidding Tests"),
            )
            .highlight_style(
                Style::default()
                    .bg(Color::DarkGray)
                    .add_modifier(Modifier::BOLD),
            )
            .highlight_symbol(">> ");

        f.render_stateful_widget(list, chunks[0], &mut app.list_state);
        // I should just change ui signature or clone the state to render (passed list state handles offset).
        // Since I'm not updating the state *during* render (only reading offset), I can use a RefCell or just hold state in App and pass it.
        // BUT render_stateful_widget takes &mut ListState to update offset.
        // I will change ui signature.
    }
}
