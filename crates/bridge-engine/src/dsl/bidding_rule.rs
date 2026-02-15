use crate::nbk::{AuctionModel, CallSemantics, HandConstraint};
use crate::dsl::auction_predicates::AuctionPredicate;
use crate::dsl::call_predicates::CallPredicate;
use crate::dsl::shows::Shows;
use bridge_core::Call;

/// A bidding rule in the NBK DSL
pub trait BiddingRule: Send + Sync {
    /// The name of the rule for the given call
    fn name(&self, call: &Call) -> String;

    /// The description of the rule for the given call
    fn description(&self, call: &Call) -> String;

    /// Auction criteria that must be met for this rule to apply
    fn auction_criteria(&self) -> Vec<Box<dyn AuctionPredicate>>;

    /// Call predicates that must be met for this rule to apply
    fn call_predicates(&self) -> Vec<Box<dyn CallPredicate>>;

    /// What this rule shows about the hand
    fn shows(&self) -> Vec<Box<dyn Shows>>;

    /// Try to interpret a call using this rule.
    fn get_semantics(&self, auction: &AuctionModel, call: &Call) -> Option<CallSemantics> {
        // Check auction criteria
        for criterion in self.auction_criteria() {
            if !criterion.check(auction) {
                return None;
            }
        }

        // Check call predicates
        let predicates = self.call_predicates();
        if !predicates.is_empty() {
            for predicate in &predicates {
                if !predicate.check(auction, call) {
                    return None;
                }
            }
        }

        // Collect constraints
        let mut constraints = Vec::new();
        for show in self.shows() {
            constraints.extend(show.show(auction, call));
        }

        // Optimize constraints
        constraints = optimize_constraints(constraints);

        Some(CallSemantics {
            shows: constraints,
            rule_name: self.name(call),
            description: self.description(call),
        })
    }
}

pub fn optimize_constraints(constraints: Vec<HandConstraint>) -> Vec<HandConstraint> {
    let mut min_hcp = 0;
    let mut max_hcp = 40;
    // Map of Suit -> min_length
    let mut min_lengths = std::collections::HashMap::new();
    // Map of Suit -> max_length
    let mut max_lengths = std::collections::HashMap::new();

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
