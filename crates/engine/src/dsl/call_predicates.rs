use crate::nbk::AuctionModel;
use std::fmt::Debug;
use types::{Call, Strain};

pub trait CallPredicate: Send + Sync + Debug {
    fn check(&self, auction: &AuctionModel, call: &Call) -> bool;
}

#[derive(Debug)]
pub struct NotCall(pub Box<dyn CallPredicate>);
impl CallPredicate for NotCall {
    fn check(&self, auction: &AuctionModel, call: &Call) -> bool {
        !self.0.check(auction, call)
    }
}

pub fn not_call(predicate: impl CallPredicate + 'static) -> NotCall {
    NotCall(Box::new(predicate))
}

#[derive(Debug)]
pub struct IsLevel(pub u8);
impl CallPredicate for IsLevel {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        match call {
            Call::Bid { level, .. } => *level == self.0,
            _ => false,
        }
    }
}

#[derive(Debug)]
pub struct IsCall(pub u8, pub Strain);
impl CallPredicate for IsCall {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        match call {
            Call::Bid { level, strain } => *level == self.0 && *strain == self.1,
            _ => false,
        }
    }
}

#[derive(Debug)]
pub struct IsStrain(pub Strain);
impl CallPredicate for IsStrain {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        match call {
            Call::Bid { strain, .. } => *strain == self.0,
            _ => false,
        }
    }
}

#[derive(Debug)]
pub struct IsNotrump;
impl CallPredicate for IsNotrump {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        matches!(
            call,
            Call::Bid {
                strain: Strain::Notrump,
                ..
            }
        )
    }
}

#[derive(Debug)]
pub struct IsSuit;
impl CallPredicate for IsSuit {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        match call {
            Call::Bid { strain, .. } => strain.to_suit().is_some(),
            _ => false,
        }
    }
}

#[derive(Debug)]
pub struct IsNewSuit;
impl CallPredicate for IsNewSuit {
    fn check(&self, auction: &AuctionModel, call: &Call) -> bool {
        match call {
            Call::Bid { strain, .. } => {
                if let Some(suit) = strain.to_suit() {
                    !auction.partner_hand().has_shown_suit(suit)
                        && !auction.bidder_hand().has_shown_suit(suit)
                } else {
                    false
                }
            }
            _ => false,
        }
    }
}

#[derive(Debug)]
pub struct IsMajorSuit;
impl CallPredicate for IsMajorSuit {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        match call {
            Call::Bid { strain, .. } => strain.is_major(),
            _ => false,
        }
    }
}

#[derive(Debug)]
pub struct IsMinorSuit;
impl CallPredicate for IsMinorSuit {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        match call {
            Call::Bid { strain, .. } => strain.is_minor(),
            _ => false,
        }
    }
}

#[derive(Debug)]
pub struct MinLevel(pub u8);
impl CallPredicate for MinLevel {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        match call {
            Call::Bid { level, .. } => *level >= self.0,
            _ => false,
        }
    }
}

#[derive(Debug)]
pub struct MaxLevel(pub u8);
impl CallPredicate for MaxLevel {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        match call {
            Call::Bid { level, .. } => *level <= self.0,
            _ => false,
        }
    }
}

/// Returns the minimum legal level for a given strain, based on the last bid in the auction.
/// Returns None if there is no previous bid.
fn min_level_for_strain(auction: &AuctionModel, strain: Strain) -> Option<u8> {
    let last_bid = auction.auction.calls.iter().rev().find_map(|c| match c {
        Call::Bid {
            level,
            strain: last_strain,
        } => Some((*level, *last_strain)),
        _ => None,
    })?;
    let (last_level, last_strain) = last_bid;
    Some(if strain > last_strain {
        last_level
    } else {
        last_level + 1
    })
}

/// Checks if a bid is a jump (at least one level higher than necessary).
#[derive(Debug)]
pub struct IsJump;
impl CallPredicate for IsJump {
    fn check(&self, auction: &AuctionModel, call: &Call) -> bool {
        if let Call::Bid { level, strain } = call {
            if let Some(min_level) = min_level_for_strain(auction, *strain) {
                return *level > min_level;
            }
        }
        false
    }
}

#[derive(Debug)]
pub struct IsPass;
impl CallPredicate for IsPass {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        matches!(call, Call::Pass)
    }
}

#[derive(Debug)]
pub struct BidderHasShownSuit;
impl CallPredicate for BidderHasShownSuit {
    fn check(&self, auction: &AuctionModel, call: &Call) -> bool {
        if let Call::Bid { strain, .. } = call {
            if let Some(suit) = strain.to_suit() {
                return auction.bidder_hand().has_shown_suit(suit);
            }
        }
        false
    }
}

#[derive(Debug)]
pub struct PartnerHasShownSuit;
impl CallPredicate for PartnerHasShownSuit {
    fn check(&self, auction: &AuctionModel, call: &Call) -> bool {
        if let Call::Bid { strain, .. } = call {
            if let Some(suit) = strain.to_suit() {
                return auction.partner_hand().has_shown_suit(suit);
            }
        }
        false
    }
}

/// Checks that no opponent has shown the same suit as this call.
/// Uses opponent HandModels (semantic meaning) rather than raw bid strains,
/// so conventional bids like Stayman (2C) won't be treated as showing clubs.
#[derive(Debug)]
pub struct OpponentHasNotShownSuit;
impl CallPredicate for OpponentHasNotShownSuit {
    fn check(&self, auction: &AuctionModel, call: &Call) -> bool {
        if let Call::Bid { strain, .. } = call {
            if let Some(suit) = strain.to_suit() {
                return !auction.lho_hand().has_shown_suit(suit)
                    && !auction.rho_hand().has_shown_suit(suit);
            }
        }
        true
    }
}
