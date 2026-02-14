//! Hand constraints for NBK bidding rules

use bridge_core::{Shape, Suit};
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
