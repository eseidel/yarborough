//! Limit Rules for the NBK DSL

use crate::nbk::{AuctionModel, HandConstraint, PointRanges};
use crate::rules::auction_predicates::AuctionPredicate;
use crate::rules::auction_predicates::IsOpen;
use crate::rules::bidding_rule::BiddingRule;
use crate::rules::call_predicates::CallPredicate;
use crate::rules::call_predicates::IsPass;
use crate::rules::call_predicates::IsStrain;
use crate::rules::call_predicates::IsSuit;
use crate::rules::call_predicates::NotCall;
use crate::rules::shows::Shows;
use crate::rules::shows::SufficientValues;
use bridge_core::{Call, Shape, Strain};

// --- NoTrump Response ---
pub struct NoTrumpResponse;
impl BiddingRule for NoTrumpResponse {
    fn name(&self, call: &Call) -> String {
        match call {
            Call::Bid { level, .. } => format!("{}NT Limit", level),
            _ => "NT Limit".to_string(),
        }
    }

    fn description(&self, _call: &Call) -> String {
        "Limit bid in No Trump".to_string()
    }

    fn auction_criteria(&self) -> Vec<Box<dyn AuctionPredicate>> {
        vec![Box::new(IsOpen)]
    }

    fn call_predicates(&self) -> Vec<Box<dyn CallPredicate>> {
        vec![Box::new(IsStrain(Strain::NoTrump))]
    }

    fn shows(&self) -> Vec<Box<dyn Shows>> {
        vec![Box::new(ShowSemiBalanced), Box::new(SufficientValues)]
    }
}

#[derive(Debug)]
struct ShowSemiBalanced;
impl Shows for ShowSemiBalanced {
    fn show(&self, _auction: &AuctionModel, _call: &Call) -> Vec<HandConstraint> {
        vec![HandConstraint::MaxUnbalancedness(Shape::SemiBalanced)]
    }
}

// --- Support Response ---
pub struct SupportResponse;
impl BiddingRule for SupportResponse {
    fn name(&self, call: &Call) -> String {
        match call {
            Call::Bid { strain, .. } => format!("{:?} Support", strain),
            _ => "Support Limit".to_string(),
        }
    }

    fn description(&self, call: &Call) -> String {
        if let Call::Bid { strain, .. } = call {
            format!("Limit support for partner's {:?}", strain)
        } else {
            "Limit support".to_string()
        }
    }

    fn auction_criteria(&self) -> Vec<Box<dyn AuctionPredicate>> {
        vec![Box::new(IsOpen)]
    }

    fn call_predicates(&self) -> Vec<Box<dyn CallPredicate>> {
        vec![Box::new(IsSuit), Box::new(PartnerBidSuit)]
    }

    fn shows(&self) -> Vec<Box<dyn Shows>> {
        vec![Box::new(ShowSupportLength), Box::new(SufficientValues)]
    }
}

#[derive(Debug)]
struct PartnerBidSuit;
impl CallPredicate for PartnerBidSuit {
    fn check(&self, auction: &AuctionModel, call: &Call) -> bool {
        if let Call::Bid { strain, .. } = call {
            if let Some(suit) = strain.to_suit() {
                return auction.partner_model.has_shown_suit(suit);
            }
        }
        false
    }
}

#[derive(Debug)]
struct ShowSupportLength;
impl Shows for ShowSupportLength {
    fn show(&self, auction: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
        if let Call::Bid { strain, .. } = call {
            if let Some(suit) = strain.to_suit() {
                let needed_len = auction.partner_model.length_needed_to_reach_target(suit, 8);
                return vec![HandConstraint::MinLength(suit, needed_len)];
            }
        }
        vec![]
    }
}

// --- Rebid Response ---
pub struct RebidResponse;
impl BiddingRule for RebidResponse {
    fn name(&self, call: &Call) -> String {
        match call {
            Call::Bid { strain, .. } => format!("{:?} Rebid", strain),
            _ => "Rebid Limit".to_string(),
        }
    }

    fn description(&self, call: &Call) -> String {
        if let Call::Bid { strain, .. } = call {
            format!("Limit rebid in own {:?}", strain)
        } else {
            "Rebid limit".to_string()
        }
    }

    fn auction_criteria(&self) -> Vec<Box<dyn AuctionPredicate>> {
        vec![Box::new(IsOpen)]
    }

    fn call_predicates(&self) -> Vec<Box<dyn CallPredicate>> {
        vec![
            Box::new(IsSuit),
            Box::new(NotCall(Box::new(PartnerBidSuit))),
            Box::new(SelfBidSuit),
        ]
    }

    fn shows(&self) -> Vec<Box<dyn Shows>> {
        vec![Box::new(ShowRebidLength(6)), Box::new(SufficientValues)]
    }
}

