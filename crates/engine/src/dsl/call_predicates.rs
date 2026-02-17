use crate::kernel::AuctionModel;
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
        call.level() == Some(self.0)
    }
}

#[derive(Debug)]
pub struct IsCall(pub u8, pub Strain);
impl CallPredicate for IsCall {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        let (level, strain) = (self.0, self.1);
        call.level() == Some(level) && call.strain() == Some(strain)
    }
}

#[derive(Debug)]
pub struct IsStrain(pub Strain);
impl CallPredicate for IsStrain {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        call.strain() == Some(self.0)
    }
}

#[derive(Debug)]
pub struct IsNotrump;
impl CallPredicate for IsNotrump {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        call.strain() == Some(Strain::Notrump)
    }
}

#[derive(Debug)]
pub struct IsSuit;
impl CallPredicate for IsSuit {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        call.suit().is_some()
    }
}

#[derive(Debug)]
pub struct IsNewSuit;
impl CallPredicate for IsNewSuit {
    fn check(&self, auction: &AuctionModel, call: &Call) -> bool {
        if let Some(suit) = call.suit() {
            !auction.partner_hand().has_shown_suit(suit)
                && !auction.bidder_hand().has_shown_suit(suit)
        } else {
            false
        }
    }
}

#[derive(Debug)]
pub struct IsMajorSuit;
impl CallPredicate for IsMajorSuit {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        call.strain().map(|s| s.is_major()).unwrap_or(false)
    }
}

#[derive(Debug)]
pub struct IsMinorSuit;
impl CallPredicate for IsMinorSuit {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        call.strain().map(|s| s.is_minor()).unwrap_or(false)
    }
}

#[derive(Debug)]
pub struct MinLevel(pub u8);
impl CallPredicate for MinLevel {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        call.level().map(|l| l >= self.0).unwrap_or(false)
    }
}

#[derive(Debug)]
pub struct MaxLevel(pub u8);
impl CallPredicate for MaxLevel {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        call.level().map(|l| l <= self.0).unwrap_or(false)
    }
}

/// Returns the minimum legal level for a given strain, based on the last bid in the auction.
/// Returns None if there is no previous bid.
fn min_level_for_strain(auction: &AuctionModel, strain: Strain) -> Option<u8> {
    let (_, last) = auction.auction.last_bid()?;
    let last_level = last.level().unwrap();
    let last_strain = last.strain().unwrap();
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
        if let (Some(level), Some(strain)) = (call.level(), call.strain()) {
            if let Some(min_level) = min_level_for_strain(auction, strain) {
                return level == min_level + 1;
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
        if let Some(suit) = call.suit() {
            return auction.bidder_hand().has_shown_suit(suit);
        }
        false
    }
}

#[derive(Debug)]
pub struct PartnerHasShownSuit;
impl CallPredicate for PartnerHasShownSuit {
    fn check(&self, auction: &AuctionModel, call: &Call) -> bool {
        if let Some(suit) = call.suit() {
            return auction.partner_hand().has_shown_suit(suit);
        }
        false
    }
}

#[derive(Debug)]
pub struct IsDouble;
impl CallPredicate for IsDouble {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        matches!(call, Call::Double)
    }
}

/// Checks that no opponent has shown the same suit as this call.
/// Uses opponent HandModels (semantic meaning) rather than raw bid strains,
/// so conventional bids like Stayman (2C) won't be treated as showing clubs.
#[derive(Debug)]
pub struct OpponentHasNotShownSuit;
impl CallPredicate for OpponentHasNotShownSuit {
    fn check(&self, auction: &AuctionModel, call: &Call) -> bool {
        if let Some(suit) = call.suit() {
            return !auction.lho_hand().has_shown_suit(suit)
                && !auction.rho_hand().has_shown_suit(suit);
        }
        true
    }
}
