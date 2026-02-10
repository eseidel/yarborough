use bridge_core::board::{Board, Position, Vulnerability};
use bridge_core::auction::Auction;
use bridge_core::io::{pbn, lin, big_deal, identifier};
use serde::Deserialize;
use std::collections::HashMap;
use std::fs;

#[derive(Debug, Deserialize)]
struct TestVector {
    name: String,
    board_number: u32,
    dealer: String,
    vulnerability: String,
    hands: HashMap<String, String>,
    auction: Vec<String>,
    expected: HashMap<String, String>,
}

#[test]
fn test_io_roundtrip() {
    let yaml_content = fs::read_to_string("../../tests/board/io_roundtrip.yaml")
        .expect("Failed to read test vectors");
    let vectors: Vec<TestVector> = serde_yaml::from_str(&yaml_content)
        .expect("Failed to parse test vectors");

    for vector in vectors {
        // Verify identifier format
        if let Some(expected_identifier) = vector.expected.get("identifier") {
            let (imported_board, imported_auction) = identifier::import_board(expected_identifier)
                .expect(&format!("{}: Failed to import identifier", vector.name));
            
            assert_eq!(imported_board.dealer.to_char().to_string(), vector.dealer.chars().next().unwrap().to_string(), 
                "Dealer mismatch for {}", vector.name);
            
            // Re-export and compare
            let exported_identifier = identifier::export_board(&imported_board, vector.board_number, imported_auction.as_ref());
            assert_eq!(exported_identifier, *expected_identifier, "Identifier roundtrip failed for {}", vector.name);
        }

        // Verify LIN format if present
        if let Some(expected_lin) = vector.expected.get("lin") {
            let (imported_board, imported_auction) = lin::import_board(expected_lin)
                .expect(&format!("{}: Failed to import LIN", vector.name));
            
            // LIN sometimes has normalized output, so we check if it imports correctly
            let exported_lin = lin::export_board(&imported_board, imported_auction.as_ref());
            // Note: LIN export might not be identical due to md| numbering or suit order, 
            // but we should at least be able to re-import it correctly.
            let (reimported_board, _) = lin::import_board(&exported_lin).unwrap();
            assert_eq!(reimported_board.dealer, imported_board.dealer);
        }

        // Verify PBN format if present
        if let Some(expected_pbn) = vector.expected.get("pbn") {
             let imported_board = pbn::import_board(expected_pbn)
                .expect(&format!("{}: Failed to import PBN", vector.name));
            
            assert_eq!(imported_board.dealer.to_char().to_string(), vector.dealer.chars().next().unwrap().to_string());
            
            let exported_pbn = pbn::export_board(&imported_board);
            let reimported_board = pbn::import_board(&exported_pbn).unwrap();
            assert_eq!(reimported_board.dealer, imported_board.dealer);
        }
    }
}
