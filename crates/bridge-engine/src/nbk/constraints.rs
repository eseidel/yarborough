//! Hand constraints for NBK bidding rules

use bridge_core::{Hand, Shape, Suit};
use serde::{Deserialize, Serialize};

/// Constraints that a hand must satisfy
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HandConstraint {
    /// Minimum high card points
    MinHcp(u8),
    /// Maximum high card points
    MaxHcp(u8),
    /// Minimum length in a specific suit
    MinLength(Suit, u8),
    /// Maximum unbalancedness allowed
    MaxUnbalancedness(Shape),
    /// Maximum length in a specific suit
    MaxLength(Suit, u8),
    /// Rule of 20: HCP + length of two longest suits >= 20
    RuleOfTwenty,
    /// Rule of 15: HCP + length of spades >= 15
    RuleOfFifteen,
}

impl HandConstraint {
    /// Check whether a hand satisfies this constraint.
    pub fn check(&self, hand: &Hand) -> bool {
        let dist = hand.distribution();
        match *self {
            HandConstraint::MinHcp(hcp) => hand.hcp() >= hcp,
            HandConstraint::MaxHcp(hcp) => hand.hcp() <= hcp,
            HandConstraint::MinLength(suit, len) => dist.length(suit) >= len,
            HandConstraint::MaxLength(suit, len) => dist.length(suit) <= len,
            HandConstraint::MaxUnbalancedness(max_shape) => hand.shape() <= max_shape,
            HandConstraint::RuleOfTwenty => {
                let mut lengths: Vec<u8> = Suit::ALL.iter().map(|&s| dist.length(s)).collect();
                lengths.sort_unstable_by(|a, b| b.cmp(a));
                hand.hcp() + lengths[0] + lengths[1] >= 20
            }
            HandConstraint::RuleOfFifteen => hand.hcp() + dist.length(Suit::Spades) >= 15,
        }
    }
}
