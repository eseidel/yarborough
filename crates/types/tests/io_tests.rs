use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use types::io::identifier;

#[derive(Debug, Deserialize)]
struct TestVector {
    name: String,
    board_number: u32,
    dealer: String,
    #[allow(dead_code)]
    vulnerability: String,
    #[allow(dead_code)]
    hands: HashMap<String, String>,
    #[allow(dead_code)]
    auction: Vec<String>,
    expected: HashMap<String, String>,
}

#[test]
fn test_io_roundtrip() {
    let yaml_content =
        fs::read_to_string("../../tests/board/formats.yaml").expect("Failed to read test vectors");
    let vectors: Vec<TestVector> =
        serde_yaml::from_str(&yaml_content).expect("Failed to parse test vectors");

    for vector in vectors {
        // Verify identifier format
        if let Some(expected_identifier) = vector.expected.get("identifier") {
            let (imported_board, imported_auction) = identifier::import_board(expected_identifier)
                .unwrap_or_else(|| panic!("{}: Failed to import identifier", vector.name));

            assert_eq!(
                imported_board.dealer.to_char().to_string(),
                vector.dealer.chars().next().unwrap().to_string(),
                "Dealer mismatch for {}",
                vector.name
            );

            // Re-export and compare
            let exported_identifier = identifier::export_board(
                &imported_board,
                vector.board_number,
                imported_auction.as_ref(),
            );
            assert_eq!(
                exported_identifier, *expected_identifier,
                "Identifier roundtrip failed for {}",
                vector.name
            );
        }
    }
}
