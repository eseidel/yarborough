use crate::schema::{Constraint, System, Variant};
use bridge_core::auction::Auction;
use bridge_core::call::Call;
use bridge_core::hand::Hand;

pub struct Engine {
    system: System,
}

impl Engine {
    pub fn new(system: System) -> Self {
        Self { system }
    }

    pub fn get_best_bid(&self, hand: &Hand, auction: &Auction) -> Option<(Call, Variant)> {
        let rules = if self.is_opening(auction) {
            &self.system.opening
        } else {
            // Placeholder: for now we only know how to open.
            // If not opening, we currently return None, triggering fallback.
            return None;
        };

        let mut best_match: Option<(Call, Variant)> = None;

        for rule in rules {
            // We need to parse the rule.call string into a Call object
            // to ensure it's valid and to return it.
            let call = match Call::from_str(&rule.call) {
                Some(c) => c,
                None => continue, // Skip invalid call strings in rules
            };

            for variant in &rule.variants {
                if self.check_constraints(hand, &variant.constraints) {
                    let is_better = match &best_match {
                        Some((_, current_best_variant)) => {
                            variant.priority > current_best_variant.priority
                        }
                        None => true,
                    };

                    if is_better {
                        best_match = Some((call, variant.clone()));
                    }
                }
            }
        }
        best_match
    }

    fn is_opening(&self, auction: &Auction) -> bool {
        // It's an opening bid if there are no existing bids in the auction history.
        // Passes are ignored.
        !auction.calls.iter().any(|c| matches!(c, Call::Bid { .. }))
    }

    fn check_constraints(&self, hand: &Hand, constraints: &[Constraint]) -> bool {
        for constraint in constraints {
            if !self.check_constraint(hand, constraint) {
                return false;
            }
        }
        true
    }

    fn check_constraint(&self, hand: &Hand, constraint: &Constraint) -> bool {
        match constraint {
            Constraint::MinHCP { min } => hand.hcp() >= *min,
            Constraint::MaxHCP { max } => hand.hcp() <= *max,
            Constraint::MinLength { suit, count } => hand.length(*suit) >= *count,
            Constraint::MaxLength { suit, count } => hand.length(*suit) <= *count,
            Constraint::IsBalanced { balanced } => {
                let dist = hand.distribution();
                // Basic check for balanced: 4-3-3-3, 4-4-3-2, 5-3-3-2
                // No voids, no singletons.
                let has_singleton_or_void = dist.iter().any(|&count| count <= 1);
                // Also 5-4-2-2 is sometimes treated as semi-balanced, but strict balanced usually means no more than one doubleton.
                let doubleton_count = dist.iter().filter(|&&count| count == 2).count();

                let is_balanced = !has_singleton_or_void && doubleton_count <= 1;

                is_balanced == *balanced
            }
        }
    }
}
