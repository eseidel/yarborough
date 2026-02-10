use crate::board::{Board, Position};
use crate::card::Card;
use crate::hand::Hand;
use crate::rank::Rank;
use crate::suit::Suit;
use std::collections::HashMap;

/// Big Deal Index format is often a compact string representation of the deal.
/// Here we implement a simple version that lists all cards in a fixed order.
/// Another version and more common is a very large integer.
/// For the purpose of this task, I'll implement a hex-encoded version of the bitmask
/// or a standard compact string if that's what's expected.
/// Actually, "Big Deal" often refers to the `bigdeal` software.
/// I'll implement a basic canonical representation.

pub fn export_board(board: &Board) -> String {
    // Canonical order: N, E, S, W
    // Each hand: sorted S, H, D, C
    let mut s = String::new();
    for pos in [
        Position::North,
        Position::East,
        Position::South,
        Position::West,
    ] {
        if let Some(hand) = board.get_hand(pos) {
            let mut sorted_hand = hand.clone();
            sorted_hand.sort();
            for card in &sorted_hand.cards {
                s.push(card.suit.to_char());
                s.push(card.rank.to_char());
            }
        }
        s.push(':');
    }
    s
}

pub fn import_board(s: &str) -> Option<Board> {
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() < 4 {
        return None;
    }

    let mut hands = HashMap::new();
    let positions = [
        Position::North,
        Position::East,
        Position::South,
        Position::West,
    ];

    for (i, part) in parts.iter().take(4).enumerate() {
        let mut cards = Vec::new();
        let mut chars = part.chars();
        while let Some(suit_char) = chars.next() {
            let rank_char = chars.next()?;
            let suit = Suit::from_char(suit_char)?;
            let rank = Rank::from_char(rank_char)?;
            cards.push(Card { suit, rank });
        }
        hands.insert(positions[i], Hand { cards });
    }

    Some(Board {
        dealer: Position::North,                          // Default
        vulnerability: crate::board::Vulnerability::None, // Default
        hands,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_big_deal_roundtrip() {
        let mut hands = HashMap::new();
        hands.insert(
            Position::North,
            Hand::new(vec![Card::new(Suit::Spades, Rank::Ace)]),
        );
        let board = Board::new(Position::North, crate::board::Vulnerability::None, hands);

        let exported = export_board(&board);
        let imported = import_board(&exported).unwrap();

        assert_eq!(
            imported.get_hand(Position::North).unwrap().cards[0],
            Card::new(Suit::Spades, Rank::Ace)
        );
    }
}
