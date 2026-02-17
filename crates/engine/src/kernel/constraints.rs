// cspell:ignore Jxxx
//! Hand constraints for Kernel bidding rules

use serde::{Deserialize, Serialize};
use types::{Hand, Shape, Suit};

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
    /// Must have a stopper in the given suit (A, Kx, Qxx, or Jxxx)
    StopperIn(Suit),
    /// Rule of 20: HCP + length of two longest suits >= 20
    RuleOfTwenty,
    /// Rule of 15: HCP + length of spades >= 15
    RuleOfFifteen,
    /// 2+ of the top 3 honors {A, K, Q} in the suit
    TwoOfTopThree(Suit),
    /// 3+ of the top 5 honors {A, K, Q, J, T} in the suit
    ThreeOfTopFive(Suit),
    /// Good suit quality: TwoOfTopThree OR ThreeOfTopFive
    ThreeOfTopFiveOrBetter(Suit),
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
            HandConstraint::StopperIn(suit) => has_stopper(hand, suit),
            HandConstraint::RuleOfTwenty => {
                let mut lengths: Vec<u8> = Suit::ALL.iter().map(|&s| dist.length(s)).collect();
                lengths.sort_unstable_by(|a, b| b.cmp(a));
                hand.hcp() + lengths[0] + lengths[1] >= 20
            }
            HandConstraint::RuleOfFifteen => hand.hcp() + dist.length(Suit::Spades) >= 15,
            HandConstraint::TwoOfTopThree(suit) => hand.top_honors(suit, 3) >= 2,
            HandConstraint::ThreeOfTopFive(suit) => hand.top_honors(suit, 5) >= 3,
            HandConstraint::ThreeOfTopFiveOrBetter(suit) => {
                hand.top_honors(suit, 3) >= 2 || hand.top_honors(suit, 5) >= 3
            }
        }
    }
}

/// A stopper is A, Kx, Qxx, or Jxxx (honor backed by enough small cards).
fn has_stopper(hand: &Hand, suit: Suit) -> bool {
    use types::Rank;
    let len = hand.length(suit);
    let has = |r: Rank| hand.cards.iter().any(|c| c.suit == suit && c.rank == r);
    has(Rank::Ace)
        || (has(Rank::King) && len >= 2)
        || (has(Rank::Queen) && len >= 3)
        || (has(Rank::Jack) && len >= 4)
}
