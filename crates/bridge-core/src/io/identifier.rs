use crate::auction::Auction;
use crate::board::{Board, Position, Vulnerability};
use crate::call::Call;
use crate::card::Card;
use crate::hand::Hand;
use crate::rank::Rank;
use crate::suit::Suit;
use std::collections::HashMap;

/// Imports a board and optionally an auction from a saycbridge identifier.
/// Format: <board_number>-<deal_hex>[:<call_history>]
pub fn import_board(identifier: &str) -> Option<(Board, Option<Auction>)> {
    let components: Vec<&str> = identifier.split('-').collect();
    if components.len() < 2 {
        return None;
    }

    let board_number_str = components[0];
    let board_number: u32 = board_number_str.parse().ok()?;

    let (deal_identifier, call_history_str) = if components.len() == 2 {
        let second_part = components[1];
        if let Some(colon_idx) = second_part.find(':') {
            (
                &second_part[..colon_idx],
                Some(&second_part[colon_idx + 1..]),
            )
        } else {
            (second_part, None)
        }
    } else {
        // Format: board_number-deal_identifier-call_history_identifier
        (components[1], components.get(2).copied())
    };

    let hands = import_hex_deal(deal_identifier)?;
    let dealer = Position::dealer_from_board_number(board_number);
    let vulnerability = Vulnerability::from_board_number(board_number);

    let board = Board {
        dealer,
        vulnerability,
        hands,
    };

    let mut auction = None;
    if let Some(chs) = call_history_str {
        let mut a = Auction::new(dealer);
        let calls_str = if chs.contains(':') {
            // It might be dealer:vulnerability:calls format from CallHistory.identifier
            chs.split(':').last()?
        } else {
            chs
        };

        let separator = if calls_str.contains(',') { ',' } else { ' ' };
        for call_name in calls_str.split(separator) {
            let call_name = call_name.trim();
            if call_name.is_empty() {
                continue;
            }
            let call = Call::from_str(call_name)?;
            a.add_call(call);
        }
        auction = Some(a);
    }

    Some((board, auction))
}

pub fn import_hex_deal(identifier: &str) -> Option<HashMap<Position, Hand>> {
    if identifier.len() != 26 {
        return None;
    }

    let mut hands_cards: [Vec<Card>; 4] = [Vec::new(), Vec::new(), Vec::new(), Vec::new()];
    let hex_chars = "0123456789abcdef";

    for (char_idx, c) in identifier.chars().enumerate() {
        let hex_val = hex_chars.find(c.to_ascii_lowercase())? as u8;
        let high_pos_idx = (hex_val / 4) as usize;
        let low_pos_idx = (hex_val % 4) as usize;

        let high_card_id = char_idx as u8 * 2;
        let low_card_id = char_idx as u8 * 2 + 1;

        if let Some(card) = card_from_id(high_card_id) {
            hands_cards[high_pos_idx].push(card);
        }
        if let Some(card) = card_from_id(low_card_id) {
            hands_cards[low_pos_idx].push(card);
        }
    }

    let mut hands = HashMap::new();
    let positions = [
        Position::North,
        Position::East,
        Position::South,
        Position::West,
    ];
    for (i, cards) in hands_cards.into_iter().enumerate() {
        hands.insert(positions[i], Hand { cards });
    }

    Some(hands)
}

fn card_from_id(id: u8) -> Option<Card> {
    if id >= 52 {
        return None;
    }
    let suit_idx = id / 13;
    let rank_idx = id % 13;

    let suit = match suit_idx {
        0 => Suit::Clubs,
        1 => Suit::Diamonds,
        2 => Suit::Hearts,
        3 => Suit::Spades,
        _ => return None,
    };

    let rank = Rank::ALL[rank_idx as usize];
    Some(Card { suit, rank })
}

pub fn export_board(board: &Board, board_number: u32, auction: Option<&Auction>) -> String {
    let mut identifier = format!("{}-{}", board_number, export_hex_deal(&board.hands));
    if let Some(a) = auction {
        if !a.calls.is_empty() {
            let calls_str: Vec<String> = a.calls.iter().map(|c| c.render()).collect();
            identifier.push_str(&format!(":{}", calls_str.join(",")));
        }
    }
    identifier
}

