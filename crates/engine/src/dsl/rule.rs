use crate::dsl::annotations::Annotation;
use crate::dsl::auction_predicates::AuctionPredicate;
use crate::dsl::call_predicates::CallPredicate;
use crate::dsl::planner::Planner;
use crate::dsl::shows::Shows;
use crate::kernel::{AuctionModel, CallSemantics, HandConstraint};
use std::sync::Arc;
use types::Call;

/// A bidding rule in the Kernel DSL
pub trait Rule: Send + Sync {
    /// The name of the rule for the given call
    fn name(&self, call: &Call) -> String;

    /// Auction criteria that must be met for this rule to apply
    fn auction_criteria(&self) -> Vec<Box<dyn AuctionPredicate>>;

    /// Call predicates that must be met for this rule to apply
    fn call_predicates(&self) -> Vec<Box<dyn CallPredicate>>;

    /// What this rule shows about the hand
    fn shows(&self) -> Vec<Box<dyn Shows>>;

    /// Metadata about this bid (not hand constraints)
    fn annotations(&self) -> Vec<Annotation> {
        vec![]
    }

    /// Optional planner for this rule
    fn planner(&self) -> Option<Arc<dyn Planner>> {
        None
    }

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
        constraints = HandConstraint::optimize(constraints);

        Some(CallSemantics {
            shows: constraints,
            annotations: self.annotations(),
            rule_name: self.name(call),
            planner: self.planner(),
        })
    }
}
