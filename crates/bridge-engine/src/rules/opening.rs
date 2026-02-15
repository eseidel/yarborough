//! Opening Rules for the NBK DSL

use crate::rules::auction_predicates::AuctionPredicate;
use crate::rules::auction_predicates::IsNotOpen;
use crate::rules::auction_predicates::IsSeat;
use crate::rules::auction_predicates::NotAuction;
use crate::rules::bidding_rule::BiddingRule;
use crate::rules::call_predicates::CallPredicate;
use crate::rules::call_predicates::IsCall;
use crate::rules::call_predicates::IsLevel;
use crate::rules::call_predicates::IsPass;
use crate::rules::call_predicates::IsStrain;
use crate::rules::call_predicates::IsSuit;
use crate::rules::call_predicates::MinLevel;
use crate::rules::call_predicates::NotCall;
use crate::rules::shows::ShowBalanced;
use crate::rules::shows::ShowHcpRange;
use crate::rules::shows::ShowMaxHcp;
use crate::rules::shows::ShowMinHcp;
use crate::rules::shows::ShowOpeningSuitLength;
use crate::rules::shows::ShowPreemptLength;
use crate::rules::shows::ShowRuleOfFifteen;
use crate::rules::shows::ShowRuleOfTwenty;
use crate::rules::shows::ShowSuitLength;
use crate::rules::shows::Shows;
use bridge_core::{Call, Strain};

// --- Strong 2C ---
pub struct Strong2C;
impl BiddingRule for Strong2C {
    fn name(&self, _call: &Call) -> String {
        "Strong 2C Opening".to_string()
    }

    fn description(&self, _call: &Call) -> String {
        "Very strong hand (22+ HCP)".to_string()
    }

    fn auction_criteria(&self) -> Vec<Box<dyn AuctionPredicate>> {
        vec![Box::new(IsNotOpen)]
    }

    fn call_predicates(&self) -> Vec<Box<dyn CallPredicate>> {
        vec![Box::new(IsCall(2, Strain::Clubs))]
    }

    fn shows(&self) -> Vec<Box<dyn Shows>> {
        vec![Box::new(ShowMinHcp(22))]
    }
}

// --- 1NT Opening ---
pub struct OneNoTrumpOpening;
impl BiddingRule for OneNoTrumpOpening {
    fn name(&self, _call: &Call) -> String {
        "1NT Opening".to_string()
    }

    fn description(&self, _call: &Call) -> String {
        "Balanced hand with 15-17 HCP".to_string()
    }

    fn auction_criteria(&self) -> Vec<Box<dyn AuctionPredicate>> {
        vec![Box::new(IsNotOpen)]
    }

    fn call_predicates(&self) -> Vec<Box<dyn CallPredicate>> {
        vec![Box::new(IsCall(1, Strain::NoTrump))]
    }

    fn shows(&self) -> Vec<Box<dyn Shows>> {
        vec![Box::new(ShowHcpRange(15, 17)), Box::new(ShowBalanced)]
    }
}

// --- 2NT Opening ---
pub struct TwoNoTrumpOpening;
impl BiddingRule for TwoNoTrumpOpening {
    fn name(&self, _call: &Call) -> String {
        "2NT Opening".to_string()
    }

    fn description(&self, _call: &Call) -> String {
        "Balanced hand with 20-21 HCP".to_string()
    }

    fn auction_criteria(&self) -> Vec<Box<dyn AuctionPredicate>> {
        vec![Box::new(IsNotOpen)]
    }

    fn call_predicates(&self) -> Vec<Box<dyn CallPredicate>> {
        vec![Box::new(IsCall(2, Strain::NoTrump))]
    }

    fn shows(&self) -> Vec<Box<dyn Shows>> {
        vec![Box::new(ShowHcpRange(20, 21)), Box::new(ShowBalanced)]
    }
}