pub fn export_hex_deal(hands: &HashMap<Position, Hand>) -> String {
    let mut position_for_card = [0u8; 52];
    let positions = [
        Position::North,
        Position::East,
        Position::South,
        Position::West,
    ];

    for (pos_idx, pos) in positions.iter().enumerate() {
        if let Some(hand) = hands.get(pos) {
            for card in &hand.cards {
                let card_id = card_id(card);
                if card_id < 52 {
                    position_for_card[card_id as usize] = pos_idx as u8;
                }
            }
        }
    }

    let mut identifier = String::with_capacity(26);
    let hex_chars = "0123456789abcdef".as_bytes();
    for i in 0..26 {
        let high = position_for_card[i * 2];
        let low = position_for_card[i * 2 + 1];
        let hex_val = high * 4 + low;
        identifier.push(hex_chars[hex_val as usize] as char);
    }
    identifier
}

fn card_id(card: &Card) -> u8 {
    let suit_idx = match card.suit {
        Suit::Clubs => 0,
        Suit::Diamonds => 1,
        Suit::Hearts => 2,
        Suit::Spades => 3,
    };
    let rank_idx = match card.rank {
        Rank::Two => 0,
        Rank::Three => 1,
        Rank::Four => 2,
        Rank::Five => 3,
        Rank::Six => 4,
        Rank::Seven => 5,
        Rank::Eight => 6,
        Rank::Nine => 7,
        Rank::Ten => 8,
        Rank::Jack => 9,
        Rank::Queen => 10,
        Rank::King => 11,
        Rank::Ace => 12,
    };
    suit_idx * 13 + rank_idx
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_card_id_mapping() {
        assert_eq!(
            card_id(&Card {
                suit: Suit::Clubs,
                rank: Rank::Two
            }),
            0
        );
        assert_eq!(
            card_id(&Card {
                suit: Suit::Clubs,
                rank: Rank::Ace
            }),
            12
        );
        assert_eq!(
            card_id(&Card {
                suit: Suit::Spades,
                rank: Rank::Ace
            }),
            51
        );
    }

    #[test]
    fn test_hex_deal_roundtrip() {
        let mut hands = HashMap::new();
        let positions = [
            Position::North,
            Position::East,
            Position::South,
            Position::West,
        ];

        // Distribute all 52 cards
        for i in 0..52 {
            let pos = positions[(i % 4) as usize];
            let hand = hands.entry(pos).or_insert(Hand { cards: Vec::new() });
            hand.cards.push(card_from_id(i).unwrap());
        }

        let exported = export_hex_deal(&hands);
        assert_eq!(exported.len(), 26);
        let imported = import_hex_deal(&exported).unwrap();

        for pos in positions {
            assert_eq!(imported.get(&pos).unwrap().cards.len(), 13);
        }
    }

    #[test]
    fn test_import_board_identifier() {
        // Board 1, Deal identifier (all cards to North for simplicity of hex construction)
        // North is 0. 0*4 + 0 = 0. So 26 '0's means all cards to North.
        let identifier = "1-00000000000000000000000000:1S,P,X,XX";
        let (board, auction) = import_board(identifier).unwrap();

        assert_eq!(board.dealer, Position::North);
        assert_eq!(board.vulnerability, Vulnerability::None);
        assert_eq!(board.hands.get(&Position::North).unwrap().cards.len(), 52);

        let a = auction.unwrap();
        assert_eq!(a.calls.len(), 4);
        assert!(matches!(
            a.calls[0],
            Call::Bid {
                level: 1,
                strain: crate::strain::Strain::Spades
            }
        ));
        assert!(matches!(a.calls[1], Call::Pass));
        assert!(matches!(a.calls[2], Call::Double));
        assert!(matches!(a.calls[3], Call::Redouble));
    }
}
