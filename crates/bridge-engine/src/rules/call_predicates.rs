use crate::nbk::AuctionModel;
use bridge_core::{Call, Strain};
use std::fmt::Debug;

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
pub struct IsUnbidSuit;
impl CallPredicate for IsUnbidSuit {
    fn check(&self, auction: &AuctionModel, call: &Call) -> bool {
        match call {
            Call::Bid { strain, .. } => {
                if let Some(suit) = strain.to_suit() {
                    !auction.partner_model.has_shown_suit(suit)
                        && !auction.bidder_model.has_shown_suit(suit)
                } else {
                    false
                }
            }
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
pub struct IsPass;
impl CallPredicate for IsPass {
    fn check(&self, _auction: &AuctionModel, call: &Call) -> bool {
        matches!(call, Call::Pass)
    }
}
