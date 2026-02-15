use crate::nbk::{AuctionModel, HandConstraint};
use bridge_core::{Hand, Suit};

/// A planner decides whether a bidding rule applies to a given hand in a given auction.
pub trait Planner: Send + Sync {
    /// Check if the rule applies to the given hand.
    fn applies(&self, auction: &AuctionModel, hand: &Hand, shows: &[HandConstraint]) -> bool;
}

/// The default planner that checks if the hand satisfies all "shows" constraints.
pub struct GenuinePlanner;

impl Planner for GenuinePlanner {
    fn applies(&self, _auction: &AuctionModel, hand: &Hand, shows: &[HandConstraint]) -> bool {
        for constraint in shows {
            if !satisfies_constraint(hand, constraint) {
                return false;
            }
        }
        true
    }
}

/// A planner for Rule of 20 openings.
/// It ignores HCP constraints but respects other constraints like suit length.
pub struct RuleOfTwentyPlanner;

impl Planner for RuleOfTwentyPlanner {
    fn applies(&self, _auction: &AuctionModel, hand: &Hand, shows: &[HandConstraint]) -> bool {
        // First check Rule of 20
        if !rule_of_twenty(hand) {
            return false;
        }

        // Then check other constraints, ignoring HCP
        for constraint in shows {
            match constraint {
                HandConstraint::MinHcp(_) | HandConstraint::MaxHcp(_) => continue,
                _ => {
                    if !satisfies_constraint(hand, constraint) {
                        return false;
                    }
                }
            }
        }
        true
    }
}

fn satisfies_constraint(hand: &Hand, constraint: &HandConstraint) -> bool {
    match *constraint {
        HandConstraint::MinHcp(hcp) => hand.hcp() >= hcp,
        HandConstraint::MaxHcp(hcp) => hand.hcp() <= hcp,
        HandConstraint::MinLength(suit, len) => hand.length(suit) >= len,
        HandConstraint::MaxLength(suit, len) => hand.length(suit) <= len,
        HandConstraint::MaxUnbalancedness(max_shape) => hand.shape() <= max_shape,
        HandConstraint::RuleOfTwenty => rule_of_twenty(hand),
        HandConstraint::RuleOfFifteen => rule_of_fifteen(hand),
    }
}

fn rule_of_twenty(hand: &Hand) -> bool {
    let mut lengths: Vec<u8> = Suit::ALL.iter().map(|&s| hand.length(s)).collect();
    lengths.sort_unstable_by(|a, b| b.cmp(a));
    hand.hcp() + lengths[0] + lengths[1] >= 20
}

fn rule_of_fifteen(hand: &Hand) -> bool {
    hand.hcp() + hand.length(Suit::Spades) >= 15
}
