//! Hand model for NBK bidding analysis

use crate::nbk::HandConstraint;
use bridge_core::{Distribution, Hand, Shape, Suit};

/// Analysis of the current hand for bidding purposes
#[derive(Debug, Clone)]
pub struct HandModel {
    /// High Card Points (A=4, K=3, Q=2, J=1)
    pub hcp: u8,
    /// Suit distribution
    pub distribution: Distribution,
    /// Shape classification
    pub shape: Shape,
}

impl HandModel {
    pub fn satisfies(&self, constraint: HandConstraint) -> bool {
        match constraint {
            HandConstraint::MinHcp(hcp) => self.hcp >= hcp,
            HandConstraint::MaxHcp(hcp) => self.hcp <= hcp,
            HandConstraint::MinLength(suit, len) => self.length(suit) >= len,
            HandConstraint::MaxUnbalancedness(max_shape) => self.shape <= max_shape,
        }
    }

    pub fn satisfies_all(&self, constraints: impl IntoIterator<Item = HandConstraint>) -> bool {
        constraints.into_iter().all(|c| self.satisfies(c))
    }

    pub fn from_hand(hand: &Hand) -> Self {
        Self {
            hcp: hand.hcp(),
            distribution: hand.distribution(),
            shape: hand.shape(),
        }
    }

    pub fn length(&self, suit: Suit) -> u8 {
        self.distribution.length(suit)
    }

    /// Get the longest suit in the hand
    #[allow(dead_code)]
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
    #[allow(dead_code)]
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

    #[test]
    fn test_satisfies_constraints() {
        let hand = make_hand(5, 4, 2, 2); // 13 cards, 0 HCP if Rank::Two
        let mut model = HandModel::from_hand(&hand);
        model.hcp = 12;

        assert!(model.satisfies(HandConstraint::MinHcp(10)));
        assert!(model.satisfies(HandConstraint::MinHcp(12)));
        assert!(!model.satisfies(HandConstraint::MinHcp(13)));

        assert!(model.satisfies(HandConstraint::MaxHcp(15)));
        assert!(model.satisfies(HandConstraint::MaxHcp(12)));
        assert!(!model.satisfies(HandConstraint::MaxHcp(11)));

        assert!(model.satisfies(HandConstraint::MinLength(Suit::Spades, 5)));
        assert!(model.satisfies(HandConstraint::MinLength(Suit::Spades, 4)));
        assert!(!model.satisfies(HandConstraint::MinLength(Suit::Spades, 6)));

        assert!(model.satisfies(HandConstraint::MinLength(Suit::Hearts, 4)));
        assert!(!model.satisfies(HandConstraint::MinLength(Suit::Hearts, 5)));
    }
}
