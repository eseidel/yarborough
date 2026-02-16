use crate::nbk::{AuctionModel, HandConstraint, PointRanges};
use bridge_core::{Call, Shape, Suit};
use std::fmt::Debug;

pub trait Shows: Send + Sync + Debug {
    fn show(&self, auction: &AuctionModel, call: &Call) -> Vec<HandConstraint>;
}

#[derive(Debug)]
pub struct ShowMinHcp(pub u8);
impl Shows for ShowMinHcp {
    fn show(&self, _auction: &AuctionModel, _call: &Call) -> Vec<HandConstraint> {
        vec![HandConstraint::MinHcp(self.0)]
    }
}

#[derive(Debug)]
pub struct ShowMaxHcp(pub u8);
impl Shows for ShowMaxHcp {
    fn show(&self, _auction: &AuctionModel, _call: &Call) -> Vec<HandConstraint> {
        vec![HandConstraint::MaxHcp(self.0)]
    }
}

#[derive(Debug)]
pub struct ShowHcpRange(pub u8, pub u8);
impl Shows for ShowHcpRange {
    fn show(&self, _auction: &AuctionModel, _call: &Call) -> Vec<HandConstraint> {
        vec![
            HandConstraint::MinHcp(self.0),
            HandConstraint::MaxHcp(self.1),
        ]
    }
}

#[derive(Debug)]
pub struct ShowMinLength(pub Suit, pub u8);
impl Shows for ShowMinLength {
    fn show(&self, _auction: &AuctionModel, _call: &Call) -> Vec<HandConstraint> {
        vec![HandConstraint::MinLength(self.0, self.1)]
    }
}

#[derive(Debug)]
pub struct ShowBalanced;
impl Shows for ShowBalanced {
    fn show(&self, _auction: &AuctionModel, _call: &Call) -> Vec<HandConstraint> {
        vec![HandConstraint::MaxUnbalancedness(Shape::Balanced)]
    }
}

#[derive(Debug)]
pub struct ShowMinSuitLength(pub u8);
impl Shows for ShowMinSuitLength {
    fn show(&self, _auction: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
        if let Call::Bid { strain, .. } = call {
            if let Some(suit) = strain.to_suit() {
                return vec![HandConstraint::MinLength(suit, self.0)];
            }
        }
        vec![]
    }
}

#[derive(Debug)]
pub struct ShowSufficientValues;
impl Shows for ShowSufficientValues {
    fn show(&self, auction: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
        let (level, strain) = match call {
            Call::Bid { level, strain } => (*level, *strain),
            _ => return vec![],
        };

        let min_combined_points = if strain.to_suit().is_some() {
            PointRanges::min_points_for_suited_bid(level)
        } else {
            PointRanges::min_points_for_nt_bid(level)
        };

        let partner_min = auction.partner_model.min_hcp.unwrap_or(0);
        let needed_hcp = min_combined_points.saturating_sub(partner_min);

        vec![HandConstraint::MinHcp(needed_hcp)]
    }
}

#[derive(Debug)]
pub struct ShowOpeningSuitLength;
impl Shows for ShowOpeningSuitLength {
    fn show(&self, _auction: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
        if let Call::Bid { strain, .. } = call {
            if let Some(suit) = strain.to_suit() {
                let length = if suit.is_major() { 5 } else { 4 };
                return vec![HandConstraint::MinLength(suit, length)];
            }
        }
        vec![]
    }
}

#[derive(Debug)]
pub struct ShowPreemptLength;
impl Shows for ShowPreemptLength {
    fn show(&self, _auction: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
        if let Call::Bid { level, strain, .. } = call {
            if let Some(suit) = strain.to_suit() {
                return vec![HandConstraint::MinLength(suit, level + 4)];
            }
        }
        vec![]
    }
}

#[derive(Debug)]
pub struct ShowRuleOfTwenty;
impl Shows for ShowRuleOfTwenty {
    fn show(&self, _auction: &AuctionModel, _call: &Call) -> Vec<HandConstraint> {
        vec![HandConstraint::RuleOfTwenty]
    }
}

#[derive(Debug)]
pub struct ShowRuleOfFifteen;
impl Shows for ShowRuleOfFifteen {
    fn show(&self, _auction: &AuctionModel, _call: &Call) -> Vec<HandConstraint> {
        vec![HandConstraint::RuleOfFifteen]
    }
}

#[derive(Debug)]
pub struct ShowMaxLength(pub u8);
impl Shows for ShowMaxLength {
    fn show(&self, _auction: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
        if let Call::Bid { strain, .. } = call {
            if let Some(suit) = strain.to_suit() {
                return vec![HandConstraint::MaxLength(suit, self.0)];
            }
        }
        vec![]
    }
}

#[derive(Debug)]
pub struct ShowSemiBalanced;
impl Shows for ShowSemiBalanced {
    fn show(&self, _auction: &AuctionModel, _call: &Call) -> Vec<HandConstraint> {
        vec![HandConstraint::MaxUnbalancedness(Shape::SemiBalanced)]
    }
}

#[derive(Debug)]
pub struct ShowSupportValues;
impl Shows for ShowSupportValues {
    fn show(&self, auction: &AuctionModel, call: &Call) -> Vec<HandConstraint> {
        if let Call::Bid { level, .. } = call {
            const SUPPORT_VALUES: [u8; 7] = [18, 18, 22, 25, 28, 33, 37];
            let min_combined_points = SUPPORT_VALUES[*level as usize - 1];
            let needed_hcp =
                min_combined_points.saturating_sub(auction.partner_model.min_hcp.unwrap_or(0));
            return vec![HandConstraint::MinHcp(needed_hcp)];
        }
        vec![]
    }
}

#[derive(Debug)]
pub struct ShowSupportLength;
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

#[derive(Debug)]
pub struct ShowBetterContractIsRemote;
impl Shows for ShowBetterContractIsRemote {
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
