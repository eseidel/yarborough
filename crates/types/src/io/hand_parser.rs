use crate::card::Card;
use crate::hand::Hand;
use crate::rank::Rank;
use crate::suit::Suit;

/// Parses a hand string in the format "Clubs.Diamonds.Hearts.Spades".
///
/// This format is commonly used in test cases (like `sayc_standard.yaml`)
/// and represents suits in ascending order of rank (C, D, H, S).
///
pub fn parse_hand(s: &str) -> Hand {
    let suits: Vec<&str> = s.split('.').collect();
    let mut cards = Vec::new();
    let suit_order = [Suit::Clubs, Suit::Diamonds, Suit::Hearts, Suit::Spades];
    for (i, suit_str) in suits.iter().enumerate() {
        if i >= suit_order.len() {
            break;
        }
        let suit = suit_order[i];
        for c in suit_str.chars() {
            if let Some(rank) = Rank::from_char(c) {
                cards.push(Card { suit, rank });
            }
        }
    }
    Hand { cards }
}
