use crate::card::Card;
use crate::rank::Rank;
use crate::suit::Suit;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Hand {
    pub cards: Vec<Card>,
}

impl Hand {
    pub fn new(cards: Vec<Card>) -> Self {
        Self { cards }
    }

    pub fn hcp(&self) -> u8 {
        self.cards
            .iter()
            .map(|c| match c.rank {
                Rank::Ace => 4,
                Rank::King => 3,
                Rank::Queen => 2,
                Rank::Jack => 1,
                _ => 0,
            })
            .sum()
    }

    pub fn length(&self, suit: Suit) -> u8 {
        self.cards.iter().filter(|c| c.suit == suit).count() as u8
    }

    pub fn distribution(&self) -> [u8; 4] {
        [
            self.length(Suit::Spades),
            self.length(Suit::Hearts),
            self.length(Suit::Diamonds),
            self.length(Suit::Clubs),
        ]
    }

    pub fn sort(&mut self) {
        self.cards.sort_by(|a, b| {
            if a.suit != b.suit {
                // Reverse suit order: S, H, D, C
                let suit_val = |s: Suit| match s {
                    Suit::Spades => 3,
                    Suit::Hearts => 2,
                    Suit::Diamonds => 1,
                    Suit::Clubs => 0,
                };
                suit_val(b.suit).cmp(&suit_val(a.suit))
            } else {
                b.rank.cmp(&a.rank)
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hcp_calculation() {
        let hand = Hand::new(vec![
            Card::new(Suit::Spades, Rank::Ace),
            Card::new(Suit::Hearts, Rank::King),
            Card::new(Suit::Diamonds, Rank::Queen),
            Card::new(Suit::Clubs, Rank::Jack),
            Card::new(Suit::Spades, Rank::Two),
        ]);
        assert_eq!(hand.hcp(), 10);
    }

    #[test]
    fn test_distribution() {
        let hand = Hand::new(vec![
            Card::new(Suit::Spades, Rank::Ace),
            Card::new(Suit::Spades, Rank::King),
            Card::new(Suit::Hearts, Rank::Queen),
        ]);
        let dist = hand.distribution();
        assert_eq!(dist, [2, 1, 0, 0]);
    }
}
