//! Opening Rules for the NBK DSL

use crate::nbk::{AuctionModel, CallPurpose, CallSemantics, HandConstraint};
use crate::rules::BiddingRule;
use bridge_core::{Call, Shape, Strain};

pub struct Strong2C;
impl BiddingRule for Strong2C {
    fn applies(&self, auction_model: &AuctionModel) -> bool {
        !auction_model.auction.is_open()
    }

    fn name(&self, _call: &Call) -> String {
        "Strong 2C Opening".to_string()
    }

    fn get_semantics(&self, _auction_model: &AuctionModel, call: &Call) -> Option<CallSemantics> {
        if let Call::Bid {
            level: 2,
            strain: Strain::Clubs,
        } = call
        {
            Some(CallSemantics {
                purpose: CallPurpose::Opening,
                shows: vec![HandConstraint::MinHcp(22)],
                rule_name: self.name(call),
                description: "Very strong hand (22+ HCP)".to_string(),
            })
        } else {
            None
        }
    }
}

pub struct NoTrumpOpening;
impl BiddingRule for NoTrumpOpening {
    fn applies(&self, auction_model: &AuctionModel) -> bool {
        !auction_model.auction.is_open()
    }

    fn name(&self, call: &Call) -> String {
        match call {
            Call::Bid { level, .. } => format!("{}NT Opening", level),
            _ => "NT Opening".to_string(),
        }
    }

    fn get_semantics(&self, _auction_model: &AuctionModel, call: &Call) -> Option<CallSemantics> {
        match call {
            Call::Bid {
                level: 1,
                strain: Strain::NoTrump,
            } => Some(CallSemantics {
                purpose: CallPurpose::Opening,
                shows: vec![
                    HandConstraint::MinHcp(15),
                    HandConstraint::MaxHcp(17),
                    HandConstraint::MaxUnbalancedness(Shape::Balanced),
                ],
                rule_name: self.name(call),
                description: "Balanced hand with 15-17 HCP".to_string(),
            }),
            Call::Bid {
                level: 2,
                strain: Strain::NoTrump,
            } => Some(CallSemantics {
                purpose: CallPurpose::Opening,
                shows: vec![
                    HandConstraint::MinHcp(20),
                    HandConstraint::MaxHcp(21),
                    HandConstraint::MaxUnbalancedness(Shape::Balanced),
                ],
                rule_name: self.name(call),
                description: "Balanced hand with 20-21 HCP".to_string(),
            }),
            _ => None,
        }
    }
}

pub struct SuitOpening;
impl BiddingRule for SuitOpening {
    fn applies(&self, auction_model: &AuctionModel) -> bool {
        !auction_model.auction.is_open()
    }

    fn name(&self, call: &Call) -> String {
        match call {
            Call::Bid { level, strain } => format!("{}{:?} Opening", level, strain),
            _ => "Suit Opening".to_string(),
        }
    }

    fn get_semantics(&self, auction_model: &AuctionModel, call: &Call) -> Option<CallSemantics> {
        if let Call::Bid { level: 1, strain } = call {
            let suit = strain.to_suit()?;
            let mut shows = Vec::new();
            if suit.is_major() {
                shows.push(HandConstraint::MinLength(suit, 5));
            } else {
                shows.push(HandConstraint::MinLength(suit, 4));
            }
            let seat = auction_model.auction.current_seat();
            if seat == 4 {
                shows.push(HandConstraint::RuleOfFifteen);
            } else {
                shows.push(HandConstraint::RuleOfTwenty);
                shows.push(HandConstraint::MinHcp(12));
            }
            Some(CallSemantics {
                purpose: CallPurpose::Opening,
                shows,
                rule_name: self.name(call),
                description: format!("Opening bid showing 4+ cards in {:?}", suit),
            })
        } else {
            None
        }
    }
}

pub struct WeakTwo;
impl BiddingRule for WeakTwo {
    fn applies(&self, auction_model: &AuctionModel) -> bool {
        !auction_model.auction.is_open() && auction_model.auction.current_seat() != 4
    }

    fn name(&self, call: &Call) -> String {
        match call {
            Call::Bid { strain, .. } => format!("Weak 2{:?}", strain),
            _ => "Weak Two Opening".to_string(),
        }
    }

    fn get_semantics(&self, _auction_model: &AuctionModel, call: &Call) -> Option<CallSemantics> {
        if let Call::Bid { level: 2, strain } = call {
            let suit = strain.to_suit()?;
            if suit == bridge_core::Suit::Clubs {
                return None;
            } // 2C is Strong
            Some(CallSemantics {
                purpose: CallPurpose::Opening,
                shows: vec![
                    HandConstraint::MinLength(suit, 6),
                    HandConstraint::MaxLength(suit, 6),
                    HandConstraint::MinHcp(5),
                    HandConstraint::MaxHcp(10),
                ],
                rule_name: self.name(call),
                description: format!("Weak opening bid showing 6 cards in {:?}", suit),
            })
        } else {
            None
        }
    }
}

pub struct Preempt;
impl BiddingRule for Preempt {
    fn applies(&self, auction_model: &AuctionModel) -> bool {
        !auction_model.auction.is_open()
    }

    fn name(&self, call: &Call) -> String {
        format!("Preemptive {} Opening", call.render())
    }

    fn get_semantics(&self, _auction_model: &AuctionModel, call: &Call) -> Option<CallSemantics> {
        if let Call::Bid { level, strain } = call {
            if *level < 3 || *strain == Strain::NoTrump {
                return None;
            }
            let suit = strain.to_suit()?;
            Some(CallSemantics {
                purpose: CallPurpose::Opening,
                shows: vec![
                    HandConstraint::MinLength(suit, level + 4),
                    HandConstraint::MaxHcp(10),
                ],
                rule_name: self.name(call),
                description: format!(
                    "Preemptive opening bid showing {} cards in {:?}",
                    level + 4,
                    suit
                ),
            })
        } else {
            None
        }
    }
}

pub struct PassOpening;
impl BiddingRule for PassOpening {
    fn applies(&self, auction_model: &AuctionModel) -> bool {
        !auction_model.auction.is_open()
    }

    fn name(&self, _call: &Call) -> String {
        "Pass (Opening)".to_string()
    }

    fn get_semantics(&self, _auction_model: &AuctionModel, call: &Call) -> Option<CallSemantics> {
        if let Call::Pass = call {
            Some(CallSemantics {
                purpose: CallPurpose::Limit,
                shows: vec![HandConstraint::MaxHcp(12)],
                rule_name: self.name(call),
                description: "Hand does not meet requirements for an opening bid".to_string(),
            })
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bridge_core::{Call, Position, Suit};

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

        assert_eq!(sem.purpose, CallPurpose::Opening);
        assert!(sem
            .shows
            .contains(&HandConstraint::MinLength(Suit::Spades, 5)));
        assert!(sem.shows.contains(&HandConstraint::RuleOfTwenty));
    }
}