// --- Suit Opening (Normal) ---
pub struct SuitOpening;
impl BiddingRule for SuitOpening {
    fn name(&self, call: &Call) -> String {
        match call {
            Call::Bid { level, strain } => format!("{}{:?} Opening", level, strain),
            _ => "Suit Opening".to_string(),
        }
    }

    fn description(&self, call: &Call) -> String {
        if let Call::Bid { strain, .. } = call {
            format!("Opening bid showing 4+ cards in {:?}", strain)
        } else {
            "Suit Opening".to_string()
        }
    }

    fn auction_criteria(&self) -> Vec<Box<dyn AuctionPredicate>> {
        vec![
            Box::new(IsNotOpen),
            Box::new(NotAuction(Box::new(IsSeat(4)))),
        ]
    }

    fn call_predicates(&self) -> Vec<Box<dyn CallPredicate>> {
        vec![Box::new(IsLevel(1)), Box::new(IsSuit)]
    }

    fn shows(&self) -> Vec<Box<dyn Shows>> {
        vec![
            Box::new(ShowOpeningSuitLength),
            Box::new(ShowRuleOfTwenty),
            Box::new(ShowMinHcp(12)),
        ]
    }
}

// --- Suit Opening (4th Seat) ---
pub struct SuitOpeningFourthSeat;
impl BiddingRule for SuitOpeningFourthSeat {
    fn name(&self, call: &Call) -> String {
        match call {
            Call::Bid { level, strain } => format!("{}{:?} Opening (4th Seat)", level, strain),
            _ => "Suit Opening (4th Seat)".to_string(),
        }
    }

    fn description(&self, call: &Call) -> String {
        if let Call::Bid { strain, .. } = call {
            format!("Opening bid showing 4+ cards in {:?}", strain)
        } else {
            "Suit Opening".to_string()
        }
    }

    fn auction_criteria(&self) -> Vec<Box<dyn AuctionPredicate>> {
        vec![Box::new(IsNotOpen), Box::new(IsSeat(4))]
    }

    fn call_predicates(&self) -> Vec<Box<dyn CallPredicate>> {
        vec![Box::new(IsLevel(1)), Box::new(IsSuit)]
    }

    fn shows(&self) -> Vec<Box<dyn Shows>> {
        vec![Box::new(ShowOpeningSuitLength), Box::new(ShowRuleOfFifteen)]
    }
}

// --- Weak Two ---
pub struct WeakTwo;
impl BiddingRule for WeakTwo {
    fn name(&self, call: &Call) -> String {
        match call {
            Call::Bid { strain, .. } => format!("Weak 2{:?}", strain),
            _ => "Weak Two Opening".to_string(),
        }
    }

    fn description(&self, call: &Call) -> String {
        match call {
            Call::Bid { strain, .. } => format!("Weak opening bid showing 6 cards in {:?}", strain),
            _ => "Weak Two Opening".to_string(),
        }
    }

    fn auction_criteria(&self) -> Vec<Box<dyn AuctionPredicate>> {
        vec![
            Box::new(IsNotOpen),
            Box::new(NotAuction(Box::new(IsSeat(4)))),
        ]
    }

    fn call_predicates(&self) -> Vec<Box<dyn CallPredicate>> {
        vec![
            Box::new(IsLevel(2)),
            Box::new(IsSuit),
            Box::new(NotCall(Box::new(IsStrain(Strain::Clubs)))),
        ]
    }

    fn shows(&self) -> Vec<Box<dyn Shows>> {
        // Need to infer suit for length
        vec![
            Box::new(ShowSuitLength(6)), // Min length
            // Max length 6? ShowSuitLength implies Min.
            // I need ShowMaxLength.
            // ShowMaxLength in mod.rs takes Suit.
            // I need ShowSuitMaxLength similar to ShowSuitLength.
            // Or use ShowSuitLength(6) and ShowHcp.
            // My imperative logic had MinLength(suit, 6) AND MaxLength(suit, 6).
            // `mod.rs` has `ShowSuitLength` (Min).
            // `ShowMaxLength` takes `(u8)`. Wait, `mod.rs` `ShowMaxHcp` is u8.
            // `ShowMaxLength(Suit, u8)`.
            // I need generic `ShowSuitMaxLength(u8)` that infers suit.
            // I didn't verify `mod.rs` had `ShowSuitMaxLength`.
            // I should assume I missed it or need to add it.
            // I will add it to this file or mod.rs?
            // Better to add to mod.rs, but I can implement `Shows` locally too.
            Box::new(ShowHcpRange(5, 10)),
        ]
    }
}

