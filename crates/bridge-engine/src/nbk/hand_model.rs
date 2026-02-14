//! Hand model for NBK bidding analysis

use bridge_core::{Hand, Shape, Suit};

/// Analysis of the current hand for bidding purposes
#[derive(Debug, Clone)]
pub struct HandModel {
    /// High Card Points (A=4, K=3, Q=2, J=1)
    pub hcp: u8,
    /// Length of each suit (indexed by Suit::ALL order: C, D, H, S)
    pub lengths: [u8; 4],
    /// Shape classification
    pub shape: Shape,
}

impl HandModel {
    /// Create a HandModel from a Hand
    pub fn from_hand(hand: &Hand) -> Self {
        let hcp = hand.hcp();
        let distribution = hand.distribution();
        let shape = hand.shape();

        // Convert distribution to match Suit::ALL order (C, D, H, S)
        // distribution() returns [S, H, D, C]
        let lengths = [
            distribution[3], // Clubs
            distribution[2], // Diamonds
            distribution[1], // Hearts
            distribution[0], // Spades
        ];

        Self {
            hcp,
            lengths,
            shape,
        }
    }

    /// Get the length of a specific suit
    pub fn length(&self, suit: Suit) -> u8 {
        // Suit::ALL is [C, D, H, S], so we can use it as an index
        let index = Suit::ALL.iter().position(|&s| s == suit).unwrap();
        self.lengths[index]
    }

    /// Get the longest suit in the hand
    pub fn longest_suit(&self) -> Suit {
        let mut max_len = 0;
        let mut longest = Suit::Clubs;

        for &suit in &Suit::ALL {
            let len = self.length(suit);
            if len > max_len {
                max_len = len;
                longest = suit;
            }
        }

        longest
    }

    /// Check if we have an 8+ card fit with partner in the given suit
    pub fn has_fit_with(&self, partner_suit: Suit, partner_min_length: u8) -> bool {
        self.length(partner_suit) + partner_min_length >= 8
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bridge_core::{Card, Rank};

    fn make_hand(spades: u8, hearts: u8, diamonds: u8, clubs: u8) -> Hand {
        let mut cards = Vec::new();

        for _ in 0..spades {
            cards.push(Card::new(Suit::Spades, Rank::Two));
        }
        for _ in 0..hearts {
            cards.push(Card::new(Suit::Hearts, Rank::Two));
        }
        for _ in 0..diamonds {
            cards.push(Card::new(Suit::Diamonds, Rank::Two));
        }
        for _ in 0..clubs {
            cards.push(Card::new(Suit::Clubs, Rank::Two));
        }

        Hand::new(cards)
    }

    #[test]
    fn test_hand_model_creation() {
        let hand = bridge_core::io::pbn::import_hand("A.K.Q.J").unwrap();

        let model = HandModel::from_hand(&hand);
        assert_eq!(model.hcp, 10);
        assert_eq!(model.length(Suit::Spades), 1);
        assert_eq!(model.length(Suit::Hearts), 1);
        assert_eq!(model.length(Suit::Diamonds), 1);
        assert_eq!(model.length(Suit::Clubs), 1);
    }

    #[test]
    fn test_longest_suit() {
        let hand = make_hand(5, 4, 2, 2);
        let model = HandModel::from_hand(&hand);
        assert_eq!(model.longest_suit(), Suit::Spades);
    }

    #[test]
    fn test_has_fit_with() {
        let hand = make_hand(5, 4, 2, 2);
        let model = HandModel::from_hand(&hand);

        // 5 + 3 = 8, should have fit
        assert!(model.has_fit_with(Suit::Spades, 3));

        // 4 + 4 = 8, should have fit
        assert!(model.has_fit_with(Suit::Hearts, 4));

        // 2 + 5 = 7, no fit
        assert!(!model.has_fit_with(Suit::Clubs, 5));
    }

    #[test]
    fn test_shape_balanced() {
        let hand = make_hand(4, 3, 3, 3); // 4-3-3-3
        let model = HandModel::from_hand(&hand);
        assert_eq!(model.shape, Shape::Balanced);
    }

    #[test]
    fn test_shape_semi_balanced() {
        let hand = make_hand(5, 4, 2, 2); // 5-4-2-2
        let model = HandModel::from_hand(&hand);
        assert_eq!(model.shape, Shape::SemiBalanced);
    }
}
