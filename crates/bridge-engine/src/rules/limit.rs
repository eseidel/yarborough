//! Limit Rules for the NBK DSL

use crate::nbk::{AuctionModel, CallSemantics, HandConstraint, PointRanges};
use crate::rules::BiddingRule;
use bridge_core::{Call, Shape, Strain};

pub struct NoTrumpLimit;
impl BiddingRule for NoTrumpLimit {
    fn applies(&self, auction_model: &AuctionModel) -> bool {
        auction_model.auction.is_open()
    }

    fn name(&self, call: &Call) -> String {
        match call {
            Call::Bid { level, .. } => format!("{}NT Limit", level),
            _ => "NT Limit".to_string(),
        }
    }

    fn get_semantics(&self, auction_model: &AuctionModel, call: &Call) -> Option<CallSemantics> {
        if let Call::Bid {
            level,
            strain: Strain::NoTrump,
        } = call
        {
            let mut constraints = vec![HandConstraint::MaxUnbalancedness(Shape::SemiBalanced)];
            constraints.extend(PointRanges::for_nt_bid(
                *level,
                &auction_model.partner_model,
            ));
            Some(CallSemantics {
                shows: constraints,
                rule_name: self.name(call),
                description: "Limit bid in No Trump".to_string(),
            })
        } else {
            None
        }
    }
}

pub struct SupportLimit;
impl BiddingRule for SupportLimit {
    fn applies(&self, auction_model: &AuctionModel) -> bool {
        auction_model.auction.is_open()
    }

    fn name(&self, call: &Call) -> String {
        match call {
            Call::Bid { strain, .. } => format!("{:?} Support", strain),
            _ => "Support Limit".to_string(),
        }
    }

    fn get_semantics(&self, auction_model: &AuctionModel, call: &Call) -> Option<CallSemantics> {
        if let Call::Bid { level, strain } = call {
            let suit = strain.to_suit()?;
            if !auction_model.partner_model.has_shown_suit(suit) {
                return None;
            }
            let needed_len = auction_model
                .partner_model
                .length_needed_to_reach_target(suit, 8);
            let mut constraints = vec![HandConstraint::MinLength(suit, needed_len)];
            constraints.extend(PointRanges::for_suited_bid(
                *level,
                &auction_model.partner_model,
            ));
            Some(CallSemantics {
                shows: constraints,
                rule_name: self.name(call),
                description: format!("Limit support for partner's {:?}", suit),
            })
        } else {
            None
        }
    }
}

pub struct RebidLimit;
impl BiddingRule for RebidLimit {
    fn applies(&self, auction_model: &AuctionModel) -> bool {
        auction_model.auction.is_open()
    }

    fn name(&self, call: &Call) -> String {
        match call {
            Call::Bid { strain, .. } => format!("{:?} Rebid", strain),
            _ => "Rebid Limit".to_string(),
        }
    }

    fn get_semantics(&self, auction_model: &AuctionModel, call: &Call) -> Option<CallSemantics> {
        if let Call::Bid { level, strain } = call {
            let suit = strain.to_suit()?;
            if auction_model.partner_model.has_shown_suit(suit)
                || !auction_model.bidder_model.has_shown_suit(suit)
            {
                return None;
            }
            let mut constraints = vec![HandConstraint::MinLength(suit, 6)];
            constraints.extend(PointRanges::for_suited_bid(
                *level,
                &auction_model.partner_model,
            ));
            Some(CallSemantics {
                shows: constraints,
                rule_name: self.name(call),
                description: format!("Limit rebid in own {:?}", suit),
            })
        } else {
            None
        }
    }
}

pub struct PassLimit;
impl BiddingRule for PassLimit {
    fn applies(&self, auction_model: &AuctionModel) -> bool {
        auction_model.auction.is_open() && auction_model.partner_model.max_hcp.is_some()
    }

    fn name(&self, _call: &Call) -> String {
        "Pass (Limit)".to_string()
    }

    fn get_semantics(&self, auction_model: &AuctionModel, call: &Call) -> Option<CallSemantics> {
        if let Call::Pass = call {
            let partner_max_hcp = auction_model.partner_model.max_hcp?;
            let our_partnership = auction_model.auction.current_partnership();
            let contract = auction_model
                .auction
                .current_contract()
                .filter(|c| c.belongs_to(our_partnership))?;

            if contract.is_grand_slam() {
                return None;
            }

            let goal = if contract.is_slam() {
                PointRanges::GRAND_SLAM_THRESHOLD
            } else if contract.is_game() {
                PointRanges::SLAM_THRESHOLD
            } else {
                PointRanges::GAME_THRESHOLD
            };

            let threshold = (goal - 1).saturating_sub(partner_max_hcp);
            Some(CallSemantics {
                shows: vec![HandConstraint::MaxHcp(threshold)],
                rule_name: self.name(call),
                description: format!(
                    "Pass showing no interest in competing further (max {} HCP)",
                    threshold
                ),
            })
        } else {
            None
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
        let semantics = SupportLimit.get_semantics(&auction_model, &call).unwrap();
        assert!(hand_model.satisfies_all(semantics.shows));
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
        let semantics = NoTrumpLimit.get_semantics(&auction_model, &call).unwrap();
        assert!(hand_model.satisfies_all(semantics.shows));
    }

    #[test]
    fn test_pass_limit_shows_remote_game() {
        let partner_model = PartnerModel {
            max_hcp: Some(15),
            ..Default::default()
        };
        let mut auction = Auction::new(Position::North);
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Spades,
        });
        auction.add_call(Call::Pass);
        let auction_model = AuctionModel {
            auction,
            partner_model,
            ..AuctionModel::default()
        };
        let semantics = PassLimit
            .get_semantics(&auction_model, &Call::Pass)
            .unwrap();
        assert_eq!(semantics.shows, vec![HandConstraint::MaxHcp(9)]);
    }
}