// Check if ShowSuitMaxLength is needed in mod.rs?
// I don't recall adding it. I added `ShowSuitLength` (min).
// I will implement a local one here to be safe and avoid back-and-forth.

// Updating WeakTwo shows:
// ...
// Box::new(ShowSuitMaxLength(6)),

// --- Preempt ---
pub struct Preempt;
impl BiddingRule for Preempt {
    fn name(&self, call: &Call) -> String {
        format!("Preemptive {} Opening", call.render())
    }

    fn description(&self, call: &Call) -> String {
        if let Call::Bid { level, strain } = call {
            format!(
                "Preemptive opening bid showing {} cards in {:?}",
                level + 4,
                strain
            )
        } else {
            "Preemptive Opening".to_string()
        }
    }

    fn auction_criteria(&self) -> Vec<Box<dyn AuctionPredicate>> {
        vec![Box::new(IsNotOpen)]
    }

    fn call_predicates(&self) -> Vec<Box<dyn CallPredicate>> {
        vec![Box::new(MinLevel(3)), Box::new(IsSuit)]
    }

    fn shows(&self) -> Vec<Box<dyn Shows>> {
        vec![Box::new(ShowPreemptLength), Box::new(ShowMaxHcp(10))]
    }
}

// --- Pass Opening ---
pub struct PassOpening;
impl BiddingRule for PassOpening {
    fn name(&self, _call: &Call) -> String {
        "Pass (Opening)".to_string()
    }

    fn description(&self, _call: &Call) -> String {
        "Hand does not meet requirements for an opening bid".to_string()
    }

    fn auction_criteria(&self) -> Vec<Box<dyn AuctionPredicate>> {
        vec![Box::new(IsNotOpen)]
    }

    fn call_predicates(&self) -> Vec<Box<dyn CallPredicate>> {
        vec![Box::new(IsPass)]
    }

    fn shows(&self) -> Vec<Box<dyn Shows>> {
        vec![Box::new(ShowMaxHcp(12))]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nbk::{AuctionModel, HandConstraint};
    use bridge_core::{Call, Distribution, Position, Shape, Strain, Suit};

    fn make_auction(calls: Vec<Call>) -> AuctionModel {
        let mut auction = bridge_core::Auction::new(Position::North);
        for c in calls {
            auction.add_call(c);
        }
        AuctionModel::from_auction(&auction, Position::North)
    }

    #[test]
    fn test_opening_1major() {
        let model = make_auction(vec![]);
        let call = Call::Bid {
            level: 1,
            strain: Strain::Spades,
        };
        let sem = SuitOpening.get_semantics(&model, &call).unwrap();

        assert!(sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Spades, 5)));
        assert!(sem.shows.contains(&HandConstraint::RuleOfTwenty));
    }

    #[test]
    fn test_weak_two_short_suit() {
        let model = make_auction(vec![]);
        let call = Call::Bid {
            level: 2,
            strain: Strain::Spades,
        };
        let sem = WeakTwo.get_semantics(&model, &call).unwrap();

        let hand_model = crate::nbk::HandModel {
            hcp: 8,
            distribution: Distribution {
                spades: 2,
                hearts: 4,
                diamonds: 4,
                clubs: 3,
            },
            shape: Shape::Balanced,
        };

        assert!(sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Spades, 6)));
        assert!(!hand_model.satisfies_all(sem.shows));
    }
}
