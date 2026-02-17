use crate::kernel::{AuctionModel, HandConstraint};
use types::{Call, Hand};

/// A planner decides whether a bidding rule applies to a given hand in a given auction.
pub trait Planner: Send + Sync {
    /// Check if the rule applies to the given hand.
    fn applies(
        &self,
        auction: &AuctionModel,
        hand: &Hand,
        call: &Call,
        shows: &[HandConstraint],
    ) -> bool;
}

/// The default planner that checks if the hand satisfies all "shows" constraints.
pub struct DefaultPlanner;

impl Planner for DefaultPlanner {
    fn applies(
        &self,
        _auction: &AuctionModel,
        hand: &Hand,
        _call: &Call,
        shows: &[HandConstraint],
    ) -> bool {
        satisfies_all(hand, shows)
    }
}

/// Helper function to check if a hand satisfies all given constraints.
pub fn satisfies_all(hand: &Hand, constraints: &[HandConstraint]) -> bool {
    for constraint in constraints {
        if !constraint.check(hand) {
            return false;
        }
    }
    true
}

/// A planner for Rule of 20 openings.
/// It ignores HCP constraints but respects other constraints like suit length.
pub struct RuleOfTwentyPlanner;

impl Planner for RuleOfTwentyPlanner {
    fn applies(
        &self,
        _auction: &AuctionModel,
        hand: &Hand,
        call: &Call,
        _shows: &[HandConstraint],
    ) -> bool {
        // First check Rule of 20
        if !HandConstraint::RuleOfTwenty.check(hand) {
            return false;
        }

        // Ignore the hand constraints for the shows and instead check the length of the call's suit
        if let Some(suit) = call.suit() {
            let min_len = if suit.is_major() { 5 } else { 3 };
            return hand.length(suit) >= min_len;
        }

        false
    }
}

/// A planner for takeout doubles.
/// Either satisfies all constraints (11+ HCP + 3+ in each unbid suit),
/// or has 17+ HCP regardless of shape.
pub struct TakeoutDoublePlanner;

impl Planner for TakeoutDoublePlanner {
    fn applies(
        &self,
        _auction: &AuctionModel,
        hand: &Hand,
        _call: &Call,
        shows: &[HandConstraint],
    ) -> bool {
        // Strong hand (17+ HCP) can double regardless of shape
        if hand.hcp() >= 17 {
            return true;
        }
        // Otherwise, must satisfy all constraints (11+ HCP + 3+ in each unbid suit)
        satisfies_all(hand, shows)
    }
}
