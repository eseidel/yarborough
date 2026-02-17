// cspell:ignore Jxxx
//! Hand constraints for Kernel bidding rules

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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
            HandConstraint::StopperIn(suit) => hand.has_stopper(suit),
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

    /// Optimize a list of constraints by combining HCP and length ranges.
    pub fn optimize(constraints: Vec<Self>) -> Vec<Self> {
        let mut min_hcp = 0;
        let mut max_hcp = 40;
        // Map of Suit -> min_length
        let mut min_lengths = HashMap::new();
        // Map of Suit -> max_length
        let mut max_lengths = HashMap::new();

        let mut other_constraints = Vec::new();

        for c in constraints {
            match c {
                HandConstraint::MinHcp(h) => min_hcp = min_hcp.max(h),
                HandConstraint::MaxHcp(h) => max_hcp = max_hcp.min(h),
                HandConstraint::MinLength(s, l) => {
                    let entry = min_lengths.entry(s).or_insert(0);
                    *entry = (*entry).max(l);
                }
                HandConstraint::MaxLength(s, l) => {
                    let entry = max_lengths.entry(s).or_insert(13);
                    *entry = (*entry).min(l);
                }
                _ => other_constraints.push(c),
            }
        }

        let mut optimised = Vec::new();
        if min_hcp > 0 {
            optimised.push(HandConstraint::MinHcp(min_hcp));
        }
        if max_hcp < 40 {
            optimised.push(HandConstraint::MaxHcp(max_hcp));
        }
        for (suit, len) in min_lengths {
            optimised.push(HandConstraint::MinLength(suit, len));
        }
        for (suit, len) in max_lengths {
            optimised.push(HandConstraint::MaxLength(suit, len));
        }
        optimised.extend(other_constraints);
        optimised
    }
}