#[derive(Debug)]
struct SelfBidSuit;
impl CallPredicate for SelfBidSuit {
    fn check(&self, auction: &AuctionModel, call: &Call) -> bool {
        if let Call::Bid { strain, .. } = call {
            if let Some(suit) = strain.to_suit() {
                return auction.bidder_model.has_shown_suit(suit);
            }
        }
        false
    }
}

#[derive(Debug)]
struct ShowRebidLength(u8);
impl Shows for ShowRebidLength {
    fn show(&self, _auction: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
        if let Call::Bid { strain, .. } = call {
            if let Some(suit) = strain.to_suit() {
                return vec![HandConstraint::MinLength(suit, self.0)];
            }
        }
        vec![]
    }
}

// --- Pass Limit ---
pub struct PassLimit;
impl BiddingRule for PassLimit {
    fn name(&self, _call: &Call) -> String {
        "Pass (Limit)".to_string()
    }

    fn description(&self, _call: &Call) -> String {
        "Pass showing no interest in competing further".to_string()
    }

    fn auction_criteria(&self) -> Vec<Box<dyn AuctionPredicate>> {
        vec![Box::new(IsOpen), Box::new(PartnerLimited)]
    }

    fn call_predicates(&self) -> Vec<Box<dyn CallPredicate>> {
        vec![Box::new(IsPass)]
    }

    fn shows(&self) -> Vec<Box<dyn Shows>> {
        vec![Box::new(ShowLimitPass)]
    }
}

#[derive(Debug)]
struct PartnerLimited;
impl AuctionPredicate for PartnerLimited {
    fn check(&self, auction: &AuctionModel) -> bool {
        auction.partner_model.max_hcp.is_some()
    }
}

#[derive(Debug)]
struct ShowLimitPass;
impl Shows for ShowLimitPass {
    fn show(&self, auction: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
        if let Call::Pass = call {
            let partner_max_hcp = auction.partner_model.max_hcp.unwrap_or(0); // Should be Some due to Predicate
            let our_partnership = auction.auction.current_partnership();
            let contract = if let Some(c) = auction.auction.current_contract() {
                if c.belongs_to(our_partnership) {
                    c
                } else {
                    return vec![];
                }
            } else {
                return vec![];
            };

            if contract.is_grand_slam() {
                return vec![];
            }

            let goal = if contract.is_slam() {
                PointRanges::GRAND_SLAM_THRESHOLD
            } else if contract.is_game() {
                PointRanges::SLAM_THRESHOLD
            } else {
                PointRanges::GAME_THRESHOLD
            };

            let threshold = (goal - 1).saturating_sub(partner_max_hcp);
            vec![HandConstraint::MaxHcp(threshold)]
        } else {
            vec![]
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nbk::{HandModel, PartnerModel};
    use bridge_core::{Auction, Distribution, Position};

    #[test]
    fn test_support_limit_with_fit() {
        let hand_model = HandModel {
            hcp: 8,
            distribution: Distribution {
                clubs: 2,
                diamonds: 3,
                hearts: 4,
                spades: 4,
            },
            shape: Shape::Balanced,
        };
        let partner_model = PartnerModel {
            min_distribution: Distribution {
                hearts: 4,
                ..Distribution::default()
            },
            min_hcp: Some(13),
            ..Default::default()
        };
        let call = Call::Bid {
            level: 2,
            strain: Strain::Hearts,
        };
        let auction_model = AuctionModel {
            partner_model,
            auction: {
                let mut a = Auction::new(Position::North);
                a.add_call(Call::Bid {
                    level: 1,
                    strain: Strain::Hearts,
                });
                a
            },
            ..AuctionModel::default()
        };

        let sem = SupportResponse
            .get_semantics(&auction_model, &call)
            .unwrap();
        assert!(hand_model.satisfies_all(sem.shows));
    }

    #[test]
    fn test_notrump_limit_balanced() {
        let hand_model = HandModel {
            hcp: 12,
            distribution: Distribution {
                clubs: 3,
                diamonds: 3,
                hearts: 3,
                spades: 4,
            },
            shape: Shape::Balanced,
        };
        let partner_model = PartnerModel {
            min_hcp: Some(10),
            ..Default::default()
        };
        let call = Call::Bid {
            level: 2,
            strain: Strain::NoTrump,
        };
        let auction_model = AuctionModel {
            partner_model,
            auction: {
                let mut a = Auction::new(Position::North);
                a.add_call(Call::Bid {
                    level: 1,
                    strain: Strain::Spades,
                });
                a
            },
            ..AuctionModel::default()
        };
        let semantics = NoTrumpResponse
            .get_semantics(&auction_model, &call)
            .unwrap();
        assert!(hand_model.satisfies_all(semantics.shows));
    }
}
